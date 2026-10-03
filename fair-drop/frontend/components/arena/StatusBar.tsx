"use client";
// "What is happening right now?" banner: 4-step tracker, one plain sentence, live counters, and the independent judge's tally.
import { useEffect, useRef, useState } from "react";
import type { Arena, Phase } from "@/lib/arena";
import { n } from "@/components/admin/botinfo";
import { cn } from "@/components/ui";

const STEPS = [
  "Crowd arrives & joins the fair draw",
  "Sale closes, list is sealed, winners drawn",
  "The same crowd tries the old first-come-first-served way",
  "Compare results",
];
// index of the current step (0-based); -1 = none. "done" = last step.
const STEP_OF: Record<Phase, number> = { idle: -1, starting: 0, fair: 0, wrapup: 1, old: 2, done: 3 };

const fmt = (ms: number) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

export default function StatusBar({ a }: { a: Arena }) {
  // smooth the countdown between polls (1 tick per second, not per frame)
  const base = useRef({ ms: a.closesInMs, at: Date.now() });
  const [, tick] = useState(0);
  useEffect(() => { base.current = { ms: a.closesInMs, at: Date.now() }; }, [a.closesInMs]);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  const left = base.current.ms === null ? null : Math.max(0, base.current.ms - (Date.now() - base.current.at));

  const step = STEP_OF[a.phase];
  const sentence: Record<Phase, string> = {
    idle: "Nothing is running. Choose a crowd below and press Start.",
    starting: "Getting everything ready: setting up the sale and the crowd.",
    fair: `The crowd is joining the fair draw right now. Joining first or last makes no difference.${left !== null ? ` The sale closes in ${fmt(left)}.` : ""}`,
    wrapup: "The sale has closed. The list of entries is being sealed and the winners are drawn at random.",
    old: "Now the very same crowd tries the old way, where the fastest clicks win. Watch who gets the seats.",
    done: a.verdictFinal ? "All done. These are the final numbers: compare the three methods below." : "All done. The exact final numbers are still being worked out: what you see is a close estimate.",
  };

  if (a.phase === "idle") {
    return <div className="rounded-2xl border border-line bg-gradient-to-r from-panel to-panel2/50 px-5 py-4 text-sm text-mute">😴 {sentence.idle}</div>;
  }

  const r = a.rates;
  const counters: [string, number, string][] = [
    ["People on the site now", r.active, "#38bdf8"],
    ["Requests per second", r.rps, "#e8eef6"],
    ["Let in per second", r.letInPerSec, "#22c55e"],
    ["Turned away per second", r.blockedPerSec, "#ef4444"],
  ];

  return (
    <div className="space-y-4 rounded-2xl border border-line bg-gradient-to-br from-panel2/70 via-panel to-panel p-5 shadow-lg shadow-black/20">
      <ol className="grid gap-2 md:grid-cols-4">
        {STEPS.map((s, i) => {
          const done = i < step || (a.phase === "done" && i === 3);
          const now = i === step && !done;
          return (
            <li key={s} className={cn("flex items-start gap-3 rounded-xl border px-3 py-2.5 text-sm transition", done ? "border-ok/40 bg-ok/10" : now ? "border-accent bg-accent/15 shadow-[0_0_0_1px] shadow-accent/30" : "border-line opacity-60")}>
              <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold", done ? "bg-ok text-black" : now ? "bg-accent text-black" : "bg-panel2 text-mute")}>{done ? "✓" : i + 1}</span>
              <span className={cn("leading-snug", now ? "font-semibold text-ink" : done ? "text-ink/90" : "text-mute")}>{s}</span>
            </li>
          );
        })}
      </ol>

      <p className="text-base font-medium text-ink">
        {a.phase === "fair" && left !== null && <span className="mr-2 inline-block rounded-lg bg-accent/15 px-2.5 py-0.5 font-bold tabular-nums text-accent" title="time until the sale closes">⏱ {fmt(left)}</span>}
        {sentence[a.phase]}
      </p>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {counters.map(([label, v, c]) => (
          <div key={label} className="rounded-xl border border-line bg-bg/40 px-3 py-2">
            <div className="text-2xl font-bold tabular-nums" style={{ color: c }}>{n(Math.round(v))}</div>
            <div className="text-xs text-mute">{label}</div>
          </div>
        ))}
      </div>

      {a.decisions > 0 && (
        <div className={cn("rounded-xl border px-4 py-2 text-sm font-semibold", a.wrong === 0 ? "border-ok/40 bg-ok/10 text-ok" : "border-bad/60 bg-bad/15 text-bad")} title="The judge replays each decision from the raw records, separately from the server.">
          ⚖ {n(a.decisions)} decisions were re-checked by an independent judge: {n(a.wrong)} {a.wrong === 1 ? "was" : "were"} wrong
        </div>
      )}
    </div>
  );
}
