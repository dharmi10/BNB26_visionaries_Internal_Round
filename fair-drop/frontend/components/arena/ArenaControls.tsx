"use client";
// The admin's control panel for the Live Arena: choose the crowd, switch protection, start / stop / restart.
import { useEffect, useState } from "react";
import type { Arena, Phase } from "@/lib/arena";
import { BOTS, BOT_ORDER, n } from "@/components/admin/botinfo";
import { cn } from "@/components/ui";

const MAX = 50000;
const KEY = "fd:arena-last-v2";
const clamp = (v: number) => Math.max(0, Math.min(MAX, Math.floor(v) || 0));

const PRESETS: { name: string; hint: string; people: number; bots: Record<string, number> }[] = [
  { name: "Quiet day (no bots)", hint: "A normal day: only real people.", people: 3000, bots: {} },
  { name: "A few of each bot", hint: "About 5% bots, every kind (all 11).", people: 3000, bots: { SPEED_BOT: 15, FLOOD_BOT: 10, RETRY_BOT: 12, PROXY_ROTATOR: 35, SYBIL_OPERATOR: 25, API_SCRAPER: 15, UI_MIMIC: 10, CRYPTO_SWARM: 12, SMART_SCRAPER: 10, STATE_SNIPER: 10, CLAIM_SNIPER: 8 } },
  { name: "Heavy attack (20% bots)", hint: "One in five accounts is a bot, every kind.", people: 3000, bots: { SPEED_BOT: 80, FLOOD_BOT: 50, RETRY_BOT: 60, PROXY_ROTATOR: 170, SYBIL_OPERATOR: 120, API_SCRAPER: 70, UI_MIMIC: 50, CRYPTO_SWARM: 60, SMART_SCRAPER: 50, STATE_SNIPER: 50, CLAIM_SNIPER: 40 } },
  { name: "Only a bot-account farm", hint: "The one bot we cannot fully stop.", people: 3000, bots: { SYBIL_OPERATOR: 600 } },
  { name: "Only careful bots (no decoy)", hint: "Bots that avoid the decoy and use real tickets: the fairness still holds.", people: 3000, bots: { CRYPTO_SWARM: 100, SMART_SCRAPER: 100, STATE_SNIPER: 60, CLAIM_SNIPER: 40 } },
  { name: "Only decoy-takers", hint: "Bots that all fall for the decoy trap.", people: 3000, bots: { API_SCRAPER: 300 } },
];

const PHASE_WORDS: Record<Phase, string> = {
  idle: "nothing yet",
  starting: "getting the crowd ready",
  fair: "the crowd is joining the fair draw",
  wrapup: "closing the sale and drawing winners",
  old: "the same crowd is trying the old first-come way",
  done: "finished",
};

export default function ArenaControls({ a, screenLink }: { a: Arena; screenLink?: boolean }) {
  const [people, setPeople] = useState(3000);
  const [bots, setBots] = useState<Record<string, number>>(PRESETS[1].bots);
  const [protection, setProtection] = useState(true);
  const [seconds, setSeconds] = useState(120);   // how long the fair sale stays open (watchable pace)
  const [open, setOpen] = useState(a.phase === "idle");

  // remember the last numbers used (optional convenience)
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || "null");
      if (s && typeof s.people === "number" && s.bots) { setPeople(clamp(s.people)); setBots(s.bots); setProtection(s.protection !== false); }
    } catch {}
  }, []);
  // expanded when idle, collapsed while a test runs or is done
  useEffect(() => { setOpen(a.phase === "idle"); }, [a.phase]);

  const botTotal = BOT_ORDER.reduce((s, id) => s + (bots[id] || 0), 0);
  const total = people + botTotal;
  const valid = total >= 1 && total <= MAX;
  const botPct = total > 0 ? (botTotal / total) * 100 : 0;
  const kinds = BOT_ORDER.filter((id) => (bots[id] || 0) > 0).length;
  const setBot = (id: string, v: number) => setBots((b) => ({ ...b, [id]: clamp(v) }));
  const canStart = !a.running && !a.busy && valid;

  const go = () => {
    try { localStorage.setItem(KEY, JSON.stringify({ people, bots, protection })); } catch {}
    const clean: Record<string, number> = {};
    BOT_ORDER.forEach((id) => { if ((bots[id] || 0) > 0) clean[id] = bots[id]; });
    a.start({ people, bots: clean, protection, seconds });
  };

  const summary = `${n(people)} real people + ${n(botTotal)} bot accounts${botTotal ? ` (${botPct.toFixed(1)}% bots)` : ""} · protection ${protection ? "ON" : "OFF"}`;

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-gradient-to-b from-panel2/70 to-panel shadow-lg shadow-black/20">
      {/* header: always visible */}
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="text-base font-bold">🎛 Control panel</div>
          <div className="truncate text-sm text-mute">{open ? "Choose who shows up, then press Start." : summary}</div>
        </div>
        {a.running && <span className="inline-flex items-center gap-2 rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent"><span className="h-2 w-2 animate-pulse rounded-full bg-accent" />Running: {PHASE_WORDS[a.phase]}</span>}
        {screenLink && (
          <a href="/live" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-accent/60 bg-accent/10 px-4 py-2 text-sm font-bold text-accent transition hover:bg-accent/20">🖥 Open the live screen in a new tab</a>
        )}
        <button onClick={() => setOpen(!open)} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-mute transition hover:border-accent/50 hover:text-ink">{open ? "▲ Hide" : "▼ Change the test"}</button>
      </div>

      {open && (
        <div className="space-y-5 border-t border-line px-5 py-5">
          {/* presets */}
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-mute">Quick start: pick a ready-made crowd</div>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button key={p.name} title={p.hint} onClick={() => { setPeople(p.people); setBots(p.bots); }} className="rounded-full border border-line bg-panel px-4 py-1.5 text-sm font-semibold transition hover:border-accent/60 hover:bg-panel2">{p.name}</button>
              ))}
            </div>
          </div>

          {/* real people + bot cards */}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Card color="#38bdf8" icon="🧑" name="Real people" does="Everyday people: one device, one try, polite retries." value={people} step={500} max={MAX} onChange={(v) => setPeople(clamp(v))} />
            {BOT_ORDER.map((id) => (
              <Card key={id} color={BOTS[id].color} icon={BOTS[id].icon} name={BOTS[id].name} does={BOTS[id].does} value={bots[id] || 0} step={10} max={2000} onChange={(v) => setBot(id, v)} dim={!(bots[id] || 0)} />
            ))}
          </div>

          {/* totals */}
          <div className={cn("rounded-xl border px-4 py-3 text-sm", valid ? "border-line bg-panel" : "border-bad/60 bg-bad/10")}>
            <b className="tabular-nums">{n(people)}</b> real people + <b className="tabular-nums">{n(botTotal)}</b> bot accounts = <b className={cn("tabular-nums", valid ? "text-ok" : "text-bad")}>{n(total)}</b> accounts <span className="text-mute">(max {n(MAX)})</span>
            {valid && botTotal > 0 && <span className="text-mute"> · bots are {botPct.toFixed(1)}% of the crowd ({kinds} kind{kinds === 1 ? "" : "s"})</span>}
            {!valid && <span className="ml-2 font-semibold text-bad">{total < 1 ? "Add at least one account." : `Too many: lower it by ${n(total - MAX)}.`}</span>}
          </div>

          {/* how long */}
          <div className="rounded-xl border border-line bg-panel p-4 text-sm">
            <div className="mb-2 font-bold">How fast should the crowd arrive?</div>
            <div className="flex flex-wrap gap-2">
              {[[20, "Very fast (20 s)"], [60, "Fast (1 min)"], [120, "Watchable (2 min)"], [300, "Slow (5 min)"]].map(([v, l]) => (
                <button key={v} type="button" onClick={() => setSeconds(v as number)} className={cn("rounded-lg border px-3 py-1.5 text-xs font-semibold", seconds === v ? "border-accent bg-accent/15 text-accent" : "border-line text-mute hover:text-ink")}>{l}</button>))}
            </div>
            <div className="mt-2 text-xs text-mute">Same crowd either way. A longer sale just gives you time to watch the bots work. The old way then runs for the same length.</div>
          </div>

          {/* protection */}
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-panel p-4">
            <button type="button" role="switch" aria-checked={protection} onClick={() => setProtection(!protection)} className={cn("relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition", protection ? "bg-ok" : "bg-line")}>
              <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all", protection ? "left-[22px]" : "left-0.5")} />
            </button>
            <span className="text-sm"><b>Protection {protection ? "ON" : "OFF"}</b><br /><span className="text-mute">Protection is the set of rules that stop bots (one entry per verified person, rate limits, the decoy trap). Turn it off to see what the bots can do without it.</span></span>
          </label>
        </div>
      )}

      {/* action row: always visible */}
      <div className="flex flex-wrap items-center gap-3 border-t border-line bg-bg/40 px-5 py-4">
        <button onClick={go} disabled={!canStart} className="rounded-xl bg-accent px-8 py-3 text-base font-bold text-black shadow-lg shadow-accent/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">▶ Start</button>
        <button onClick={() => a.stop()} disabled={!a.running} className="rounded-xl border border-line bg-panel2 px-5 py-3 text-sm font-semibold transition hover:border-bad/60 disabled:cursor-not-allowed disabled:opacity-40">■ Stop</button>
        <button onClick={() => a.restart()} disabled={a.busy} className="rounded-xl border border-line px-5 py-3 text-sm font-semibold text-mute transition hover:border-warn/60 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40">🔄 Restart: clear everything</button>
        {a.running && <span className="text-sm text-accent">Running: {PHASE_WORDS[a.phase]}</span>}
        {a.msg && (
          <div className="ml-auto flex max-w-full items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink/90">
            <span>{a.msg}</span>
            <button onClick={a.clearMsg} aria-label="Dismiss" className="text-mute hover:text-ink">✕</button>
          </div>
        )}
      </div>
    </section>
  );
}

// one card: icon, name, what it does, stepper + slider
function Card({ color, icon, name, does, value, step, max, onChange, dim }: { color: string; icon: string; name: string; does: string; value: number; step: number; max: number; onChange: (v: number) => void; dim?: boolean }) {
  return (
    <div className={cn("rounded-xl border border-line bg-panel p-3 transition", dim && "opacity-60 hover:opacity-100")} style={{ borderTop: `3px solid ${color}` }}>
      <div className="font-bold" style={{ color }}>{icon} {name}</div>
      <div className="mb-3 mt-0.5 min-h-[2.5rem] text-xs leading-snug text-mute">{does}</div>
      <div className="flex items-center gap-1.5">
        <button type="button" aria-label={`Fewer ${name}`} onClick={() => onChange(value - step)} className="h-9 w-9 shrink-0 rounded-lg border border-line bg-panel2 text-lg font-bold hover:border-accent/60">−</button>
        <input type="number" min={0} max={MAX} value={value} onChange={(e) => onChange(+e.target.value)} className="h-9 w-full min-w-0 rounded-lg border border-line bg-panel2 px-2 text-center text-lg font-bold tabular-nums outline-none focus:border-accent" />
        <button type="button" aria-label={`More ${name}`} onClick={() => onChange(value + step)} className="h-9 w-9 shrink-0 rounded-lg border border-line bg-panel2 text-lg font-bold hover:border-accent/60">+</button>
      </div>
      <input type="range" min={0} max={max} step={step} value={Math.min(value, max)} onChange={(e) => onChange(+e.target.value)} aria-label={name} className="mt-3 w-full" style={{ accentColor: color }} />
    </div>
  );
}
