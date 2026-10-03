"use client";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, fmtTime, usePoll } from "@/lib/api";
import { Badge, Button, Callout, Card, CardTitle, Select, Spinner, Stat } from "@/components/ui";

const C = { fcfs: "#ef476f", naive: "#f59e0b", fairdrop: "#2dd4bf", live: "#9d1c2c" };
const tip = { contentStyle: { background: "#111822", border: "1px solid #243247" } };
const f3 = (x: any) => (x === null || x === undefined ? "n/a" : Number(x).toFixed(3));

function pols(r: any) {
  const P = r.policies || {};
  return [["FCFS", P.fcfs, C.fcfs], ["Naive lottery", P.naive_expected, C.naive], ["Fair Drop", P.fairdrop_expected, C.fairdrop], ...(P.fcfs_live ? [["FCFS (live)", P.fcfs_live, C.live]] : [])] as [string, any, string][];
}

function ExperimentView({ r }: { r: any }) {
  const ps = pols(r).filter((p) => p[1]);
  const opNames = Array.from(new Set(ps.flatMap(([, p]) => Object.keys(p.operators)))).sort((a, b) => Math.max(...ps.map((p) => p[1].operators[b]?.seats || 0)) - Math.max(...ps.map((p) => p[1].operators[a]?.seats || 0))).slice(0, 12);
  const seats = opNames.map((o) => ({ op: o, ...Object.fromEntries(ps.map(([n, p]) => [n, +(p.operators[o]?.seats || 0).toFixed(1)])) }));
  const ratio = ps.map(([n, p, c]) => ({ n, v: p.bot_advantage_ratio ?? 0, c }));
  const hwr = ps.map(([n, p, c]) => ({ n, v: p.human_win_rate ?? 0, c }));
  const share = ps.map(([n, p]) => ({ n, "bot share of seats": +p.bot_seat_share.toFixed(4), "bot share of identities": +p.bot_identity_share.toFixed(4) }));
  const bots = opNames.filter((o) => o !== "humans" && o !== "unknown");
  const cost = bots.map((o) => ({ op: o, ...Object.fromEntries(ps.map(([n, p]) => [n, +(p.operators[o]?.cost_per_seat_usd || 0).toFixed(2)])) }));
  const lat = Object.entries(r.latency || {}).filter(([, v]: any) => v.requests > 20).sort((a: any, b: any) => b[1].requests - a[1].requests).slice(0, 8);
  const integ = r.integrity;
  const v = r.verification;
  return (
    <div className="space-y-5">
      <Callout tone="info" title={r.meta.scenario.description}>{r.meta.actors.toLocaleString()} verified identities ({r.traffic.humans.toLocaleString()} humans, {r.traffic.bot_identities.toLocaleString()} bot identities in {r.meta.operators} operators) · {r.traffic.client_requests.toLocaleString()} client requests · identity cost assumed <b>${r.meta.identity_cost_usd}</b> each. All three policies are computed on the <b>same recorded attempts</b>.</Callout>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Bot advantage: FCFS" value={f3(r.policies.fcfs?.bot_advantage_ratio)} tone="bad" sub="bot seat share ÷ bot identity share" />
        <Stat label="Bot advantage: naive" value={f3(r.policies.naive_expected?.bot_advantage_ratio)} tone="warn" sub="expected over 200 re-draws" />
        <Stat label="Bot advantage: Fair Drop" value={f3(r.policies.fairdrop_expected?.bot_advantage_ratio)} tone="ok" sub="target ≤ 1" />
        <Stat label="Integrity" value={integ ? (integ.ok ? "all zero" : `${integ.total_violations} violation(s)`) : "n/a"} tone={integ?.ok ? "ok" : "bad"} sub={v ? (v.reference_verifier_ok ? "reference verifier: verified" : "reference verifier: FAILED") : ""} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardTitle>Seats per operator (same traffic, three policies)</CardTitle>
          <ResponsiveContainer width="100%" height={280}><BarChart data={seats}><CartesianGrid stroke="#243247" strokeDasharray="3 3" /><XAxis dataKey="op" stroke="#8fa1b8" fontSize={10} angle={-30} textAnchor="end" height={55} /><YAxis stroke="#8fa1b8" fontSize={11} /><Tooltip {...tip} /><Legend />
            {ps.map(([n, , c]) => <Bar key={n} dataKey={n} fill={c} />)}</BarChart></ResponsiveContainer></Card>
        <Card><CardTitle>Bot share of seats vs of identities</CardTitle>
          <ResponsiveContainer width="100%" height={280}><BarChart data={share}><CartesianGrid stroke="#243247" strokeDasharray="3 3" /><XAxis dataKey="n" stroke="#8fa1b8" fontSize={11} /><YAxis stroke="#8fa1b8" fontSize={11} /><Tooltip {...tip} /><Legend />
            <Bar dataKey="bot share of seats" fill="#ef476f" /><Bar dataKey="bot share of identities" fill="#64748b" /></BarChart></ResponsiveContainer></Card>
        <Card><CardTitle>Bot advantage ratio (≤ 1 is the target)</CardTitle>
          <ResponsiveContainer width="100%" height={240}><BarChart data={ratio}><CartesianGrid stroke="#243247" strokeDasharray="3 3" /><XAxis dataKey="n" stroke="#8fa1b8" fontSize={11} /><YAxis stroke="#8fa1b8" fontSize={11} /><Tooltip {...tip} /><ReferenceLine y={1} stroke="#fff" strokeDasharray="4 4" /><Bar dataKey="v" name="ratio" fill="#2dd4bf" /></BarChart></ResponsiveContainer></Card>
        <Card><CardTitle>Human win rate</CardTitle>
          <ResponsiveContainer width="100%" height={240}><BarChart data={hwr}><CartesianGrid stroke="#243247" strokeDasharray="3 3" /><XAxis dataKey="n" stroke="#8fa1b8" fontSize={11} /><YAxis stroke="#8fa1b8" fontSize={11} /><Tooltip {...tip} /><Bar dataKey="v" name="humans won ÷ entered" fill="#38bdf8" /></BarChart></ResponsiveContainer></Card>
        {bots.length > 0 && <Card><CardTitle>Identity cost per seat (USD; 0 = no seat won)</CardTitle>
          <ResponsiveContainer width="100%" height={260}><BarChart data={cost}><CartesianGrid stroke="#243247" strokeDasharray="3 3" /><XAxis dataKey="op" stroke="#8fa1b8" fontSize={10} angle={-30} textAnchor="end" height={55} /><YAxis stroke="#8fa1b8" fontSize={11} /><Tooltip {...tip} /><Legend />
            {ps.map(([n, , c]) => <Bar key={n} dataKey={n} fill={c} />)}</BarChart></ResponsiveContainer>
          <div className="mt-2 text-xs text-mute">Cost = identities bought × ${r.meta.identity_cost_usd} ÷ seats won. This shows what extra odds cost; it does not claim bots are impossible.</div></Card>}
        <Card><CardTitle>Latency, throughput & errors (client observed)</CardTitle>
          <table className="w-full text-xs"><thead><tr className="text-left text-mute"><th>endpoint</th><th className="text-right">req</th><th className="text-right">rps</th><th className="text-right">p50</th><th className="text-right">p95</th><th className="text-right">p99</th><th className="text-right">5xx</th></tr></thead>
            <tbody>{lat.map(([k, x]: any) => <tr key={k} className="border-t border-line"><td className="py-1">{k}</td><td className="text-right">{x.requests}</td><td className="text-right">{x.rps.toFixed(0)}</td><td className="text-right">{x.p50_ms.toFixed(0)}</td><td className="text-right">{x.p95_ms.toFixed(0)}</td><td className="text-right">{x.p99_ms.toFixed(0)}</td><td className={`text-right ${x.errors ? "text-bad" : ""}`}>{x.errors}</td></tr>)}</tbody></table></Card>
      </div>
      {r.extras && Object.keys(r.extras).length > 0 && <Card><CardTitle>Experiment evidence</CardTitle><pre className="overflow-x-auto text-xs text-mute">{JSON.stringify(r.extras, null, 1)}</pre></Card>}
      {v && <Card><CardTitle>Independent verification</CardTitle><ul className="space-y-1 text-xs">{v.checks.map((c: any, i: number) => <li key={i} className={c.ok ? "text-ok" : "text-bad"}>{c.ok ? "✔" : "✘"} {c.name}</li>)}</ul></Card>}
    </div>
  );
}

export default function FairnessTab() {
  const { data: list, reload } = usePoll(() => api<any[]>("/admin/experiments", { auth: "admin" }), 5000);
  const [a, setA] = useState(""); const [b, setB] = useState("");
  const [ra, setRa] = useState<any>(null); const [rb, setRb] = useState<any>(null);
  useEffect(() => { if (a) api(`/admin/experiments/${a}`, { auth: "admin" }).then(setRa); else setRa(null); }, [a]);
  useEffect(() => { if (b) api(`/admin/experiments/${b}`, { auth: "admin" }).then(setRb); else setRb(null); }, [b]);
  useEffect(() => { if (!a && list?.length) setA(list.find((x) => !x.name.includes("live FCFS"))?.id || list[0].id); }, [list, a]);
  return (
    <div className="space-y-5">
      <Callout tone="info">Every number and chart here is read from experiment results recorded by the attack engine (Postgres <span className="mono">experiments</span> table): real traffic, real draws. Nothing is mocked.</Callout>
      <Card className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <div><div className="mb-1 text-xs uppercase text-mute">Experiment</div><Select value={a} onChange={(e) => setA(e.target.value)}><option value="">select…</option>{(list || []).map((x) => <option key={x.id} value={x.id}>{x.name} · {fmtTime(x.created_at)}</option>)}</Select></div>
        <div><div className="mb-1 text-xs uppercase text-mute">Compare with (optional)</div><Select value={b} onChange={(e) => setB(e.target.value)}><option value="">none</option>{(list || []).map((x) => <option key={x.id} value={x.id}>{x.name} · {fmtTime(x.created_at)}</option>)}</Select></div>
        <Button variant="secondary" className="self-end" onClick={() => reload()}>Refresh</Button>
      </Card>
      {!list && <Spinner />}
      {list && list.length === 0 && <Callout tone="warn">No experiments recorded yet. Run one from the Test Lab tab (or <span className="mono">scripts/run_experiment.sh exp2</span>).</Callout>}
      {ra && rb && (
        <Card><CardTitle>Side by side</CardTitle>
          <table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase text-mute"><th>metric</th><th>{ra.meta.experiment} {ra.meta.tag}</th><th>{rb.meta.experiment} {rb.meta.tag}</th></tr></thead><tbody>
            {[["humans", (r: any) => r.traffic.humans], ["bot identities", (r: any) => r.traffic.bot_identities], ["client requests", (r: any) => r.traffic.client_requests], ["bot advantage (FCFS)", (r: any) => f3(r.policies.fcfs?.bot_advantage_ratio ?? r.policies.fcfs_live?.bot_advantage_ratio)], ["bot advantage (naive)", (r: any) => f3(r.policies.naive_expected?.bot_advantage_ratio)], ["bot advantage (Fair Drop)", (r: any) => f3(r.policies.fairdrop_expected?.bot_advantage_ratio)], ["human win rate (FCFS)", (r: any) => f3(r.policies.fcfs?.human_win_rate)], ["human win rate (Fair Drop)", (r: any) => f3(r.policies.fairdrop_expected?.human_win_rate)], ["integrity", (r: any) => (r.integrity?.ok ? "all zero" : `${r.integrity?.total_violations} violations`)]].map(([k, f]: any) => <tr key={k} className="border-t border-line"><td className="py-1.5 text-mute">{k}</td><td>{f(ra)}</td><td>{f(rb)}</td></tr>)}</tbody></table></Card>
      )}
      {ra && <ExperimentView r={ra} />}
    </div>
  );
}
