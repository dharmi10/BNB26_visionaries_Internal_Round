"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError, entries, fmtTime, LocalEntry, money, randId, session, usePoll } from "@/lib/api";
import { b64, blindToken, receiptId, unb64, verifyReceiptSig } from "@/lib/fdcrypto";
import { Badge, Button, Callout, Card, CardTitle, Hash, Spinner, StateBadge } from "@/components/ui";
import { Check, Circle, Loader2, X } from "lucide-react";

type Step = { id: string; label: string; status: "todo" | "run" | "ok" | "fail"; note?: string };
const initial: Step[] = [
  { id: "elig", label: "Eligibility check (verified before the cutoff)", status: "todo" },
  { id: "blind", label: "Browser creates a random secret token and blinds it", status: "todo" },
  { id: "sign", label: "Server checks one-token-per-identity and signs the blinded token", status: "todo" },
  { id: "unblind", label: "Browser unblinds the signature (server never saw the token)", status: "todo" },
  { id: "reg", label: "Register token + signature with no session attached", status: "todo" },
  { id: "rcpt", label: "Signed receipt received and verified locally", status: "todo" },
];

export default function Enter() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: d } = usePoll(() => api<any>(`/drops/${id}`), 1500, [id]);
  const [sess, setSess] = useState(session.get());
  const [tier, setTier] = useState("");
  const [steps, setSteps] = useState<Step[]>(initial);
  const [err, setErr] = useState<{ code: string; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState<LocalEntry | null>(null);

  useEffect(() => { setSess(session.get()); setLocal(entries.get(id)); }, [id]);
  useEffect(() => { if (d && !tier) setTier(d.tiers[0].id); }, [d, tier]);
  useEffect(() => { if (sess === null && typeof window !== "undefined" && !session.get()) router.replace(`/login?next=/enter/${id}`); }, [sess, id, router]);

  const set = (sid: string, status: Step["status"], note?: string) => setSteps((s) => s.map((x) => (x.id === sid ? { ...x, status, note } : x)));
  const eligible = d && sess ? sess.verified_at_ms <= d.cutoff_at_ms : null;

  const finishReceipt = async (le: LocalEntry, r: any) => {
    const ok = await verifyReceiptSig(d.receipt_public_key, id, r.receipt_id, r.tier, r.arrival_ms, r.server_sig);
    const full = { ...le, receipt: { ...r, sig_ok: ok } };
    entries.set(full); setLocal(full);
    set("rcpt", ok ? "ok" : "fail", ok ? "signature verified with the drop's published key" : "receipt signature did not verify!");
  };

  const enter = async () => {
    setErr(null); setBusy(true); setSteps(initial);
    try {
      set("elig", "run");
      if (!eligible) throw new ApiError(403, "not_eligible", {});
      set("elig", "ok", `verified ${fmtTime(sess!.verified_at_ms)} ≤ cutoff ${fmtTime(d.cutoff_at_ms)}`);
      let le = entries.get(id);
      if (le && !le.sig) le = null;
      if (!le) {
        set("blind", "run");
        const bt = await blindToken(d.public_key_jwk, d.token_mode);
        set("blind", "ok", d.token_mode === "blind" ? "RFC 9474 RSABSSA-SHA384-PSS" : "fallback: token sent unblinded");
        set("sign", "run");
        let bs: any;
        for (let i = 0; ; i++) {
          try { bs = await api(`/drops/${id}/token`, { body: { blinded_msg: b64(bt.blinded), tier }, auth: "user", idem: true }); break; }
          catch (e: any) { if (e.status === 429 && i < 6) { await new Promise((r) => setTimeout(r, 600 + i * 400)); continue; } throw e; }
        }
        set("sign", "ok");
        set("unblind", "run");
        const sig = await bt.finalize(unb64(bs.blind_sig));
        set("unblind", "ok");
        le = { drop_id: id, token_msg: b64(bt.msg), sig: b64(sig), tier, idem: randId() };
        entries.set(le); setLocal(le); // persist BEFORE registering: a crash here is recoverable
      } else { ["blind", "sign", "unblind"].forEach((s) => set(s, "ok", "resumed from this device")); }
      set("reg", "run");
      let rec: any;
      for (let i = 0; ; i++) {
        try { rec = await api(`/drops/${id}/register`, { body: { token_msg: le.token_msg, sig: le.sig, tier: le.tier }, headers: { "Idempotency-Key": le.idem } }); break; }
        catch (e: any) { if ((e.status === 429 || e.status >= 500) && i < 8) { await new Promise((r) => setTimeout(r, 500 + i * 400)); continue; } throw e; }
      }
      set("reg", "ok", `accepted by ${rec.replica}`);
      set("rcpt", "run");
      await finishReceipt(le, rec);
    } catch (e: any) {
      const code = e.code || "error";
      const msg: Record<string, string> = {
        not_eligible: "Not eligible: your phone was verified after this drop's cutoff. You can still browse, but you can't enter.",
        already_issued: "You already received an entry token for this drop on another device or session. One verified identity gets exactly one entry.",
        window_closed: "The entry window has closed.", not_open_yet: "The window hasn't opened yet.",
        token_spent: "This token has already been registered (your receipt exists). Open your status page.",
        rate_limited: "The site is busy (rate limited to keep it up). Wait a moment and try again; this never affects your odds.",
        bad_sig: "The token signature was rejected.",
      };
      setErr({ code, msg: msg[code] || `${e.message}` });
      setSteps((s) => s.map((x) => (x.status === "run" ? { ...x, status: "fail" } : x)));
    }
    setBusy(false);
  };

  if (!d) return <Spinner label="loading drop" />;
  if (d.mode === "fcfs") return <Callout tone="warn">This is a classic first-come-first-served sale. <Link className="underline" href={`/baseline/${id}`}>Open the classic page</Link>.</Callout>;
  const done = local?.receipt;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">Enter: {d.event_name}</h1><StateBadge state={d.state} /></div>
      {eligible === false && <Callout tone="bad" title="Not eligible for this drop">Your phone was verified at {fmtTime(sess!.verified_at_ms)}, after the eligibility cutoff ({fmtTime(d.cutoff_at_ms)}). Accounts created during a drop can't enter, so mass-created accounts get zero entries. You can still browse.</Callout>}
      {d.state !== "OPEN" && !done && <Callout tone="warn" title={`Window is ${d.state}`}>{d.state === "SCHEDULED" ? `Opens ${fmtTime(d.opens_at_ms)}.` : "Entries are closed."}</Callout>}

      {!done && (
        <Card className="space-y-4">
          <CardTitle>Pick a tier</CardTitle>
          <div className="grid gap-2 sm:grid-cols-3">
            {d.tiers.map((t: any) => (
              <button key={t.id} onClick={() => setTier(t.id)} className={`rounded-xl border p-3 text-left ${tier === t.id ? "border-accent bg-accent/10" : "border-line hover:border-accent/40"}`}>
                <div className="font-semibold">{t.name}</div><div className="text-sm text-mute">{money(t.price_cents)} · {t.seats} seats</div>
              </button>
            ))}
          </div>
          <Button size="lg" className="w-full" disabled={busy || d.state !== "OPEN" || eligible === false || !sess} onClick={enter}>{busy ? "Entering…" : "Enter the drop"}</Button>
          <p className="text-xs text-mute">Arrival time does not affect your chances. Your secret token never leaves this browser until you register it (and the server cannot link it to your account).</p>
        </Card>
      )}

      {(busy || err || done) && (
        <Card>
          <CardTitle>What your browser is doing</CardTitle>
          <ul className="space-y-2 text-sm">
            {steps.map((s) => (
              <li key={s.id} className="flex items-start gap-3">
                <span className="mt-0.5">{s.status === "ok" ? <Check className="h-4 w-4 text-ok" /> : s.status === "run" ? <Loader2 className="h-4 w-4 animate-spin text-accent" /> : s.status === "fail" ? <X className="h-4 w-4 text-bad" /> : <Circle className="h-4 w-4 text-line" />}</span>
                <div><div className={s.status === "todo" ? "text-mute" : ""}>{s.label}</div>{s.note && <div className="text-xs text-mute">{s.note}</div>}</div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {err && <Callout tone={err.code === "not_eligible" ? "bad" : "warn"} title={err.code}>{err.msg} {err.code === "token_spent" && <Link className="underline" href={`/status/${id}`}>View status</Link>}</Callout>}

      {done && (
        <Card className="space-y-3 border-ok/40">
          <div className="flex items-center justify-between"><h2 className="text-lg font-bold text-ok">You're in. Receipt accepted.</h2><Badge tone={done.sig_ok ? "green" : "red"}>{done.sig_ok ? "signature verified" : "SIGNATURE INVALID"}</Badge></div>
          <Callout tone="ok">Arrival time does not affect your chances. Everyone who enters before the window closes has exactly the same odds.</Callout>
          <Hash label="Receipt ID" v={done.receipt_id} />
          <div className="grid grid-cols-2 gap-3 text-sm"><div><div className="text-xs uppercase text-mute">Tier</div><b>{done.tier}</b></div><div><div className="text-xs uppercase text-mute">Recorded arrival</div><b>{fmtTime(done.arrival_ms)}</b> <span className="text-mute">(not used in the draw)</span></div></div>
          <div className="text-xs text-mute">Token secret and receipt are stored in this browser (localStorage). Download a copy: you need the token secret to claim a seat, and the receipt is your proof if the server drops your entry.</div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => { const blob = new Blob([JSON.stringify(local, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `fairdrop-receipt-${id}.json`; a.click(); }}>Download receipt + token</Button>
            <Link href={`/status/${id}`}><Button size="sm">Go to my status</Button></Link>
          </div>
        </Card>
      )}
    </div>
  );
}
