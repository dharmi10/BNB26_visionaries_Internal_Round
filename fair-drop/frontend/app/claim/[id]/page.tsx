"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, entries, LocalEntry, money, seatLabel, session, usePoll } from "@/lib/api";
import { receiptId, unb64 } from "@/lib/fdcrypto";
import SeatMap from "@/components/SeatMap";
import { Button, Callout, Card, CardTitle, Input, Label, Spinner, fmtDur, useCountdown } from "@/components/ui";

export default function Claim() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [local, setLocal] = useState<LocalEntry | null>(null);
  const [card, setCard] = useState({ num: "4242 4242 4242 4242", exp: "12/30", cvc: "123" });
  const [err, setErr] = useState("");
  const [ticket, setTicket] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setLocal(entries.get(id)); if (!session.get()) router.replace(`/login?next=/claim/${id}`); }, [id, router]);
  const rid = local ? receiptId(id, unb64(local.token_msg)) : undefined;
  const { data: d } = usePoll(() => api<any>(`/drops/${id}`), 1500, [id]);
  const { data: res } = usePoll(() => (rid ? api<any>(`/drops/${id}/result/${rid}`) : Promise.resolve(null)), 1500, [id, rid]);
  const { data: seats } = usePoll(() => api<any>(`/drops/${id}/seats`), 2000, [id]);
  const off = d ? d.server_time_ms - Date.now() : 0;
  const left = useCountdown(res?.claim?.status === "reserved" ? res.claim.deadline_ms : undefined, off);

  if (!d || (rid && !res && !ticket)) return <Spinner label="loading" />;
  if (!local) return <Callout tone="warn" title="No token secret on this device">You need the token secret from the browser where you entered (you can import a downloaded receipt file on the status page in a future build). <Link className="underline" href={`/status/${id}`}>Status</Link></Callout>;
  const claim = res?.claim;
  const tier = d.tiers.find((t: any) => t.id === res?.tier);

  const pay = async () => {
    setErr(""); setBusy(true);
    try {
      await new Promise((r) => setTimeout(r, 700)); // mock payment processor
      const t = await api(`/drops/${id}/claim`, { body: { token_msg: local!.token_msg }, auth: "user", idem: true });
      setTicket(t);
    } catch (e: any) {
      setErr({ claim_expired: "Your claim window expired and the seat passed to the next person on the waitlist.", not_winner: "This entry is not currently holding a seat.", not_claim_phase: "Claims are not open (yet).", seat_conflict: "Seat conflict (should never happen)." }[e.code as string] || e.message);
    }
    setBusy(false);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-2xl font-bold">Claim your seat: {d.event_name}</h1>
      {d.state !== "CLAIM" && !ticket && <Callout tone="warn" title={`Drop is ${d.state}`}>{d.state === "SETTLED" ? "Claims are over." : "Claims have not opened yet."}</Callout>}
      {res && res.outcome !== "won" && !ticket && <Callout tone="info" title={res.outcome === "waitlist" ? `You are waitlisted (#${res.waitlist_position})` : "You did not win a seat"}>If a winner misses their claim deadline you'll be promoted automatically. Keep this page open.</Callout>}

      {(claim?.status === "reserved" || ticket) && (
        <>
          <Card className="space-y-4">
            <div className="flex items-start justify-between">
              <div><div className="text-xs uppercase tracking-wider text-mute">Your seat</div><div className="text-3xl font-extrabold text-accent">{seatLabel(res?.tier || ticket?.tier, ticket?.seat_no || claim?.seat_no)}</div><div className="text-sm text-mute">{tier?.name} · {tier && money(tier.price_cents)} {claim?.promoted && "· promoted from the waitlist"}</div></div>
              {!ticket && left !== null && <div className="text-right"><div className="text-xs uppercase tracking-wider text-mute">Claim within</div><div className={`text-3xl font-bold tabular-nums ${left < 10000 ? "text-bad" : ""}`}>{fmtDur(left)}</div></div>}
            </div>
            <Callout tone="info">Proof you own it: your browser holds the token secret whose hash is this entry's receipt id. Only the holder of that secret can claim.</Callout>
            {seats && <SeatMap data={seats} mine={ticket?.seat_no || claim?.seat_no} />}
          </Card>
          {!ticket ? (
            <Card className="space-y-3">
              <CardTitle>Mock payment <span className="ml-2 rounded bg-warn/20 px-2 py-0.5 text-[10px] text-warn">NO REAL MONEY MOVES</span></CardTitle>
              <div className="grid gap-3 sm:grid-cols-3"><div className="sm:col-span-3"><Label>Card number</Label><Input value={card.num} onChange={(e) => setCard({ ...card, num: e.target.value })} /></div><div><Label>Expiry</Label><Input value={card.exp} onChange={(e) => setCard({ ...card, exp: e.target.value })} /></div><div><Label>CVC</Label><Input value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value })} /></div></div>
              <Button size="lg" className="w-full" disabled={busy || left === 0} onClick={pay}>{busy ? "Processing…" : `Pay ${tier ? money(tier.price_cents) : ""} and claim`}</Button>
              {err && <div className="text-sm text-bad">{err}</div>}
            </Card>
          ) : (
            <Callout tone="ok" title="✔ Seat claimed. Payment confirmed (mock)."><Link href={`/ticket/${id}`}><Button className="mt-2">View my ticket</Button></Link></Callout>
          )}
        </>
      )}
      {err && !claim && <div className="text-sm text-bad">{err}</div>}
      {claim?.status === "expired" && <Callout tone="bad" title="Claim expired">Your window ran out and the seat cascaded to the next waitlisted entry.</Callout>}
      {claim?.status === "claimed" && !ticket && <Callout tone="ok" title="You already claimed this seat"><Link className="underline" href={`/ticket/${id}`}>View ticket</Link></Callout>}
    </div>
  );
}
