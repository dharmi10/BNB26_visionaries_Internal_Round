"use client";
import { useRef, useState } from "react";
import { api, testKey, usePoll } from "@/lib/api";
import { Badge, Button, Callout, Card, CardTitle, Input, Label, Select } from "@/components/ui";

const EXPS: [string, string][] = [["exp1", "1 Normal traffic: 50,000 humans, no bots"], ["exp2", "2 Proxy flood: 20 operators × 10 identities, rotating IPs"], ["exp3", "3 Sybil scaling: 100 / 1,000 / 10,000 identities"],
  ["exp4", "4 The 1-human scenario: ~50,000 bot requests + 1 human"], ["exp5", "5 Tarpit: API scrapers vs UI-mimicking bots"], ["exp6", "6 Kill a replica mid-window"], ["exp7", "7 Malicious server drops one entry"], ["all", "All seven"]];

export default function TestLabTab({ dropId }: { dropId: string }) {
  const [key, setKey] = useState(testKey.get());
  const H = () => ({ "X-Test-Key": key });
  const [log, setLog] = useState<{ ok: boolean; t: string }[]>([]);
  const say = (ok: boolean, t: string) => setLog((l) => [{ ok, t }, ...l].slice(0, 12));
  const T = async (label: string, path: string, body: any, method = "POST", base?: string) => {
    try { const r = await api<any>(path, { method, body, headers: H(), base }); say(true, `${label}: ${JSON.stringify(r).slice(0, 200)}`); return r; }
    catch (e: any) { say(false, `${label}: ${e.code || ""} ${e.body?.detail || e.message}`); }
  };
  const [count, setCount] = useState(50000);
  const [reset, setReset] = useState({ window_sec: 3600, claim_sec: 60 });
  const [guard, setGuard] = useState({ enabled: true, ip_limit: 30, acct_limit: 30 });
  const [mal, setMal] = useState({ user_id: "", receipt_id: "" });
  const [exp, setExp] = useState({ experiment: "exp2", scale: 0.1, also_fcfs: true });
  const file = useRef<HTMLInputElement>(null);
  const { data: runs } = usePoll(() => api<any[]>("/runs", { base: "/attack", headers: { "X-Test-Key": testKey.get() } }), 3000);
  const [open, setOpen] = useState("");
  const { data: detail } = usePoll(() => (open ? api<any>(`/runs/${open}`, { base: "/attack", headers: { "X-Test-Key": testKey.get() } }) : Promise.resolve(null)), 2500, [open]);

  const demo = async () => {
    const adm = { auth: "admin" as const };
    try {
      const ev = await api<any>("/admin/events", { ...adm, body: { name: "Aurora Live 2026", venue: "Eden Arena", starts_at: new Date(Date.now() + 30 * 864e5).toISOString(), tiers: [{ name: "Gold", price_cents: 25000, seats: 100 }, { name: "Silver", price_cents: 15000, seats: 150 }, { name: "General", price_cents: 8000, seats: 250 }] } });
      const fd = await api<any>("/admin/drops", { ...adm, body: { event_id: ev.id, window_sec: 900, claim_sec: 45, cutoff_at: new Date(Date.now() + 3600e3).toISOString() } });
      const fc = await api<any>("/admin/drops", { ...adm, body: { event_id: ev.id, mode: "fcfs", window_sec: 900 } });
      say(true, `demo ready: Fair Drop ${fd.id} (cutoff in 1h so new sign-ups can enter) and FCFS baseline ${fc.id}`);
    } catch (e: any) { say(false, e.message); }
  };
  const upload = async (f: File) => {
    try { const j = JSON.parse(await f.text()); const labels = Array.isArray(j) ? j : j.labels; await T("labels", "/test/labels", { labels, replace: true }); } catch (e: any) { say(false, "labels file: " + e.message); }
  };

  return (
    <div className="space-y-5">
      <Callout tone="warn" title="TEST_MODE only">These tools exist only when the backend runs with TEST_MODE=true and a valid X-Test-Key. They are not mounted in production (404).</Callout>
      <Card className="grid gap-3 md:grid-cols-[1fr_auto]"><div><Label>X-Test-Key</Label><Input value={key} onChange={(e) => { setKey(e.target.value); testKey.set(e.target.value); }} className="mono" /></div><Button variant="secondary" className="self-end" onClick={demo}>One-click demo setup (event + Fair Drop + FCFS)</Button></Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3"><CardTitle>Seed synthetic users</CardTitle>
          <p className="text-xs text-mute">Creates verified test identities (<span className="mono">t_000001…</span>, verified in 2000, <span className="mono">is_test=true</span>): no phones, no SMS, no Gmail.</p>
          <div className="flex gap-2"><Input type="number" value={count} onChange={(e) => setCount(+e.target.value)} /><Button onClick={() => T("seed", "/test/seed", { count })}>Seed</Button></div></Card>
        <Card className="space-y-3"><CardTitle>Reset selected drop</CardTitle>
          <p className="text-xs text-mute">Clears entries, tokens, spent set, draw, claims, rate limits, counters; rotates seed + keys; keeps users and labels. Drop: <span className="mono">{dropId || "(select one)"}</span></p>
          <div className="grid grid-cols-2 gap-2"><div><Label>window (s)</Label><Input type="number" value={reset.window_sec} onChange={(e) => setReset({ ...reset, window_sec: +e.target.value })} /></div><div><Label>claim (s)</Label><Input type="number" value={reset.claim_sec} onChange={(e) => setReset({ ...reset, claim_sec: +e.target.value })} /></div></div>
          <Button disabled={!dropId} onClick={() => T("reset", "/test/reset", { drop_id: dropId, state: "OPEN", ...reset })}>Reset to OPEN</Button></Card>
        <Card className="space-y-3"><CardTitle>Defences (availability only)</CardTitle>
          <p className="text-xs text-mute">Rate limits only keep the site up; the draw never sees them. Turn them off to watch the attack hit the app unprotected: allocation still doesn't change.</p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={guard.enabled} onChange={(e) => setGuard({ ...guard, enabled: e.target.checked })} />rate limiting enabled</label>
          <div className="grid grid-cols-2 gap-2"><div><Label>per-IP / s</Label><Input type="number" value={guard.ip_limit} onChange={(e) => setGuard({ ...guard, ip_limit: +e.target.value })} /></div><div><Label>per-account / s</Label><Input type="number" value={guard.acct_limit} onChange={(e) => setGuard({ ...guard, acct_limit: +e.target.value })} /></div></div>
          <Button onClick={() => T("guard", "/test/config", { guard })}>Apply</Button></Card>
        <Card className="space-y-3"><CardTitle>Bot / human labels</CardTitle>
          <p className="text-xs text-mute">JSON array of <span className="mono">{`{user_id, kind: bot|human, operator_id}`}</span>. Evaluation only: never used for allocation.</p>
          <input ref={file} type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /><Button variant="secondary" onClick={() => file.current?.click()}>Upload labels file</Button></Card>
        <Card className="space-y-3"><CardTitle>Malicious-server demo</CardTitle>
          <p className="text-xs text-mute">The server silently drops one chosen entry when the list is locked (and does not log it). Provide a receipt id or the test user who owns it. Then lock the drop and open that fan's verify page.</p>
          <div className="grid grid-cols-2 gap-2"><div><Label>receipt id</Label><Input value={mal.receipt_id} onChange={(e) => setMal({ ...mal, receipt_id: e.target.value })} className="mono" /></div><div><Label>or user id</Label><Input value={mal.user_id} onChange={(e) => setMal({ ...mal, user_id: e.target.value })} className="mono" /></div></div>
          <div className="flex gap-2"><Button variant="danger" disabled={!dropId} onClick={() => T("malicious ON", "/test/malicious", { drop_id: dropId, enabled: true, ...mal })}>Enable (drop 1 entry)</Button><Button variant="secondary" disabled={!dropId} onClick={() => T("malicious OFF", "/test/malicious", { drop_id: dropId, enabled: false })}>Disable</Button></div></Card>
        <Card className="space-y-3"><CardTitle>Run an experiment</CardTitle>
          <Select value={exp.experiment} onChange={(e) => setExp({ ...exp, experiment: e.target.value })}>{EXPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
          <div className="grid grid-cols-2 gap-2"><div><Label>scale (1.0 = 50,000 users)</Label><Input type="number" step="0.05" value={exp.scale} onChange={(e) => setExp({ ...exp, scale: +e.target.value })} /></div><label className="mt-6 flex items-center gap-2 text-sm"><input type="checkbox" checked={exp.also_fcfs} onChange={(e) => setExp({ ...exp, also_fcfs: e.target.checked })} />also run live FCFS</label></div>
          <Button onClick={async () => { const r = await T("run", "/run", exp, "POST", "/attack"); if (r?.id) setOpen(r.id); }}>Run (Locust attack engine)</Button>
          <p className="text-xs text-mute">Results land in <span className="mono">reports/&lt;experiment&gt;/</span> and in the Fairness tab. A full-scale run takes several minutes.</p></Card>
      </div>
      <Card className="space-y-2"><CardTitle>Attack engine runs</CardTitle>
        {(runs || []).slice(0, 8).map((r) => <div key={r.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm"><span className="mono text-xs">{r.id} · scale {r.scale}</span><span className="flex items-center gap-2"><Badge tone={r.status === "running" ? "amber" : r.status === "done" ? "green" : "red"}>{r.status}</Badge><Button size="sm" variant="ghost" onClick={() => setOpen(r.id)}>log</Button></span></div>)}
        {!runs?.length && <div className="text-sm text-mute">No runs yet (is the attack service up?).</div>}
        {detail?.log && <pre className="max-h-64 overflow-auto rounded-lg bg-bg p-3 text-xs text-mute">{detail.log}</pre>}
      </Card>
      <Card><CardTitle>Action log</CardTitle>{log.map((l, i) => <div key={i} className={`text-xs ${l.ok ? "text-ok" : "text-bad"}`}>{l.t}</div>)}{!log.length && <div className="text-xs text-mute">nothing yet</div>}</Card>
    </div>
  );
}
