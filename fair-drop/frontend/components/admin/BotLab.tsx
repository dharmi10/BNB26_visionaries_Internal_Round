"use client";
import { useState } from "react";
import { api, testKey } from "@/lib/api";
import { Button, Callout, Card, CardTitle } from "@/components/ui";
import { BOTS, BOT_ORDER, n } from "./botinfo";

// "Bot Lab": choose your own crowd (how many real people, how many bots of each kind) and run exactly that.
const PRESETS: { name: string; hint: string; people: number; bots: Record<string, number> }[] = [
  { name: "No bots", hint: "a normal day: only real people", people: 3000, bots: {} },
  { name: "A few of each", hint: "about 5% bots, every kind (all 11)", people: 3000, bots: { SPEED_BOT: 15, FLOOD_BOT: 10, RETRY_BOT: 12, PROXY_ROTATOR: 35, SYBIL_OPERATOR: 25, API_SCRAPER: 15, UI_MIMIC: 10, CRYPTO_SWARM: 12, SMART_SCRAPER: 10, STATE_SNIPER: 10, CLAIM_SNIPER: 8 } },
  { name: "Heavy attack", hint: "20% bots, every kind (all 11)", people: 3000, bots: { SPEED_BOT: 80, FLOOD_BOT: 50, RETRY_BOT: 60, PROXY_ROTATOR: 170, SYBIL_OPERATOR: 120, API_SCRAPER: 70, UI_MIMIC: 50, CRYPTO_SWARM: 60, SMART_SCRAPER: 50, STATE_SNIPER: 50, CLAIM_SNIPER: 40 } },
  { name: "Only a big identity farm", hint: "the one bot we can't fully stop", people: 3000, bots: { SYBIL_OPERATOR: 600 } },
  { name: "Only careful bots (no decoy)", hint: "bots that avoid the decoy and use real tickets", people: 3000, bots: { CRYPTO_SWARM: 100, SMART_SCRAPER: 100, STATE_SNIPER: 60, CLAIM_SNIPER: 40 } },
  { name: "Only shortcut seekers", hint: "all fall for the decoy", people: 3000, bots: { API_SCRAPER: 300 } },
];

export default function BotLab({ running, onStarted }: { running: boolean; onStarted: (msg: string) => void }) {
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState(3000);
  const [bots, setBots] = useState<Record<string, number>>(PRESETS[1].bots);
  const [err, setErr] = useState("");
  const botTotal = Object.values(bots).reduce((a, b) => a + (b || 0), 0);
  const total = people + botTotal;
  const set = (id: string, v: number) => setBots((b) => ({ ...b, [id]: Math.max(0, Math.min(50000, Math.floor(v) || 0)) }));
  const chosen = BOT_ORDER.filter((id) => (bots[id] || 0) > 0);

  const run = async () => {
    setErr("");
    try {
      await api("/test/config", { body: { guard: { enabled: true } }, headers: { "X-Test-Key": testKey.get() } });
      await api("/run", { method: "POST", base: "/attack", headers: { "X-Test-Key": testKey.get() }, body: { experiment: "custom", spec: { people, bots }, also_fcfs: true } });
      onStarted(`Your test started: ${n(people)} real people and ${n(botTotal)} bots (${chosen.length} kind${chosen.length === 1 ? "" : "s"}). Watch the picture below.`);
    } catch (e: any) { setErr(e.body?.error || e.body?.detail || e.message); }
  };

  return (
    <Card className="space-y-3">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left">
        <span><span className="text-base font-bold">🧪 Bot Lab: design your own test</span><span className="ml-2 text-sm text-mute">choose which kinds of bots, and how many of each</span></span>
        <span className="text-mute">{open ? "▲ hide" : "▼ open"}</span>
      </button>
      {open && (
        <div className="space-y-4">
          <p className="text-sm text-mute">Pick a ready-made crowd, or set the numbers yourself. Then press <b>Run this test</b>. You will see which bots get in, which are stopped, and why. Every bot account is a verified account that is allowed one entry, like a person; what we test is whether any bot can get <i>more</i> than one, or get past the rules.</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => <button key={p.name} onClick={() => { setPeople(p.people); setBots(p.bots); }} title={p.hint} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:bg-panel2">{p.name}<span className="ml-1 font-normal text-mute">· {p.hint}</span></button>)}
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <label className="rounded-xl border border-line bg-panel p-3" style={{ borderTop: "3px solid #38bdf8" }}>
              <div className="font-bold text-[#38bdf8]">🧑 Real people</div>
              <div className="mb-2 text-xs text-mute">{BOTS.HUMAN.does}</div>
              <input type="number" min={0} max={50000} step={500} value={people} onChange={(e) => setPeople(Math.max(0, Math.floor(+e.target.value) || 0))} className="w-full rounded-lg border border-line bg-panel2 px-3 py-1.5 text-lg font-bold" />
            </label>
            {BOT_ORDER.map((id) => {
              const b = BOTS[id], v = bots[id] || 0;
              return (
                <label key={id} className={`rounded-xl border bg-panel p-3 ${v ? "border-line" : "border-line opacity-60"}`} style={{ borderTop: `3px solid ${b.color}` }}>
                  <div className="font-bold" style={{ color: b.color }}>{b.icon} {b.name}</div>
                  <div className="mb-2 text-xs text-mute">{b.does}</div>
                  <input type="number" min={0} max={50000} step={10} value={v} onChange={(e) => set(id, +e.target.value)} className="w-full rounded-lg border border-line bg-panel2 px-3 py-1.5 text-lg font-bold" />
                  <div className="mt-1 text-[11px] text-mute">{v ? `We expect: ${b.expect}` : "not in this test"}</div>
                </label>);
            })}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="text-sm"><b>{n(people)}</b> people + <b>{n(botTotal)}</b> bots = <b className={total > 50000 || total < 1 ? "text-bad" : "text-ok"}>{n(total)}</b> accounts <span className="text-mute">(from 1 up to 50,000){botTotal ? ` · bots are ${((botTotal / Math.max(1, total)) * 100).toFixed(1)}% of the crowd` : ""}</span></div>
            <Button onClick={run} disabled={running || total < 1 || total > 50000}>{running ? "A test is running…" : "▶ Run this test"}</Button>
          </div>
          {err && <Callout tone="bad">{err}</Callout>}
        </div>)}
    </Card>
  );
}
