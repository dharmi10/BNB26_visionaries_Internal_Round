"use client";
import { useState } from "react";
import { api, fmtTime, testKey, usePoll } from "@/lib/api";
import { Badge, Button, Callout, Card, CardTitle, Spinner, Stat } from "@/components/ui";

export default function AuditTab({ dropId }: { dropId: string }) {
  const [chain, setChain] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const { data: integ, reload: rI } = usePoll(() => (dropId ? api<any>(`/admin/drops/${dropId}/integrity`, { auth: "admin" }) : Promise.resolve(null)), 3000, [dropId]);
  const { data: log, reload: rL } = usePoll(() => (dropId ? api<any>(`/admin/drops/${dropId}/audit?limit=60`, { auth: "admin" }) : Promise.resolve(null)), 3000, [dropId]);
  if (!dropId) return <Callout tone="info">Select a drop in the Drops tab.</Callout>;
  const verify = async () => { setBusy(true); try { const r = await api<any>(`/admin/drops/${dropId}/audit?limit=1&verify=1`, { auth: "admin" }); setChain(r.chain); } finally { setBusy(false); } };
  const tamper = async (repair: boolean) => {
    try { const r = await api<any>("/test/tamper-audit", { body: { repair }, headers: { "X-Test-Key": testKey.get() } }); setNote(repair ? `repaired ${r.repaired_rows} row(s)` : `edited stored audit row #${r.tampered_seq} (a trailing space)`); setChain(null); rL(); }
    catch (e: any) { setNote(e.message); }
  };
  const v = integ?.violations || {};
  const rows: [string, string][] = [["oversold", "seats sold beyond capacity"], ["duplicate_entries", "entries beyond issued tokens"], ["duplicate_seats", "a seat or receipt allocated twice"], ["missing_receipts", "accepted receipts absent from the Merkle tree"], ["broken_merkle", "published root ≠ recomputed root"], ["invalid_transitions", "illegal state changes applied"]];
  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <CardTitle right={integ && <Badge tone={integ.ok ? "green" : "red"}>{integ.ok ? "ALL INTEGRITY COUNTS ZERO" : `${integ.total_violations} VIOLATION(S)`}</Badge>}>Integrity panel</CardTitle>
        {!integ ? <Spinner /> : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {rows.map(([k, d]) => <Stat key={k} label={k.replace(/_/g, " ")} value={v[k] === null || v[k] === undefined ? "pending" : v[k]} sub={d} tone={v[k] > 0 ? "bad" : v[k] === 0 ? "ok" : "warn"} />)}
          </div>
        )}
        {integ?.violations?.missing_receipts > 0 && <Callout tone="bad" title="Missing receipt(s) detected">The independent audit log recorded an accepted entry that is absent from the published Merkle tree: {integ.info.missing_receipt_examples?.join(", ")}. This is what a malicious server looks like.</Callout>}
        {integ && <div className="text-xs text-mute">tokens issued {integ.info.tokens_issued} · entries {integ.info.entries_registered} · allocations (Postgres) {integ.info.allocations_pg} · seats owned (Redis) {integ.info.seats_owned_redis} · blocked reuse attempts {integ.info.rejected_reused_tokens} · ledger lag {integ.info.ledger_lag}</div>}
      </Card>
      <Card className="space-y-3">
        <CardTitle right={<Button size="sm" onClick={verify} disabled={busy}>{busy ? "Verifying…" : "Verify chain"}</Button>}>Hash-chained audit log</CardTitle>
        {chain && (chain.ok ? <Callout tone="ok" title="✔ Chain verified">{chain.length.toLocaleString()} events, each hash commits to the previous one. Head <span className="hash">{chain.head_hash}</span></Callout> : <Callout tone="bad" title={`✘ Chain BROKEN at event #${chain.broken_at}`}>{chain.reason}. Someone modified the permanent record after it was written.</Callout>)}
        <div className="flex flex-wrap items-center gap-2 text-xs text-mute">Tamper-evidence demo (TEST_MODE): <Button size="sm" variant="warn" onClick={() => tamper(false)}>edit a stored event</Button><Button size="sm" variant="secondary" onClick={() => tamper(true)}>repair</Button>{note}</div>
        <div className="max-h-96 overflow-auto"><table className="w-full text-xs"><thead className="sticky top-0 bg-panel text-left text-mute"><tr><th>#</th><th>time</th><th>event</th><th>payload</th><th>hash</th></tr></thead>
          <tbody>{(log?.events || []).map((e: any) => <tr key={e.seq} className="border-t border-line align-top"><td className="py-1 pr-2">{e.seq}</td><td className="pr-2 whitespace-nowrap">{new Date(e.at).toLocaleTimeString()}</td><td className="pr-2 font-semibold">{e.type}</td><td className="pr-2 mono text-mute">{JSON.stringify(e.payload).slice(0, 110)}</td><td className="mono text-mute">{e.hash.slice(0, 12)}…</td></tr>)}</tbody></table></div>
        <div className="text-xs text-mute">{log?.total ?? 0} events for this drop · ledger lag {log?.ledger_lag ?? 0}</div>
      </Card>
    </div>
  );
}
