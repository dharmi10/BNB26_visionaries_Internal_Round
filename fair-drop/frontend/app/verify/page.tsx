"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, entries, usePoll } from "@/lib/api";
import { Bundle, Check, verifyBundle } from "@/lib/fdcrypto";
import { Button, Callout, Card, CardTitle, Input, Label, Select, Spinner } from "@/components/ui";

function Verify() {
  const qs = useSearchParams();
  const { data: drops } = usePoll(() => api<any[]>("/drops"), 4000);
  const [drop, setDrop] = useState(qs.get("drop") || "");
  const [receipt, setReceipt] = useState(qs.get("receipt") || "");
  const [rootAtLock, setRootAtLock] = useState("");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<{ ok: boolean; checks: Check[]; ms: number; n: number; beacon?: any } | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (drop && !receipt) { const e = entries.get(drop); if (e?.receipt) setReceipt(e.receipt.receipt_id); if (e?.root_at_lock) setRootAtLock(e.root_at_lock); }
    else if (drop) { const e = entries.get(drop); if (e?.root_at_lock && !rootAtLock) setRootAtLock(e.root_at_lock); }
  }, [drop]); // eslint-disable-line

  const run = async () => {
    setBusy(true); setErr(""); setOut(null);
    try {
      const t0 = performance.now();
      const b = await api<Bundle>(`/drops/${drop}/verify`);
      await new Promise((r) => setTimeout(r, 30)); // let the spinner paint before the CPU-bound work
      const r = verifyBundle(b, receipt.trim() || undefined, rootAtLock.trim() || undefined);
      setOut({ ...r, ms: performance.now() - t0, n: b.entries.length, beacon: b.beacon });
    } catch (e: any) { setErr(e.code === "not_drawn" ? "This drop hasn't been drawn yet. The verification bundle appears when the seed is revealed." : String(e.message)); }
    setBusy(false);
  };
  useEffect(() => { if (qs.get("drop") && drops?.find((d) => d.id === qs.get("drop") && ["DRAWN", "CLAIM", "SETTLED"].includes(d.state)) && !out && !busy && !err) run(); }, [drops]); // eslint-disable-line

  const missing = out?.checks.find((c) => c.name.startsWith("YOUR RECEIPT") && !c.ok);
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-2xl font-bold">Verify a draw</h1>
      <p className="text-sm text-mute">Nothing here trusts the server. Your browser downloads the public bundle (seed, entry list, results) and recomputes the Merkle root, the final randomness, every score and the full winner/waitlist order itself.</p>
      <Card className="space-y-3">
        <div><Label>Drop</Label>
          <Select value={drop} onChange={(e) => setDrop(e.target.value)}><option value="">Select a drawn drop…</option>
            {(drops || []).filter((d) => d.mode === "fairdrop").map((d) => <option key={d.id} value={d.id}>{d.event_name} · {d.id} · {d.state}</option>)}</Select></div>
        <div><Label>Your receipt id (optional, checks your own inclusion & outcome)</Label><Input className="mono" value={receipt} onChange={(e) => setReceipt(e.target.value)} placeholder="64 hex characters" /></div>
        <div><Label>Merkle root you saw when the list locked (optional, auto-filled from this browser)</Label><Input className="mono" value={rootAtLock} onChange={(e) => setRootAtLock(e.target.value)} /></div>
        <Button onClick={run} disabled={!drop || busy}>{busy ? "Verifying…" : "Verify in my browser"}</Button>
      </Card>
      {busy && <Spinner label="downloading bundle and recomputing the draw" />}
      {err && <Callout tone="warn">{err}</Callout>}
      {out && (
        <>
          {missing ? (
            <Callout tone="bad" title="🚨 RED: INCONSISTENCY DETECTED. YOUR RECEIPT IS NOT IN THE LOCKED LIST">
              The server accepted your entry (you hold its signature) but the published entry list does not contain it. That is cryptographic proof the server removed or ignored your entry.
              Keep your receipt file: the signature on it is evidence anyone can check.
            </Callout>
          ) : out.ok ? (
            <Callout tone="ok" title="🟢 GREEN: cryptographically verified">All {out.checks.length} checks passed on {out.n.toLocaleString()} entries in {out.ms.toFixed(0)} ms, computed in this browser.</Callout>
          ) : (
            <Callout tone="bad" title="🔴 RED: INCONSISTENCY DETECTED">At least one recomputation does not match what the server published. See failing checks below.</Callout>
          )}
          <Card>
            <CardTitle>Checks</CardTitle>
            <ul className="space-y-2 text-sm">
              {out.checks.map((c, i) => (
                <li key={i} className="flex gap-3"><span className={c.ok ? "text-ok" : "text-bad"}>{c.ok ? "✔" : "✘"}</span><div><div className={c.ok ? "" : "font-semibold text-bad"}>{c.name}</div>{c.detail && <div className="text-xs text-mute">{c.detail}</div>}</div></li>
              ))}
            </ul>
          </Card>
          <Card className="space-y-2 text-xs text-mute">
            <div>Beacon: {out.beacon ? <>drand quicknet round <b className="text-ink">{out.beacon.round}</b>. Cross-check it independently at <span className="mono">api.drand.sh/{out.beacon.chain || "52db9ba7…"}/public/{out.beacon.round}</span> (BLS signature verification is left to drand clients).</> : "none was mixed into this draw (the audit log records why)."}</div>
            <div>Independent re-implementation: <span className="mono">python verifier/verify.py --url http://localhost:8088/api --drop {drop}{receipt ? ` --receipt ${receipt}` : ""}</span></div>
            <div>Formats: leaf = SHA256(00‖receipt‖1f‖tier), node = SHA256(01‖L‖R), final = SHA256("fairdrop/final/v1"‖seed‖root‖flag[‖beacon]), score = SHA256("fairdrop/score/v1"‖final‖receipt), lowest score wins.</div>
          </Card>
        </>
      )}
    </div>
  );
}
export default function Page() { return <Suspense><Verify /></Suspense>; }
