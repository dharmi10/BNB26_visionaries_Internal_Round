"use client";
import { useEffect, useState } from "react";
import { adminToken, api, API, testKey, usePoll } from "@/lib/api";
import { Button, Callout, Card, CardTitle, Select, Stat } from "@/components/ui";

const NOW: Record<string, string> = {
  SCHEDULED: "Not started yet. Nobody can join.",
  OPEN: "Open. People can join the sale right now.",
  CLOSED: "Joining has closed. The list of entries is final but not yet published.",
  LOCKED: "The entry list is published and sealed. The random draw has not happened yet.",
  DRAWN: "The draw is done. Winners are decided but have not been asked to claim yet.",
  CLAIM: "Winners are claiming their seats. Unclaimed seats go to the next person in line.",
  SETTLED: "Finished. All seats are given out.",
};
const STEP: Record<string, Record<string, [string, string]>> = {
  fairdrop: { SCHEDULED: ["OPEN", "Open the sale"], OPEN: ["CLOSED", "Stop letting people join"], CLOSED: ["LOCKED", "Seal and publish the entry list"], LOCKED: ["DRAWN", "Run the random draw"], DRAWN: ["CLAIM", "Let winners claim seats"], CLAIM: ["SETTLED", "Finish the sale"] },
  fcfs: { SCHEDULED: ["OPEN", "Open the sale"], OPEN: ["CLOSED", "Close the sale"], CLOSED: ["SETTLED", "Finish the sale"] },
};
const pct = (x: any) => (x == null ? "n/a" : `${(x * 100).toFixed(1)}%`);

export default function OverviewTab({ dropId, setDropId, go }: { dropId: string; setDropId: (s: string) => void; go: (t: string) => void }) {
  const { data: drops, reload } = usePoll(() => api<any[]>("/admin/drops", { auth: "admin" }), 3000);
  const [s, setS] = useState<any>(null);
  useEffect(() => {
    setS(null);
    if (!dropId) return;
    const es = new EventSource(`${API}/admin/drops/${dropId}/live?access_token=${encodeURIComponent(adminToken.get() || "")}`);
    es.onmessage = (m) => setS(JSON.parse(m.data));
    return () => es.close();
  }, [dropId]);
  const { data: integ } = usePoll(() => (dropId ? api<any>(`/admin/drops/${dropId}/integrity`, { auth: "admin" }) : Promise.resolve(null)), 4000, [dropId]);
  const { data: exps } = usePoll(() => api<any[]>("/admin/experiments", { auth: "admin" }), 6000);
  const [last, setLast] = useState<any>(null);
  const latest = exps?.find((x) => !x.name.includes("live FCFS") && !x.name.includes("exp1") && !x.name.includes("exp6") && !x.name.includes("exp7"));
  useEffect(() => { if (latest) api(`/admin/experiments/${latest.id}`, { auth: "admin" }).then(setLast).catch(() => {}); }, [latest?.id]);

  const { data: runs } = usePoll(() => api<any[]>("/runs", { base: "/attack", headers: { "X-Test-Key": testKey.get() } }), 3000);
  const running = runs?.find((r) => r.status === "running");
  const [msg, setMsg] = useState("");
  const [size, setSize] = useState("0.1");
  const startBots = async () => {
    setMsg("");
    try { await api("/run", { method: "POST", base: "/attack", headers: { "X-Test-Key": testKey.get() }, body: { experiment: "exp2", scale: +size, also_fcfs: true } }); setMsg("Started. Bots and people are now trying to enter. Their sale will appear in the list above in a few seconds."); }
    catch (e: any) { setMsg("Could not start: " + (e.body?.detail || e.message)); }
  };
  const next = async () => {
    const d = drops?.find((x) => x.id === dropId); if (!d) return;
    const st = STEP[d.mode]?.[d.state]; if (!st) return;
    try { await api(`/admin/drops/${dropId}/advance`, { body: { to: st[0] }, auth: "admin" }); } catch (e: any) { setMsg(e.message); }
    reload();
  };

  const d = drops?.find((x) => x.id === dropId);
  const step = d ? STEP[d.mode]?.[d.state] : undefined;
  const lab = s?.labels;
  const seats = s?.seats_total;
  const f = last?.policies;
  const bad = integ && !integ.ok;

  return (
    <div className="space-y-5">
      <Card className="space-y-3">
        <CardTitle>1. Pick a sale</CardTitle>
        <Select value={dropId} onChange={(e) => setDropId(e.target.value)}>
          <option value="">Choose a sale…</option>
          {(drops || []).map((x) => <option key={x.id} value={x.id}>{x.event_name.replace("Fair Drop Experiment: ", "Bot test ")} · {x.mode === "fcfs" ? "first-come-first-served" : "fair lottery"} · {x.state} · #{x.id.slice(-6)}</option>)}
        </Select>
        {d && <div className="text-sm"><b>Right now:</b> {NOW[d.state]}</div>}
        {step && <Button onClick={next}>Next step: {step[1]}</Button>}
      </Card>

      {s && (
        <>
          <div>
            <h2 className="mb-2 text-lg font-semibold">2. Who is in this sale</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Registered people who asked to join" value={s.tokens_issued.toLocaleString()} sub="each verified person can join once" />
              <Stat label="Entries in the draw" value={s.entries_registered.toLocaleString()} sub="people who completed the entry" />
              <Stat label="Real people" value={lab ? lab.entries_human.toLocaleString() : "unknown"} sub={lab ? "from test labels" : "no test labels loaded"} tone="ok" />
              <Stat label="Bots" value={lab ? lab.entries_bot.toLocaleString() : "unknown"} sub={lab ? "from test labels" : "the system cannot tell bots apart on its own"} tone={lab && lab.entries_bot > 0 ? "warn" : undefined} />
            </div>
            <div className="mt-2 text-xs text-mute">{seats} seats for sale. {lab && lab.entries_human + lab.entries_bot < s.entries_registered ? "Warning: the bot/people labels only cover " + (lab.entries_human + lab.entries_bot).toLocaleString() + " of the " + s.entries_registered.toLocaleString() + " entries, because labels are kept only for the most recent bot test. Pick that test's sale for exact counts." : ""} Bot and people counts come from the test files the attack tool writes. In a real sale no one knows who is a bot, which is why the draw ignores speed and request volume.</div>
          </div>

          <div>
            <h2 className="mb-2 text-lg font-semibold">3. Is the sale healthy and honest?</h2>
            {bad ? <Callout tone="bad" title="Problem found">The safety checks found something wrong ({integ.total_violations}). Open the “Audit & integrity” tab to see what.</Callout>
              : <Callout tone="ok" title="All checks passed">No seat sold twice, no one entered twice, no entries missing from the published list.</Callout>}
            <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Requests per second" value={Math.round(s.rps ?? 0).toLocaleString()} sub="how busy the site is" />
              <Stat label="Slowest 1% of requests" value={`${s.p99_ms.toFixed(0)} ms`} sub="under 500 ms is good" tone={s.p99_ms > 500 ? "warn" : "ok"} />
              <Stat label="Servers running" value={`${s.replicas.filter((r: any) => r.healthy).length} of ${s.replicas.length}`} sub="if one stops, others take over" tone={s.replicas.some((r: any) => !r.healthy) ? "bad" : "ok"} />
              <Stat label="Blocked attempts" value={((s.counters?.rejected_reused || 0) + (s.counters?.rejected_bad_sig || 0) + (s.counters?.rejected_already_issued || 0)).toLocaleString()} sub="someone tried to enter twice or cheat" />
            </div>
          </div>
        </>
      )}

      <Card className="space-y-3">
        <CardTitle>Test it with bots</CardTitle>
        <p className="text-sm text-mute">This sends a crowd of normal people plus bots (some hammering from thousands of fake addresses) at two sales: the usual first-come-first-served one, and ours. Then it shows who got the seats.</p>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={size} onChange={(e) => setSize(e.target.value)} className="max-w-xs"><option value="0.05">Tiny test (2,500 people, about 1 min)</option><option value="0.1">Small test (5,000 people, about 1 min)</option><option value="1">Full test (50,000 people, about 3 min)</option></Select>
          <Button onClick={startBots} disabled={!!running}>{running ? "Running…" : "Start bots"}</Button>
        </div>
        {running && <div className="text-sm text-warn">A test is running. Watch the numbers above change. Pick the newest sale in the list (names start with “exp-”).</div>}
        {msg && <div className="text-sm">{msg}</div>}
      </Card>

      {f && (
        <Card className="space-y-3">
          <CardTitle>Who got the seats in the latest bot test?</CardTitle>
          <p className="text-sm text-mute">Test: {last.meta.scenario.description}</p>
          <div className="grid gap-3 md:grid-cols-3">
            <Stat label="Bots were this share of all people" value={pct(f.fairdrop_expected?.bot_identity_share)} />
            <Stat label="First-come-first-served gave bots" value={pct(f.fcfs?.bot_seat_share)} sub="of the seats" tone="bad" />
            <Stat label="Our fair lottery gave bots" value={pct(f.fairdrop_expected?.bot_seat_share)} sub="of the seats" tone="ok" />
          </div>
          <p className="text-sm">{f.fairdrop_expected?.bot_seat_share <= (f.fairdrop_expected?.bot_identity_share || 0) * 1.5
            ? "With the fair lottery, bots got about the same as their share of people, so being fast or sending lots of requests gave them nothing extra."
            : "Bots got more than their share. That is a problem worth investigating."}</p>
          <Button variant="secondary" size="sm" onClick={() => go("fair")}>See full charts</Button>
        </Card>
      )}

      <Card>
        <CardTitle>Words used in this dashboard</CardTitle>
        <dl className="grid gap-2 text-sm md:grid-cols-2">
          {[["Sale / drop", "One ticket sale for one event."], ["Entry", "A person's one chance in the draw. One per verified person."], ["Draw", "Picking winners by fair random numbers anyone can re-check."], ["Seal the list", "Publishing a fingerprint of all entries before the draw, so nobody can add or remove entries afterwards."], ["First-come-first-served", "The usual way: fastest wins. Bots love it."], ["Bot advantage", "Bot share of seats divided by bot share of people. 1 means fair. Higher means bots beat people."], ["Claim", "A winner confirming they want their seat. If they don't in time, the next person gets it."], ["Integrity check", "Automatic checks that nothing was sold twice or tampered with."]].map(([a, b]) => <div key={a}><dt className="font-semibold">{a}</dt><dd className="text-mute">{b}</dd></div>)}
        </dl>
      </Card>
    </div>
  );
}
