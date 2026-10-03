"use client";
import { useEffect, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, testKey, usePoll } from "@/lib/api";
import { Badge, Button, Callout, Card, CardTitle, Select, StateBadge, fmtDur } from "@/components/ui";
import DotStage, { StageHandle } from "./DotStage";
import { BOTS, BOT_ORDER, REASON, n, ms, reasonOf } from "./botinfo";
import TestsExplained from "./TestsExplained";
import BotLab from "./BotLab";
import HowItWorks from "./HowItWorks";

const tip = { contentStyle: { background: "#111822", border: "1px solid #243247" } };
const SECTIONS = [["picture", "Live picture"], ["how", "How it works"], ["tickets", "Tickets & queue"], ["health", "Server health"], ["bots", "The bots"], ["right", "Is protection right?"], ["redteam", "Try to break it"], ["compare", "Old way vs new way"], ["tests", "What each test means"], ["words", "What the words mean"]];

const sentence = (e: any) => {
  const who = e.k === "bot" ? `${BOTS[e.pf]?.name || "Bot"}` : e.k === "human" ? "A person" : "A visitor";
  const what: Record<string, string> = {
    "token/already_issued": "asked for a second ticket (refused)", "token/ineligible": "signed up too late (refused)", "token/closed": "came after the sale closed", "token/not_open": "came before the sale opened",
    "register/ok": "got into the draw", "register/replay": "retried (no second entry made)", "register/spent": "tried to reuse a used ticket", "register/closed": "came after the sale closed", "register/bad_sig": "sent a fake ticket",
    "tarpit/tarpit": "fell for the decoy trap", "buy/ok": "bought a seat", "buy/capped": "hit the per-account limit", "buy/soldout": "found it sold out",
    "limit/ip": "was slowed: too many clicks from one address", "limit/account": "was slowed: too many clicks from one account",
  };
  return `${who} ${what[e.s + "/" + e.o] || e.s + " " + e.o}`;
};

function Tile({ label, value, sub, tone, tipText }: { label: string; value: React.ReactNode; sub?: string; tone?: string; tipText?: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-3" title={tipText}>
      <div className="text-[11px] uppercase tracking-wide text-mute">{label}</div>
      <div className={`text-2xl font-bold ${tone === "ok" ? "text-ok" : tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : ""}`}>{value}</div>
      {sub && <div className="text-[11px] text-mute">{sub}</div>}
    </div>
  );
}
const H2 = ({ id, children, sub }: { id: string; children: React.ReactNode; sub?: string }) => (
  <div id={id} className="scroll-mt-20 pt-2"><h2 className="text-xl font-bold">{children}</h2>{sub && <p className="text-sm text-mute">{sub}</p>}</div>
);

export default function ControlRoom({ dropId, setDropId, goTab }: { dropId: string; setDropId: (s: string) => void; goTab: (t: string) => void }) {
  const stage = useRef<StageHandle>(null);
  const [feed, setFeed] = useState<any[]>([]);
  const [live, setLive] = useState({ active: 0, rps: 0, okps: 0, nops: 0 });
  const [hist, setHist] = useState<any[]>([]);
  const [ph, setPh] = useState<any[]>([]);                       // pulse history for the health charts
  const peak = useRef({ inflight: 0, active: 0, rps: 0, run: "" });
  const [size, setSize] = useState("0.1");
  const [guardOn, setGuardOn] = useState(true);
  const [msg, setMsg] = useState("");
  const [follow, setFollow] = useState(true);
  const [st, setSt] = useState<any>(null); const [stBusy, setStBusy] = useState(false);
  const [rt, setRt] = useState<any>(null); const [rtBusy, setRtBusy] = useState(false); const [before, setBefore] = useState<any>(null);

  const { data: drops } = usePoll(() => api<any[]>("/admin/drops", { auth: "admin" }), 2500);
  const { data: runs } = usePoll(() => api<any[]>("/runs", { base: "/attack", headers: { "X-Test-Key": testKey.get() } }), 2500);
  const { data: prot } = usePoll(() => (dropId ? api<any>(`/admin/drops/${dropId}/protection`, { auth: "admin" }) : Promise.resolve(null)), 3000, [dropId]);
  const { data: pulse } = usePoll(() => (dropId ? api<any>(`/admin/drops/${dropId}/pulse`, { auth: "admin" }) : Promise.resolve(null)), 1500, [dropId]);
  const { data: exps } = usePoll(() => api<any[]>("/admin/experiments", { auth: "admin" }), 6000);
  const running = runs?.find((r) => r.status === "running");

  // the newest test's two sales: AFTER (fair) and BEFORE (old way)
  const exp = (drops || []).filter((d: any) => d.id.startsWith("exp-")).sort((a: any, b: any) => b.opens_at_ms - a.opens_at_ms);
  const fairD = exp.find((d: any) => d.mode === "fairdrop");
  const fcfsD = fairD ? (drops || []).find((d: any) => d.id === fairD.id.replace("-fairdrop-", "-fcfs-")) : undefined;
  const drop = (drops || []).find((d: any) => d.id === dropId);
  const isOld = drop?.mode === "fcfs";

  useEffect(() => { if (drops?.length && fairD && (!dropId || !drops.some((d: any) => d.id === dropId))) setDropId(fairD.id); }, [drops?.length, fairD?.id]);
  useEffect(() => {
    if (!follow || !running) return;
    const open = [fairD, fcfsD].find((d) => d?.state === "OPEN");
    if (open && open.id !== dropId) setDropId(open.id);
  }, [running?.id, fairD?.state, fcfsD?.state, follow]);
  useEffect(() => { if (running && peak.current.run !== running.id) { peak.current = { inflight: 0, active: 0, rps: 0, run: running.id }; setPh([]); } }, [running?.id]);
  useEffect(() => { api("/redteam/before", { base: "/attack", headers: { "X-Test-Key": testKey.get() } }).then(setBefore).catch(() => {}); }, []);

  // decision feed -> dots, ticker, per-second chart
  useEffect(() => {
    stage.current?.reset(); setFeed([]); setHist([]);
    if (!dropId) return;
    let cursor = "", alive = true, first = true;
    const tick = async () => {
      try {
        const r = await api<any>(`/admin/drops/${dropId}/feed${cursor ? "?after=" + cursor : ""}`, { auth: "admin" });
        if (!alive) return;
        cursor = r.cursor || cursor;
        const evs: any[] = r.events || [];
        if (!first) stage.current?.push(evs.map((e) => ({ ...e, r: reasonOf(e.s, e.o) })));          // on a reload, start calm: the exact numbers come from the scorecard
        const p = r.per_sec_3s || {};
        const sum = (vs: string[]) => ["human", "bot", "unknown"].reduce((a, k) => a + vs.reduce((b, v) => b + (p[k + "/" + v] || 0), 0), 0);
        const lv = { active: r.active_users_3s, rps: p.all || 0, okps: sum(["accepted"]), nops: sum(["rejected", "decoy"]) };
        setLive(lv);
        peak.current.active = Math.max(peak.current.active, lv.active); peak.current.rps = Math.max(peak.current.rps, lv.rps);
        setHist((h) => [...h.slice(-59), { t: Date.now(), "people let in": +(p["human/accepted"] || 0).toFixed(1), "bots let in": +(p["bot/accepted"] || 0).toFixed(1), "people turned away": +(p["human/rejected"] || 0).toFixed(1), "bot requests turned away": +((p["bot/rejected"] || 0) + (p["bot/decoy"] || 0)).toFixed(1) }]);
        if (!first && evs.length) setFeed((f) => [...evs.slice(-12).reverse(), ...f].slice(0, 12));
        first = false;
      } catch { /* keep polling */ }
    };
    tick(); const t = setInterval(tick, 500);
    return () => { alive = false; clearInterval(t); };
  }, [dropId]);

  useEffect(() => {
    if (!pulse) return;
    peak.current.inflight = Math.max(peak.current.inflight, pulse.queue?.in_flight || 0);
    setPh((h) => [...h.slice(-89), { t: Date.now(), "typical wait": +pulse.server.typical_ms.toFixed(1), "slow wait (1 in 20)": +pulse.server.slow_ms.toFixed(1), "handled at once": pulse.queue.in_flight }]);
  }, [pulse?.now_ms]);

  const start = async () => {
    setMsg(""); peak.current = { inflight: 0, active: 0, rps: 0, run: "" }; setPh([]);
    try {
      await api("/test/config", { body: { guard: { enabled: guardOn } }, headers: { "X-Test-Key": testKey.get() } });
      await api("/run", { method: "POST", base: "/attack", headers: { "X-Test-Key": testKey.get() }, body: { experiment: "show", scale: +size, also_fcfs: true } });
      setFollow(true); setMsg("Started. First the fair sale runs (the NEW WAY), then the same crowd tries the OLD WAY (first-come-first-served).");
    } catch (e: any) { setMsg("Could not start: " + (e.body?.detail || e.body?.error || e.message)); }
  };
  const [restarting, setRestarting] = useState(false);
  const restart = async () => {
    if (!confirm("Restart: stop any running test, and clear all test sales, results and counters? Real users stay.")) return;
    setRestarting(true); setMsg("Stopping and clearing…");
    const h = { "X-Test-Key": testKey.get() };
    try {
      await api("/stop", { method: "POST", base: "/attack", headers: h, body: {} });
      const r = await api<any>("/test/clear", { method: "POST", headers: h, body: {} });
      stage.current?.reset(); setFeed([]); setHist([]); setPh([]); setSt(null); setRt(null); setLastFull(null); setDropId(""); setGuardOn(true); setFollow(true);
      peak.current = { inflight: 0, active: 0, rps: 0, run: "" };
      setMsg(`Clean slate: ${r.sales_cleared} test sale(s) cleared, nothing is running, protection is ON. Press “Start bot attack” to begin again.`);
    } catch (e: any) { setMsg("Could not restart: " + (e.body?.detail || e.body?.error || e.message)); }
    setRestarting(false);
  };
  const selftest = async () => { setStBusy(true); setSt(null); try { setSt(await api("/selftest", { method: "POST", base: "/attack", headers: { "X-Test-Key": testKey.get() }, body: {} })); } catch (e: any) { setSt({ error: e.body?.error || e.message }); } setStBusy(false); };
  const redteam = async () => { setRtBusy(true); setRt(null); try { setRt(await api("/redteam", { method: "POST", base: "/attack", headers: { "X-Test-Key": testKey.get() }, body: {} })); } catch (e: any) { setRt({ error: e.body?.error || e.message }); } setRtBusy(false); };

  // ── derived from the scorecard ──
  const c = prot?.confusion?.all, ch = prot?.confusion?.human;
  const rq = prot?.requests_by_kind || {};
  const sum = (v: string) => ["human", "bot", "unknown"].reduce((a, k) => a + (rq[k]?.[v] || 0), 0);
  const counts = { ok: sum("accepted"), no: sum("rejected"), decoy: sum("decoy") };
  const ppl = prot?.people || {};
  const bp = prot?.by_profile || {};
  const wrong = (c?.FP || 0) + (c?.FN || 0);
  const decided = c ? c.TP + c.TN + c.FP + c.FN : 0;
  const acc = decided ? ((c.TP + c.TN) / decided) * 100 : null;
  const lanes: Record<string, { entered: number; blocked: number }> = {};
  [...BOT_ORDER, "HUMAN"].forEach((id) => { if (bp[id]) lanes[id] = { entered: bp[id].Entered, blocked: bp[id].Rejected + bp[id].Decoy }; });
  const humanSold = bp.HUMAN?.Reasons?.sold_out || 0;
  const botIn = ppl.bot?.entered || 0, botAcc = ppl.bot?.attempted || 0, botBlocked = (rq.bot?.rejected || 0) + (rq.bot?.decoy || 0);

  const last = (() => { const x = (exps || []).find((e: any) => (e.name.includes("show_bot_zoo") || e.name.includes("custom_mix")) && !e.name.includes("live FCFS")) || (exps || []).find((e: any) => e.name.includes("exp2") && !e.name.includes("live FCFS")); return x; })();
  const [lastFull, setLastFull] = useState<any>(null);
  useEffect(() => { if (last) api(`/admin/experiments/${last.id}`, { auth: "admin" }).then(setLastFull).catch(() => {}); }, [last?.id]);
  const f = lastFull?.policies;
  const closes = pulse?.closes_at_ms && pulse.state === "OPEN" ? Math.max(0, pulse.closes_at_ms - pulse.now_ms) : null;
  const typTone = pulse ? (pulse.server.typical_ms < 250 ? "ok" : pulse.server.typical_ms < 1000 ? "warn" : "bad") : undefined;
  const phase = running ? (fairD?.state === "OPEN" ? 1 : fcfsD?.state === "OPEN" ? 2 : 0) : -1;

  return (
    <div className="space-y-5">
      {/* jump bar */}
      <div className="sticky top-14 z-20 -mx-1 flex gap-1 overflow-x-auto rounded-xl border border-line bg-bg/90 p-1.5 backdrop-blur">
        {SECTIONS.map(([id, l]) => <a key={id} href={`#${id}`} className="whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold text-mute hover:bg-panel2 hover:text-ink">{l}</a>)}
      </div>

      {/* controls */}
      <Card className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div><div className="mb-1 text-xs uppercase text-mute">How big a crowd?</div>
            <Select value={size} onChange={(e) => setSize(e.target.value)}><option value="0.05">Tiny: 2,500 people</option><option value="0.1">Small: 5,000 people</option><option value="0.3">Medium: 15,000 people</option><option value="1">Full: 50,000 people</option></Select></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={guardOn} onChange={(e) => setGuardOn(e.target.checked)} />Protection ON <span className="text-xs text-mute">(untick to see what happens without it)</span></label>
          <Button onClick={start} disabled={!!running}>{running ? "Test running…" : "▶ Start bot attack"}</Button>
          <Button variant="secondary" onClick={selftest} disabled={stBusy}>{stBusy ? "Checking…" : "Quick safety check (18 tries)"}</Button>
          <Button variant="secondary" onClick={restart} disabled={restarting}>{restarting ? "Clearing…" : "🔄 Restart: clear everything"}</Button>
          <Button variant="secondary" onClick={redteam} disabled={rtBusy}>{rtBusy ? "Trying…" : "Try to break it (14 tricks)"}</Button>
        </div>
        {msg && <div className="text-sm text-mute">{msg}</div>}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs uppercase text-mute">Watching</span>
          <button onClick={() => { setFollow(false); fairD && setDropId(fairD.id); }} disabled={!fairD} className={`rounded-lg border px-3 py-1.5 font-semibold ${drop && !isOld ? "border-ok bg-ok/15 text-ok" : "border-line text-mute"} ${phase === 1 ? "alarm" : ""}`}>NEW WAY · the fair sale {phase === 1 && "· running now"}</button>
          <button onClick={() => { setFollow(false); fcfsD && setDropId(fcfsD.id); }} disabled={!fcfsD} className={`rounded-lg border px-3 py-1.5 font-semibold ${isOld ? "border-bad bg-bad/15 text-bad" : "border-line text-mute"} ${phase === 2 ? "alarm" : ""}`}>OLD WAY · first-come-first-served {phase === 2 && "· running now"}</button>
          {drops && <Select className="max-w-[240px] text-xs" value={drops.some((d: any) => d.id === dropId) ? dropId : ""} onChange={(e) => { setFollow(false); setDropId(e.target.value); }}><option value="">Another sale…</option>{drops.map((d: any) => <option key={d.id} value={d.id}>{d.event_name.slice(0, 30)} · {d.mode} · {d.id.slice(-6)}</option>)}</Select>}
        </div>
      </Card>

      <BotLab running={!!running} onStarted={(m) => { setFollow(true); setMsg(m); peak.current = { inflight: 0, active: 0, rps: 0, run: "" }; setPh([]); }} />

      {/* status banner */}
      {!prot || !decided ? <Callout tone="info">Nothing to show yet. Press <b>▶ Start bot attack</b>: about {size === "1" ? "50,000" : size === "0.3" ? "15,000" : size === "0.05" ? "2,500" : "5,000"} people and some bots will try to get tickets, and everything appears here live.</Callout>
        : wrong > 0 ? <Callout tone="bad" title={`The protection made ${wrong} mistake${wrong > 1 ? "s" : ""}`}>{c.FP ? `${c.FP} good request(s) were wrongly turned away. ` : ""}{c.FN ? `${c.FN} bad request(s) were wrongly let in. ` : ""}See “Is protection right?” below for exactly which.</Callout>
        : isOld ? <Callout tone="warn" title="You are watching the OLD WAY (first-come-first-served)">It made no mistakes, but it is unfair: only <b>{n(ppl.human?.entered)}</b> of <b>{n(ppl.human?.attempted)}</b> real people got a seat. The other <b>{n(ppl.human?.not_entered)}</b> were told “sold out” within seconds, because bots and fast clickers got there first. Compare with the NEW WAY.</Callout>
        : <Callout tone="ok" title="The protection is working">{n(decided)} decisions were re-checked by an independent judge: <b>0 mistakes</b>. <b>{n(ppl.human?.entered)} of {n(ppl.human?.attempted)}</b> real people got into the draw. <b>{n(botAcc)}</b> bot accounts took part and got <b>{n(botIn)}</b> entries (one each, the most any account can get). <b>{n(botBlocked)}</b> bot requests were turned away.</Callout>}

      {/* picture */}
      <H2 id="picture" sub="Every dot is one decision by the server. Dots change colour when the protection gate decides.">Live picture</H2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="People on the site now" value={n(live.active)} sub="distinct visitors, last 3 seconds" tipText="Unique accounts that sent a request in the last 3 seconds" />
        <Tile label="Clicks per second" value={n(Math.round(live.rps))} sub="requests reaching the gate (tech: rps)" />
        <Tile label="Let in per second" value={n(Math.round(live.okps))} tone="ok" sub="green dots" />
        <Tile label="Turned away per second" value={n(Math.round(live.nops))} tone="bad" sub="red dots" />
        <Tile label={isOld ? "Real people who got a seat" : "Real people in the draw"} value={`${n(ppl.human?.entered)} of ${n(ppl.human?.attempted)}`} tone={isOld ? "warn" : "ok"} sub={isOld ? "old way: most are told sold out" : "everyone eligible gets in, then the draw decides"} />
        <Tile label="Bot accounts that got in" value={`${n(botIn)} of ${n(botAcc)}`} tone="warn" sub="one entry each at most; extra tries are blocked" />
        <Tile label="Bot requests turned away" value={n(botBlocked)} tone="ok" sub="cheating attempts stopped" />
        {isOld ? <Tile label="People told “sold out”" value={n(humanSold)} tone="warn" sub="the old way’s unfairness" /> : <Tile label="Real people wrongly turned away" value={n(ch?.FP || 0)} tone={ch?.FP ? "bad" : "ok"} sub="should always be 0" tipText="False positives among real people" />}
      </div>
      <Card className="p-2">
        <DotStage ref={stage} counts={counts} lanes={lanes} seats={pulse?.tickets?.total} />
        <div className="px-2 pb-1 pt-2 text-xs text-mute">Dots start <span style={{ color: "#38bdf8" }}>blue = person</span> or <span style={{ color: "#fb923c" }}>orange = bot</span>, and become <span style={{ color: "#22c55e" }}>green = let in</span>, <span style={{ color: "#ef4444" }}>red = turned away</span> or <span style={{ color: "#a855f7" }}>purple = decoy trap</span> at the gate. ● person · ◆ bot. When it is very busy, only a sample of dots is drawn; the big numbers are exact.</div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card><CardTitle>Let in vs turned away, per second</CardTitle>
          <ResponsiveContainer width="100%" height={190}><AreaChart data={hist}><CartesianGrid stroke="#243247" strokeDasharray="3 3" /><XAxis dataKey="t" tickFormatter={(v) => new Date(v).toLocaleTimeString().slice(3, 8)} stroke="#8fa1b8" fontSize={11} /><YAxis stroke="#8fa1b8" fontSize={11} />
            <Tooltip {...tip} labelFormatter={(v) => new Date(v as number).toLocaleTimeString()} />
            <Area type="monotone" stackId="1" dataKey="people let in" stroke="#22c55e" fill="#22c55e55" /><Area type="monotone" stackId="1" dataKey="bots let in" stroke="#f59e0b" fill="#f59e0b55" />
            <Area type="monotone" stackId="2" dataKey="people turned away" stroke="#38bdf8" fill="#38bdf855" /><Area type="monotone" stackId="2" dataKey="bot requests turned away" stroke="#ef4444" fill="#ef444455" /></AreaChart></ResponsiveContainer>
          <div className="text-xs text-mute">Top: let in (green people, orange bots). Bottom: turned away (blue people, red bots).</div></Card>
        <Card><CardTitle>What just happened</CardTitle>
          <ul className="space-y-1 text-xs">{feed.map((e) => <li key={e.id} className="flex gap-2"><span style={{ color: e.v === "accepted" ? "#22c55e" : e.v === "rejected" ? "#ef4444" : e.v === "decoy" ? "#a855f7" : "#64748b" }}>●</span><span className="text-ink/90">{sentence(e)}</span></li>)}{!feed.length && <li className="text-mute">Waiting for activity…</li>}</ul></Card>
      </div>

      <H2 id="how" sub="For a demo: how a person gets in, and every rule that stopped a bot in this test.">How it works, live</H2>
      <HowItWorks pulse={pulse} prot={prot} dropId={dropId} isOld={isOld} />

      {/* tickets & queue */}
      <H2 id="tickets" sub="How many tickets exist, how many are gone, and whether anyone is waiting.">Tickets & queue</H2>
      {pulse && (() => {
        const T = pulse.tickets, pct = T.total ? (T.sold / T.total) * 100 : 0, entries = pulse.flow.entries;
        return (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="space-y-3">
              <CardTitle right={<StateBadge state={pulse.state} />}>Tickets</CardTitle>
              <div className="flex items-end gap-6"><div><div className="text-4xl font-bold">{n(T.left)}</div><div className="text-xs text-mute">tickets left of {n(T.total)}</div></div><div><div className="text-4xl font-bold text-ok">{n(T.sold)}</div><div className="text-xs text-mute">{T.basis === "bought" ? "sold" : T.basis === "claimed" ? "claimed by winners" : "given out so far"}</div></div></div>
              <div className="h-3 overflow-hidden rounded bg-panel2"><div className="h-3 rounded bg-ok" style={{ width: pct + "%" }} /></div>
              {T.basis === "pending" && <p className="text-sm text-mute">Nobody “buys” in the fair sale. When the sale closes, the draw picks <b>{n(T.total)}</b> winners from the <b>{n(entries)}</b> entries so far: about <b>1 in {entries > T.total ? (entries / T.total).toFixed(1) : "1"}</b> will win.{closes !== null && <> The sale closes in <b>{fmtDur(closes)}</b>.</>}</p>}
              {T.basis === "bought" && <p className="text-sm text-mute">First come, first served: seats go to whoever’s click lands first, so speed (and bots) win.</p>}
              {T.tiers.some((t: any) => t.sold !== undefined) && <table className="w-full text-xs"><thead className="text-left text-mute"><tr><th>Section</th><th className="text-right">Seats</th><th className="text-right">Sold</th><th className="text-right">Left</th></tr></thead><tbody>{T.tiers.map((t: any) => <tr key={t.id} className="border-t border-line"><td className="py-1">{t.name}</td><td className="text-right">{t.seats}</td><td className="text-right">{t.sold ?? "-"}</td><td className="text-right">{t.left ?? "-"}</td></tr>)}</tbody></table>}
              <div className="grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-lg bg-panel2 p-2"><div className="text-lg font-bold">{n(pulse.flow.tokens_issued)}</div>tickets handed out<div className="text-mute">one per verified person</div></div><div className="rounded-lg bg-panel2 p-2"><div className="text-lg font-bold">{n(entries)}</div>entries in the draw</div><div className="rounded-lg bg-panel2 p-2"><div className="text-lg font-bold">{n(pulse.flow.counters?.tarpit_hits || 0)}</div>caught by the decoy</div></div>
            </Card>
            <Card className="space-y-3">
              <CardTitle>Is a queue forming?</CardTitle>
              <div className="grid grid-cols-2 gap-2">
                <Tile label="Being handled right now" value={n(pulse.queue.in_flight)} sub="requests in progress at this instant" tone={pulse.queue.in_flight > 500 ? "warn" : "ok"} />
                <Tile label="Waiting to be saved" value={n(pulse.queue.db_writes_waiting)} sub="records queued for the permanent database" tone={pulse.queue.db_writes_waiting > 5000 ? "warn" : "ok"} />
              </div>
              <Callout tone="info">{isOld ? <>The old sale has no waiting line either: whoever’s click lands first wins, which is exactly why bots do well in it. </> : null}The fair sale has <b>no waiting line, on purpose</b>. Arrival order doesn’t change anyone’s chance, so there is nothing to queue for and nobody gains by being first. What can pile up is work: if “being handled” or “waiting to be saved” keep growing, the servers are falling behind. Watch them during a Full 50,000 test.</Callout>
              <div className="text-xs text-mute">Busiest moment this test: <b className="text-ink">{n(peak.current.inflight)}</b> requests handled at once · <b className="text-ink">{n(peak.current.active)}</b> people active in 3 seconds · <b className="text-ink">{n(Math.round(peak.current.rps))}</b> clicks per second. Measured on this one computer, so it proves what <i>this</i> machine can do, not that 50,000 can hit at the same second (that needs several load machines).</div>
            </Card>
          </div>
        );
      })()}

      {/* health */}
      <H2 id="health" sub="Is the website itself coping? Green is good.">Server health</H2>
      {pulse ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
            <Tile label="Typical wait" value={ms(pulse.server.typical_ms)} tone={typTone} sub="half of the last ~8,000 visitors waited less (tech: p50)" tipText="Median response time across the web servers" />
            <Tile label="Slow wait" value={ms(pulse.server.slow_ms)} tone={pulse.server.slow_ms < 800 ? "ok" : pulse.server.slow_ms < 2500 ? "warn" : "bad"} sub="19 of 20 wait less than this (tech: p95)" />
            <Tile label="Slowest wait" value={ms(pulse.server.slowest_ms)} tone={pulse.server.slowest_ms < 2000 ? "ok" : pulse.server.slowest_ms < 5000 ? "warn" : "bad"} sub="99 of 100 wait less (tech: p99)" />
            <Tile label="Server errors" value={n(pulse.server.errors_5xx_total)} tone={pulse.server.errors_5xx_total ? "bad" : "ok"} sub="times a server failed to answer (tech: 5xx)" />
            <Tile label="Servers running" value={`${pulse.server.servers_up} of ${pulse.server.servers_total}`} tone={pulse.server.servers_up === pulse.server.servers_total ? "ok" : "bad"} sub="3 web servers + 1 background worker" />
            <Tile label="Slowed by rate limit" value={n(pulse.flow.rate_limited_global)} sub="people/bots told to wait a second (all sales)" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card><CardTitle>How fast the site answers (last 90 seconds)</CardTitle>
              <ResponsiveContainer width="100%" height={170}><LineChart data={ph}><CartesianGrid stroke="#243247" strokeDasharray="3 3" /><XAxis dataKey="t" tickFormatter={(v) => new Date(v).toLocaleTimeString().slice(3, 8)} stroke="#8fa1b8" fontSize={11} /><YAxis stroke="#8fa1b8" fontSize={11} unit=" ms" />
                <Tooltip {...tip} labelFormatter={(v) => new Date(v as number).toLocaleTimeString()} /><Line type="monotone" dataKey="typical wait" stroke="#22c55e" dot={false} /><Line type="monotone" dataKey="slow wait (1 in 20)" stroke="#f59e0b" dot={false} /></LineChart></ResponsiveContainer>
              <div className="text-xs text-mute">Under about 0.25 s feels instant. If the orange line shoots up, some people are waiting.</div></Card>
            <Card><CardTitle>Requests being handled at once</CardTitle>
              <ResponsiveContainer width="100%" height={170}><AreaChart data={ph}><CartesianGrid stroke="#243247" strokeDasharray="3 3" /><XAxis dataKey="t" tickFormatter={(v) => new Date(v).toLocaleTimeString().slice(3, 8)} stroke="#8fa1b8" fontSize={11} /><YAxis stroke="#8fa1b8" fontSize={11} />
                <Tooltip {...tip} labelFormatter={(v) => new Date(v as number).toLocaleTimeString()} /><Area type="monotone" dataKey="handled at once" stroke="#2dd4bf" fill="#2dd4bf44" /></AreaChart></ResponsiveContainer>
              <div className="text-xs text-mute">This is the “crowd at the door” inside the servers.</div></Card>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card><CardTitle>The servers</CardTitle>
              <ul className="space-y-1 text-sm">{pulse.server.replicas.map((r: any) => <li key={r.id} className="flex items-center justify-between"><span><span className={r.up ? "text-ok" : "text-bad"}>●</span> {r.id === "worker" ? "Background worker" : "Web server " + String(r.id).replace("api-", "")}</span><span className="text-xs text-mute">{r.up ? `${n(r.requests)} requests · ${n(r.inflight)} in progress` : "DOWN"}</span></li>)}</ul></Card>
            <Card><CardTitle>Fast memory store (Redis)</CardTitle>
              <div className="grid grid-cols-2 gap-2 text-sm"><div><div className="text-xl font-bold">{pulse.database.redis.memory_mb.toFixed(0)} MB</div><div className="text-xs text-mute">memory used</div></div><div><div className="text-xl font-bold">{n(pulse.database.redis.ops_per_sec)}</div><div className="text-xs text-mute">operations / second</div></div><div><div className="text-xl font-bold">{n(pulse.database.redis.clients)}</div><div className="text-xs text-mute">open connections</div></div><div><div className="text-xl font-bold">{n(pulse.database.redis.keys)}</div><div className="text-xs text-mute">items stored</div></div></div>
              <div className="mt-1 text-xs text-mute">Holds the live state: who has a ticket, who has entered, the clock.</div></Card>
            <Card><CardTitle>Permanent records (Postgres)</CardTitle>
              <div className="grid grid-cols-2 gap-2 text-sm"><div><div className="text-xl font-bold">{n(pulse.database.postgres.audit_entries)}</div><div className="text-xs text-mute">events in the tamper-proof log</div></div><div><div className="text-xl font-bold">{n(pulse.database.postgres.entry_rows)}</div><div className="text-xs text-mute">entries saved</div></div><div><div className="text-xl font-bold">{pulse.database.postgres.size_mb.toFixed(0)} MB</div><div className="text-xs text-mute">database size</div></div><div><div className="text-xl font-bold">{n(pulse.database.postgres.connections)}</div><div className="text-xs text-mute">open connections</div></div></div>
              <div className="mt-1 text-xs text-mute">The permanent copy. Nothing here is ever edited, only added to.</div></Card>
          </div>
        </div>) : <Card className="text-sm text-mute">Pick a sale to see its servers and database.</Card>}

      {/* bots */}
      <H2 id="bots" sub="Every kind of bot in the test, what it tries, and what happened to it. Real people are shown for comparison.">The bots</H2>
      <Card className="overflow-x-auto">
        {Object.keys(bp).length === 0 ? <div className="text-sm text-mute">No labelled test traffic in this sale yet. Start a bot attack and each kind of bot appears here.</div> : (
          <table className="w-full min-w-[820px] text-xs">
            <thead className="text-left text-mute"><tr><th className="pb-2">Kind of bot</th><th>What it does</th><th className="text-right">Accounts</th><th className="text-right">Got in</th><th className="text-right">Requests sent</th><th className="text-right">Turned away</th><th className="pl-3">Main reason it was stopped</th><th className="pl-3">We expected</th><th className="pl-3">Outcome</th></tr></thead>
            <tbody>{[...BOT_ORDER, "HUMAN"].filter((id) => bp[id]).map((id) => {
              const b = BOTS[id], r = bp[id], away = r.Rejected + r.Decoy, top = Object.entries(r.Reasons || {}).sort((x: any, y: any) => y[1] - x[1])[0] as any;
              const out = isOld && id !== "HUMAN" ? (r.Entered > 0 ? ["red", "grabbed seats: speed wins here"] : ["amber", "shut out"]) : id === "HUMAN" ? ["gray", isOld ? "most get ‘sold out’" : "all get in"] : r.Entered === 0 && r.Identities > 0 ? ["green", "caught completely"] : id === "SYBIL_OPERATOR" ? ["red", "gets 1 entry per bought account (not stoppable)"] : ["amber", "1 entry per account, cheating blocked"];
              return (
                <tr key={id} className="border-t border-line align-top">
                  <td className="py-2 pr-2 font-bold" style={{ color: b.color }}>{b.icon} {b.name}</td>
                  <td className="pr-3 text-ink/80">{b.does}{b.stoppedBy && <div className="mt-1 text-mute">Why it fails: {b.stoppedBy}</div>}</td>
                  <td className="text-right">{n(r.Identities)}</td><td className="text-right">{n(r.Entered)}</td><td className="text-right">{n(r.Requests)}</td><td className="text-right">{n(away)}{r.Requests ? <div className="text-mute">{Math.round((away / r.Requests) * 100)}%</div> : null}</td>
                  <td className="pl-3 text-mute">{top ? <>{REASON[top[0]]?.[0] || top[0]}<div>{n(top[1])} times</div></> : "-"}</td>
                  <td className="pl-3 text-mute">{b.expect}{!isOld && id !== "HUMAN" ? <div className={(id === "API_SCRAPER" ? r.Entered === 0 : true) && !wrong ? "font-semibold text-ok" : "font-semibold text-bad"}>{(id === "API_SCRAPER" ? r.Entered === 0 : true) && !wrong ? "✔ as expected" : "✘ NOT as expected"}</div> : null}</td>
                  <td className="pl-3"><Badge tone={out[0] as any}>{out[1]}</Badge></td>
                </tr>);
            })}</tbody>
          </table>)}
        <p className="mt-3 text-xs text-mute">Honest limit: a bot that owns many <i>genuinely verified</i> accounts (the identity farm) gets one entry per account, exactly like many different people would. Nothing in the entry flow can tell them apart; the defence is that each verified account costs real money. The numbers above show every bot type is held to one entry per account.</p>
      </Card>

      {/* scorecard */}
      <H2 id="right" sub="Every decision above is re-judged by a separate checker that uses facts the server did not decide.">Is the protection right?</H2>
      <Card className="space-y-4">
        <CardTitle right={acc !== null && <Badge tone={acc >= 99.9 ? "green" : acc >= 99 ? "amber" : "red"}>{acc.toFixed(2)}% of checks correct</Badge>}>Right and wrong decisions</CardTitle>
        {!c ? <div className="text-sm text-mute">Pick a sale with activity.</div> : (<>
          <p className="text-sm text-mute">A <b>false positive</b> is a good request wrongly turned away (a real person blocked). A <b>false negative</b> is a bad request wrongly let in (a bot that slipped through). Both should be zero. Each person passes <b>two checks</b> (get a ticket, then enter), so the “correctly allowed” number is about double the number of people.</p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid grid-cols-[110px_1fr_1fr] gap-1 text-center text-xs">
              <div /><div className="text-mute">Server turned it away</div><div className="text-mute">Server let it in</div>
              <div className="self-center text-right text-mute">Should be turned away</div>
              <div className="rounded-lg border border-ok/40 bg-ok/10 p-3"><div className="text-2xl font-bold text-ok">{n(c.TP)}</div>correct</div>
              <div className={`rounded-lg border p-3 ${c.FN ? "alarm border-bad bg-bad/20" : "border-line bg-panel2"}`}><div className={`text-2xl font-bold ${c.FN ? "text-bad" : ""}`}>{n(c.FN)}</div>FALSE NEGATIVE<br />bad let in</div>
              <div className="self-center text-right text-mute">Should be let in</div>
              <div className={`rounded-lg border p-3 ${c.FP ? "alarm border-bad bg-bad/20" : "border-line bg-panel2"}`}><div className={`text-2xl font-bold ${c.FP ? "text-bad" : ""}`}>{n(c.FP)}</div>FALSE POSITIVE<br />good turned away</div>
              <div className="rounded-lg border border-ok/40 bg-ok/10 p-3"><div className="text-2xl font-bold text-ok">{n(c.TN)}</div>correct</div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="rounded-lg border border-line p-3"><div className="mb-1 text-xs uppercase text-mute">Real people</div>{ppl.human?.attempted ? <div>Tried: <b>{n(ppl.human.attempted)}</b> · got in: <b className="text-ok">{n(ppl.human.entered)}</b> · did not: <b className={ppl.human.not_entered ? "text-warn" : ""}>{n(ppl.human.not_entered)}</b>{ppl.human.delayed_then_entered ? <div className="text-xs text-mute">{n(ppl.human.delayed_then_entered)} were asked to wait a second by the rate limit, retried, and got in.</div> : null}</div> : <span className="text-mute">none labelled</span>}</div>
              <div className="rounded-lg border border-line p-3"><div className="mb-1 text-xs uppercase text-mute">Slowed down, not blocked</div><div>{n(c.Throttled)} first tries were asked to wait a second; {n(c.Absorbed)} retries were recognised and did not create a second entry.</div></div>
            </div>
          </div>
          <div><div className="mb-1 text-xs uppercase text-mute">Were the rejections right? (each one re-checked)</div>
            <table className="w-full text-xs"><thead className="text-left text-mute"><tr><th>Why it was turned away</th><th className="text-right">turned away</th><th className="text-right">confirmed right</th><th className="text-right">wrong</th><th className="pl-3">how it was re-checked</th></tr></thead>
              <tbody>{Object.entries(prot.audit || {}).sort((a: any, b: any) => b[1].Rejected - a[1].Rejected).map(([k, v]: any) => (
                <tr key={k} className="border-t border-line"><td className="py-1">{REASON[k]?.[0] || k}</td><td className="text-right">{n(v.Rejected)}</td><td className="text-right text-ok">{n(v.Verified + (v.Unverifiable || 0))}</td><td className={`text-right ${v.Wrong ? "font-bold text-bad" : ""}`}>{n(v.Wrong)}</td><td className="pl-3 text-mute">{REASON[k]?.[1]}</td></tr>))}</tbody></table>
            {!Object.keys(prot.audit || {}).length && <div className="text-sm text-mute">No rejections yet.</div>}</div>
        </>)}
      </Card>
      {(st || stBusy) && (
        <Card className="space-y-2">
          <CardTitle right={st?.total ? <Badge tone={st.all_passed ? "green" : "red"}>{st.passed} of {st.total} passed</Badge> : undefined}>Quick safety check: requests where we already know the right answer</CardTitle>
          {stBusy && <div className="text-sm text-mute">Running a fresh mini-sale with honest people, forgers, a flood, a late arrival and a decoy… (about 10 seconds)</div>}
          {st?.error && <Callout tone="bad">{st.error}</Callout>}
          {st?.cases && <table className="w-full text-xs"><thead className="text-left text-mute"><tr><th></th><th>What we tried</th><th>What should happen</th><th>What happened</th></tr></thead>
            <tbody>{st.cases.map((x: any, i: number) => <tr key={i} className="border-t border-line"><td className={`py-1 pr-2 font-bold ${x.pass ? "text-ok" : "text-bad"}`}>{x.pass ? "✔" : "✘"}</td><td><b>{x.name}</b><div className="text-mute">{x.tried}</div></td><td>{x.expected}</td><td className={x.pass ? "" : "font-bold text-bad"}>{x.actual}</td></tr>)}</tbody></table>}
          <div className="text-xs text-mute">The correct answer is decided before each request is sent, so a wrong accept or wrong reject shows as ✘.</div>
        </Card>)}

      {/* red team */}
      <H2 id="redteam" sub="We play the bot owner and try every trick we can think of against our own system, then fix whatever works. (Security people call this a “red team”.)">Try to break it</H2>
      <Card className="space-y-3">
        <CardTitle right={rt?.total ? <Badge tone={rt.all_held ? "green" : "red"}>{rt.held} stopped · {rt.broken} got through</Badge> : before?.total ? <Badge tone="amber">last full run: {before.broken} holes found, then fixed</Badge> : undefined}>Tricks a clever bot owner would try</CardTitle>
        {rtBusy && <div className="text-sm text-mute">Trying 14 different tricks on the live system… (about 15 seconds)</div>}
        {rt?.error && <Callout tone="bad">{rt.error}</Callout>}
        {!rt && !rtBusy && <p className="text-sm text-mute">Press <b>Try to break it</b> above. Each row is something a bot owner would really try. “Before our fixes” shows what the system did the first time we attacked it: that run found real holes, which we then closed.</p>}
        {(rt?.probes || before?.probes) && (
          <table className="w-full min-w-[760px] text-xs"><thead className="text-left text-mute"><tr><th></th><th>The trick</th><th>What the attacker wants</th><th>What we did</th><th>Result now</th><th>First time we tried</th></tr></thead>
            <tbody>{(rt?.probes || before.probes).map((p: any) => { const b = before?.probes?.find((x: any) => x.id === p.id); const bad = p.verdict === "BROKEN"; return (
              <tr key={p.id} className="border-t border-line align-top">
                <td className={`py-2 pr-2 font-bold ${bad ? "text-bad" : p.verdict === "held" ? "text-ok" : "text-warn"}`}>{bad ? "✘" : p.verdict === "held" ? "✔" : "ℹ"}</td>
                <td className="pr-2"><b>{p.title}</b></td><td className="pr-2 text-ink/80">{p.goal}</td><td className="pr-2 text-mute">{p.move}</td>
                <td className="pr-2"><div className={bad ? "font-bold text-bad" : ""}>{p.result}</div><div className="text-mute">{p.why}</div></td>
                <td>{rt && b ? (b.verdict === "BROKEN" ? <Badge tone="red">was broken</Badge> : <Badge tone="green">held</Badge>) : <span className="text-mute">-</span>}</td>
              </tr>); })}</tbody></table>)}
        <p className="text-xs text-mute">The “demo secret” row works in this demo on purpose (it runs with published demo passwords); the server refuses to start with them outside demo mode.</p>
      </Card>

      {/* before / after */}
      <H2 id="compare" sub="The same crowd, three ways of selling the same seats.">Old way vs new way</H2>
      {f ? (
        <Card className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            {[["OLD WAY · first-come-first-served", f.fcfs, "#ef4444"], ["A plain random lottery", f.naive_expected, "#f59e0b"], ["NEW WAY · Fair Drop", f.fairdrop_expected, "#22c55e"]].map(([name, p, col]: any) => p && (
              <div key={name} className="rounded-xl border border-line bg-panel p-4">
                <div className="mb-2 text-sm font-semibold" style={{ color: col }}>{name}</div>
                <Bar2 label="Bots end up with this share of the seats" v={p.bot_seat_share} col={col} />
                <Bar2 label="(bots are only this share of the crowd)" v={p.bot_identity_share} col="#64748b" />
                <Bar2 label="A real person’s chance of getting a seat" v={p.human_win_rate} col="#38bdf8" max={Math.max(0.02, p.human_win_rate * 2)} />
              </div>))}
          </div>
          <p className="text-sm text-mute">{lastFull?.meta?.scenario?.description} If the coloured bar is much longer than the grey one, bots are getting more than their fair share.</p>
          <Button size="sm" variant="secondary" onClick={() => goTab("fair")}>Open the detailed results</Button>
        </Card>) : <Card className="text-sm text-mute">Run a bot attack to see the old-way-versus-new-way comparison.</Card>}

      <H2 id="tests" sub="Every kind of test in this project, what it checks, and where to run it.">What each test means</H2>
      <TestsExplained />

      {/* glossary */}
      <H2 id="words" sub="Every technical word on these screens, in plain English.">What the words mean</H2>
      <Card>
        <dl className="grid gap-x-8 gap-y-3 text-sm md:grid-cols-2">
          {([["Request / click", "One message from a person’s phone or a bot to the website (“get me a ticket”, “enter me”). In tech talk: a request. “Clicks per second” = requests per second (rps)."],
            ["Typical wait (p50)", "Line everyone up from fastest to slowest answer: the one in the middle. Half of people waited less than this."],
            ["Slow wait (p95)", "19 out of 20 people waited less than this. It shows what an unlucky visitor feels."],
            ["Slowest wait (p99)", "99 out of 100 waited less than this. The really unlucky 1%."],
            ["Server error (5xx)", "The website itself failed to answer properly (a crash or overload). Should be 0. Different from being turned away on purpose."],
            ["Turned away", "The rules said no on purpose: a used ticket, a fake ticket, too many clicks, sale closed, and so on. It is not a failure."],
            ["False positive", "A good request wrongly turned away: a real person blocked by mistake."],
            ["False negative", "A bad request wrongly let in: a bot that slipped through."],
            ["Rate limit (429)", "‘Slow down, try again in a second.’ A pause for someone clicking too fast, not a final no."],
            ["The draw", "In the fair sale everyone eligible gets in, then a draw nobody can rig picks the winners. Clicking faster doesn’t help."],
            ["Decoy trap", "A fake ‘fast lane’ that only bots find. Anyone who uses it gets a worthless receipt."],
            ["Identity farm", "A bot owner who buys many real verified accounts. Each gets one entry. It costs money per account, which is the only brake."],
            ["Redis / Postgres", "Redis is the fast memory that holds the live state. Postgres is the permanent, never-edited record kept for audits."],
            ["In flight / queue", "Requests the servers are working on right now, and records waiting to be written to the permanent database."]] as [string, string][]).map(([k, v]) => <div key={k}><dt className="font-semibold text-ink">{k}</dt><dd className="text-mute">{v}</dd></div>)}
        </dl>
      </Card>
    </div>
  );
}

function Bar2({ label, v, col, max = 1 }: { label: string; v: number; col: string; max?: number }) {
  const w = Math.min(100, ((v || 0) / max) * 100);
  return (
    <div className="mb-2"><div className="flex justify-between text-xs text-mute"><span>{label}</span><span className="text-ink">{((v || 0) * 100).toFixed(1)}%</span></div>
      <div className="h-2 overflow-hidden rounded bg-panel2"><div className="h-2 rounded" style={{ width: w + "%", background: col }} /></div></div>
  );
}
