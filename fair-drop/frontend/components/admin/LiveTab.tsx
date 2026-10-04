"use client";
import { useEffect, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { adminToken, API } from "@/lib/api";
import { Badge, Callout, Card, CardTitle, Stat, StateBadge } from "@/components/ui";

type Pt = { t: number; rps: number; entries: number; tokens: number; p99: number };

export default function LiveTab({ dropId }: { dropId: string }) {
  const [s, setS] = useState<any>(null);
  const [hist, setHist] = useState<Pt[]>([]);
  const [conn, setConn] = useState("connecting");
  const prev = useRef<{ r: number; t: number } | null>(null);
  useEffect(() => {
    if (!dropId) return;
    setHist([]); prev.current = null;
    const es = new EventSource(`${API}/admin/drops/${dropId}/live?access_token=${encodeURIComponent(adminToken.get() || "")}`);
    es.onopen = () => setConn("live (SSE)");
    es.onerror = () => setConn("reconnecting…");
    es.onmessage = (m) => {
      const d = JSON.parse(m.data);
      setS(d);
      const rps = d.rps ?? 0;
      setHist((h) => [...h.slice(-90), { t: Date.now(), rps: Math.round(rps), entries: d.entries_registered, tokens: d.tokens_issued, p99: Math.round(d.p99_ms) }]);
    };
    return () => es.close();
  }, [dropId]);
  if (!dropId) return <Callout tone="info">Select a drop in the Drops tab.</Callout>;
  if (!s) return <div className="text-mute">{conn}</div>;
  const c = s.counters || {};
  const rejected = (c.rejected_reused || 0) + (c.rejected_bad_sig || 0) + (c.rejected_ineligible || 0) + (c.rejected_closed || 0) + (c.rejected_already_issued || 0);
  const healthy = s.replicas.filter((r: any) => r.healthy).length;
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3"><StateBadge state={s.drop.state} /><Badge tone="green">{conn}</Badge><span className="mono text-xs text-mute">{dropId}</span></div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <Stat label="Tokens issued" value={s.tokens_issued.toLocaleString()} sub="one per verified identity" />
        <Stat label="Entries registered" value={s.entries_registered.toLocaleString()} />
        <Stat label="Requests / sec" value={Math.round(s.rps ?? 0).toLocaleString()} sub="all replicas" />
        <Stat label="Rate limited (all drops)" value={((s.rate_limited_global || 0) + (c.rate_limited || 0)).toLocaleString()} sub="availability only" tone={(s.rate_limited_global || c.rate_limited) ? "warn" : undefined} />
        <Stat label="p99 latency" value={`${s.p99_ms.toFixed(0)} ms`} sub="worst replica" />
        <Stat label="Replicas healthy" value={`${healthy} / ${s.replicas.length}`} tone={healthy < s.replicas.length ? "bad" : "ok"} />
        <Stat label="Rejected: reused token" value={(c.rejected_reused || 0).toLocaleString()} />
        <Stat label="Rejected: bad signature" value={(c.rejected_bad_sig || 0).toLocaleString()} />
        <Stat label="Rejected: ineligible" value={(c.rejected_ineligible || 0).toLocaleString()} sub="after cutoff" />
        <Stat label="Rejected: dup token req" value={(c.rejected_already_issued || 0).toLocaleString()} />
        <Stat label="Tarpit hits" value={(c.tarpit_hits || 0).toLocaleString()} sub="decoy endpoint" />
        <Stat label="Attempts recorded" value={s.attempts.toLocaleString()} sub={`${rejected.toLocaleString()} rejected`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardTitle>Throughput (req/s) & p99 (ms)</CardTitle>
          <ResponsiveContainer width="100%" height={220}><AreaChart data={hist}><CartesianGrid stroke="#243247" strokeDasharray="3 3" /><XAxis dataKey="t" tickFormatter={(v) => new Date(v).toLocaleTimeString().slice(3, 8)} stroke="#8fa1b8" fontSize={11} /><YAxis stroke="#8fa1b8" fontSize={11} />
            <Tooltip contentStyle={{ background: "#111822", border: "1px solid #243247" }} labelFormatter={(v) => new Date(v as number).toLocaleTimeString()} />
            <Area type="monotone" dataKey="rps" stroke="#2dd4bf" fill="#2dd4bf33" /><Area type="monotone" dataKey="p99" stroke="#f59e0b" fill="#f59e0b22" /></AreaChart></ResponsiveContainer></Card>
        <Card><CardTitle>Tokens vs entries</CardTitle>
          <ResponsiveContainer width="100%" height={220}><AreaChart data={hist}><CartesianGrid stroke="#243247" strokeDasharray="3 3" /><XAxis dataKey="t" tickFormatter={(v) => new Date(v).toLocaleTimeString().slice(3, 8)} stroke="#8fa1b8" fontSize={11} /><YAxis stroke="#8fa1b8" fontSize={11} />
            <Tooltip contentStyle={{ background: "#111822", border: "1px solid #243247" }} />
            <Area type="monotone" dataKey="tokens" stroke="#38bdf8" fill="#38bdf833" /><Area type="monotone" dataKey="entries" stroke="#22c55e" fill="#22c55e33" /></AreaChart></ResponsiveContainer></Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card><CardTitle>Replica health</CardTitle>
          <ul className="space-y-2 text-sm">{s.replicas.map((r: any) => (
            <li key={r.id} className="flex items-center justify-between"><span className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${r.healthy ? "bg-ok" : "bg-bad"}`} />{r.id} <span className="text-xs text-mute">{r.role}</span></span>
              {r.healthy ? <span className="text-xs text-mute">p99 {Number(r.p99_ms).toFixed(0)}ms · {r.inflight} in flight · {r.requests.toLocaleString()} req</span> : <Badge tone="red">DOWN</Badge>}</li>))}</ul></Card>
        <Card><CardTitle>Seat inventory</CardTitle>
          <div className="text-sm text-mute">Total seats <b className="text-ink">{s.seats_total}</b></div>
          {s.seats_claimed !== undefined && <div className="text-sm text-mute">Claimed <b className="text-ink">{s.seats_claimed}</b> · expired {c.claims_expired || 0} · promoted from waitlist {c.claims_promoted || 0}</div>}
          {s.drop.mode === "fcfs" && <div className="text-sm text-mute">FCFS sold <b className="text-ink">{s.baseline_seats_sold}</b> · rejected sold-out {c.sold_out_rejects || 0}</div>}</Card>
        <Card><CardTitle>Humans vs bots (TEST_MODE labels)</CardTitle>
          {s.labels ? <div className="space-y-1 text-sm"><div>Human entries: <b>{s.labels.entries_human}</b></div><div>Bot entries: <b>{s.labels.entries_bot}</b></div><div className="text-xs text-mute">Labels are evaluation-only; the allocation never reads them.</div></div> : <div className="text-sm text-mute">No labels uploaded (Test Lab).</div>}</Card>
      </div>
    </div>
  );
}
