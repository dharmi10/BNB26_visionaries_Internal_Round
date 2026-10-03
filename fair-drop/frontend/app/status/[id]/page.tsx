"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError, entries, fmtTime, LocalEntry, usePoll } from "@/lib/api";
import { verifyProof, receiptId, unb64 } from "@/lib/fdcrypto";
import { Badge, Button, Callout, Card, CardTitle, Hash, Spinner, StateBadge, Timeline, STATES } from "@/components/ui";

export default function Status() {
  const { id } = useParams<{ id: string }>();
  const { data: d } = usePoll(() => api<any>(`/drops/${id}`), 1500, [id]);
  const [local, setLocal] = useState<LocalEntry | null>(null);
  const [proof, setProof] = useState<{ ok: boolean; missing?: boolean; detail?: string } | null>(null);
  const [result, setResult] = useState<any>(null);
  useEffect(() => { setLocal(entries.get(id)); }, [id]);

  const rid = local?.receipt?.receipt_id || (local ? receiptId(id, unb64(local.token_msg)) : undefined);
  const ord = d ? STATES.indexOf(d.state) : 0;

  // remember the root the first time we see it (it is published BEFORE the seed reveal)
  useEffect(() => {
    if (local && d?.merkle_root && !local.root_at_lock) { const n = { ...local, root_at_lock: d.merkle_root }; entries.set(n); setLocal(n); }
  }, [d?.merkle_root, local]);

  useEffect(() => {
    if (!d || !rid || ord < 3 || !d.merkle_root) return;
    (async () => {
      try {
        const p = await api<any>(`/drops/${id}/proof/${rid}`);
        const ok = verifyProof(p.leaf.receipt_id, p.leaf.tier, p.path, d.merkle_root) && p.merkle_root === d.merkle_root && (!local?.root_at_lock || local.root_at_lock === d.merkle_root);
        setProof({ ok, detail: ok ? `${p.path.length}-step proof against root ${d.merkle_root.slice(0, 16)}…, ${p.entry_count} entries` : "proof did not verify against the published root" });
      } catch (e: any) {
        if (e instanceof ApiError && e.status === 404) setProof({ ok: false, missing: true, detail: `${e.body?.entry_count ?? "?"} entries in the locked list` });
      }
    })();
  }, [d?.merkle_root, d?.state, rid, ord, id, local?.root_at_lock]);

  useEffect(() => {
    if (!d || !rid || ord < 4) return;
    const f = () => api<any>(`/drops/${id}/result/${rid}`).then(setResult).catch(() => {});
    f(); const t = setInterval(f, 2000); return () => clearInterval(t);
  }, [d?.state, rid, ord, id]);

  if (!d) return <Spinner label="loading" />;
  if (!local) return (
    <Card className="space-y-3"><div className="font-semibold">No entry stored in this browser for this drop.</div>
      <p className="text-sm text-mute">If you entered from another device, your token secret and receipt live there. Otherwise <Link className="underline" href={`/enter/${id}`}>enter the drop</Link> (if the window is open).</p></Card>
  );

  const outcome = result?.outcome;
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">{d.event_name}: my entry</h1><StateBadge state={d.state} /></div>
      <Timeline state={d.state} mode={d.mode} />

      {proof?.missing && (
        <Callout tone="bad" title="⚠ INTEGRITY WARNING: YOUR ENTRY IS MISSING FROM THE LOCKED LIST">
          You hold a receipt signed by the server, but its receipt id is <b>not in the published Merkle tree</b>. Either the server dropped your entry after accepting it, or it never counted it.
          That receipt is cryptographic evidence of misconduct. Download it below and keep it; anyone can check the server's signature on it.
          <div className="mt-2 flex gap-2"><Link href={`/verify?drop=${id}&receipt=${rid}`}><Button variant="danger" size="sm">Open full verification</Button></Link></div>
        </Callout>
      )}

      <Card className="space-y-3">
        <CardTitle right={<Badge tone={local.receipt?.sig_ok ? "green" : "amber"}>{local.receipt ? (local.receipt.sig_ok ? "receipt signature verified" : "unverified signature") : "no receipt yet"}</Badge>}>Entry accepted</CardTitle>
        <Hash label="Receipt ID" v={rid} />
        {local.receipt && <div className="text-sm text-mute">Tier <b className="text-ink">{local.receipt.tier}</b> · accepted {fmtTime(local.receipt.arrival_ms)} · <span className="italic">arrival time does not affect your chances</span></div>}
        {!local.receipt && <Callout tone="warn">Your token is stored but we never got a receipt. <Link className="underline" href={`/enter/${id}`}>Retry registration</Link> (safe: it is idempotent).</Callout>}
      </Card>

      <Card className="space-y-3">
        <CardTitle>Locked list & inclusion proof</CardTitle>
        {ord < 3 && <div className="text-sm text-mute">The entry window is still {d.state === "OPEN" ? "open" : d.state.toLowerCase()}. When it closes, the list is locked and its Merkle root published; your browser will then check that your receipt is inside.</div>}
        {ord >= 3 && !proof && <Spinner label="checking inclusion proof in your browser" />}
        {proof?.ok && <Callout tone="ok" title="✔ Your entry is in the locked list">Verified in your browser: {proof.detail}</Callout>}
        {proof && !proof.ok && !proof.missing && <Callout tone="bad" title="Proof failed">{proof.detail}</Callout>}
        <Hash label="Merkle root (published before the seed reveal)" v={d.merkle_root} />
        <Hash label="Seed hash (committed before the drop)" v={d.seed_hash} />
        {d.seed && <Hash label="Seed (revealed after the lock)" v={d.seed} />}
      </Card>

      {ord >= 4 && (
        <Card className="space-y-3">
          <CardTitle>Draw result</CardTitle>
          {!result && <Spinner />}
          {outcome === "won" && <Callout tone="ok" title="🎉 You won a seat">Rank {result.rank} in tier {result.tier}. {ord === 5 ? <Link className="underline" href={`/claim/${id}`}>Claim your seat →</Link> : "Claims open soon."}</Callout>}
          {outcome === "waitlist" && <Callout tone="warn" title={`Waitlisted: position ${result.waitlist_position}`}>If a winner doesn't claim in time, their seat passes down the waitlist in order.</Callout>}
          {outcome === "lost" && <Callout tone="info" title="Not selected">You weren't in the winning or waitlist positions this time.</Callout>}
          {result?.claim && <div className="text-sm text-mute">Claim status: <b className="text-ink">{result.claim.status}</b> {result.claim.promoted && <Badge tone="teal">promoted from waitlist</Badge>}</div>}
          <Link href={`/verify?drop=${id}&receipt=${rid}`}><Button variant="secondary" size="sm">Recompute the whole draw in my browser</Button></Link>
        </Card>
      )}
      <Button variant="ghost" size="sm" onClick={() => { const blob = new Blob([JSON.stringify(local, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `fairdrop-receipt-${id}.json`; a.click(); }}>Download receipt + token</Button>
    </div>
  );
}
