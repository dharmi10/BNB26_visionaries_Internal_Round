"use client";
import { memo, useEffect, useRef } from "react";
import type { Arena, MethodView } from "@/lib/arena";
import { SEATS } from "@/lib/arena";

const HUMAN = "#38bdf8", BOT = "#fb923c";
const COLS = 25, ROWS = 20, CELL = 24, GAP = 3;

const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
const pct = (x: number | null) => (x === null || !Number.isFinite(x) ? "" : (x >= 10 || x === 0 ? Math.round(x) : Math.round(x * 10) / 10) + "%");

const STATUS: Record<MethodView["status"], string> = { live: "Real result so far", expected: "Expected split so far", estimate: "Estimate from same traffic", final: "Final result", waiting: "Waiting" };

const COLUMNS: { key: "fcfs" | "naive" | "fair"; n: number; title: string; sub: string }[] = [
  { key: "fcfs", n: 1, title: "First come, first served", sub: "The old way: fastest click wins." },
  { key: "naive", n: 2, title: "Simple lottery", sub: "Random draw, but every request is a ticket." },
  { key: "fair", n: 3, title: "Fair Drop", sub: "One verified person = one entry, sealed list, checkable draw." },
];

function verdict(m: MethodView): { tone: "gray" | "green" | "amber" | "red"; text: string } {
  if (m.status === "waiting") return { tone: "gray", text: "Waiting" };
  if (!(num(m.botCrowdSharePct) > 0)) return { tone: "gray", text: "No bots in this test" };
  const r = num(m.botSeatSharePct) / m.botCrowdSharePct;
  const rt = (Math.round(r * 10) / 10).toFixed(1);
  if (r <= 1.25) return { tone: "green", text: "Bots get no more than their fair share" };
  return { tone: r <= 2.5 ? "amber" : "red", text: `Bots take ${rt}x their share` };
}
const TONE = {
  gray: "border-line bg-panel2 text-mute",
  green: "border-ok/50 bg-ok/15 text-ok",
  amber: "border-warn/50 bg-warn/15 text-warn",
  red: "border-bad/50 bg-bad/15 text-bad",
};

// 500 squares on one canvas; redraws (with a short count-up) only when the two seat numbers change.
const SeatGrid = memo(function SeatGrid({ humanSeats, botSeats }: { humanSeats: number; botSeats: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const shown = useRef({ h: 0, b: 0 });
  useEffect(() => {
    const c = ref.current, ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const tH = Math.min(SEATS, Math.max(0, Math.round(humanSeats)));
    const tB = Math.min(SEATS - tH, Math.max(0, Math.round(botSeats)));
    const draw = (h: number, b: number) => {
      ctx.clearRect(0, 0, c.width, c.height);
      for (let i = 0; i < COLS * ROWS; i++) {
        ctx.fillStyle = i < h ? HUMAN : i < h + b ? BOT : "#1b2738";
        ctx.fillRect((i % COLS) * CELL, Math.floor(i / COLS) * CELL, CELL - GAP, CELL - GAP);
      }
    };
    const from = { ...shown.current };
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { shown.current = { h: tH, b: tB }; draw(tH, tB); return; }
    let raf = 0; const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 600), e = 1 - Math.pow(1 - k, 3);
      const h = Math.round(from.h + (tH - from.h) * e), b = Math.round(from.b + (tB - from.b) * e);
      shown.current = { h, b }; draw(h, b);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [humanSeats, botSeats]);
  return <canvas ref={ref} width={COLS * CELL - GAP} height={ROWS * CELL - GAP} className="block h-auto w-full rounded-md" role="img" aria-label={`${humanSeats} seats to real people, ${botSeats} seats to bots, out of ${SEATS}`} />;
});

function Column({ m, spec }: { m: MethodView; spec: (typeof COLUMNS)[number] }) {
  const hl = spec.key === "fair";
  const v = verdict(m);
  const hs = Math.max(0, Math.round(num(m.humanSeats))), bs = Math.max(0, Math.round(num(m.botSeats)));
  const waiting = m.status === "waiting";
  return (
    <div className={"flex min-w-0 flex-col rounded-2xl border p-4 md:p-5 " + (hl ? "border-accent/70 bg-gradient-to-b from-accent/10 via-panel to-panel2/70 shadow-[0_0_40px_-8px_rgba(45,212,191,0.45)]" : "border-line bg-gradient-to-b from-panel to-panel2/50")}>
      <div className="flex min-h-[4.5rem] items-start gap-3">
        <span className={"grid h-9 w-9 shrink-0 place-items-center rounded-full text-lg font-extrabold " + (hl ? "bg-accent text-bg" : "bg-panel2 text-ink ring-1 ring-line")}>{spec.n}</span>
        <div className="min-w-0">
          <div className="text-xl font-extrabold leading-tight text-ink 2xl:text-2xl">{spec.title}</div>
          <div className="text-sm text-mute">{spec.sub}</div>
        </div>
      </div>
      <div className="mt-3"><span title={m.note} className={"inline-block rounded-full border px-3 py-1 text-xs font-semibold " + (m.status === "final" ? "border-ok/50 bg-ok/10 text-ok" : "border-line bg-bg/40 text-mute")}>{STATUS[m.status]}</span></div>

      <div className={"mt-4 " + (waiting ? "opacity-50" : "")}><SeatGrid humanSeats={hs} botSeats={bs} /></div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-mute">
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: HUMAN }} />Real person</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: BOT }} />Bot</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-[#1b2738]" />Empty</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div><div className="text-3xl font-extrabold tabular-nums 2xl:text-4xl" style={{ color: HUMAN }}>{hs}</div><div className="text-sm text-ink/80">Real people got {hs} of {SEATS}</div></div>
        <div><div className="text-3xl font-extrabold tabular-nums 2xl:text-4xl" style={{ color: BOT }}>{bs}</div><div className="text-sm text-ink/80">Bots got {bs} of {SEATS}</div></div>
      </div>

      <div className={"mt-4 rounded-xl border px-3 py-2 text-center text-sm font-bold " + TONE[v.tone]}>{v.text}</div>

      {!waiting && (
        <ul className="mt-3 space-y-1 text-sm text-ink/85">
          <li>Bots are {pct(num(m.botCrowdSharePct)) || "0%"} of the crowd but took {pct(num(m.botSeatSharePct)) || "0%"} of the seats</li>
          {m.humanChancePct !== null && <li>A real person&apos;s chance: <b className="tabular-nums" style={{ color: HUMAN }}>{pct(m.humanChancePct)}</b></li>}
          {m.botChancePct !== null && <li>A bot account&apos;s chance: <b className="tabular-nums" style={{ color: BOT }}>{pct(m.botChancePct)}</b></li>}
          {m.botAccountsWithSeat !== null && <li>Bot accounts holding a seat: <b className="tabular-nums">{m.botAccountsWithSeat}</b></li>}
        </ul>
      )}
      <p className="mt-auto pt-3 text-xs leading-snug text-mute">{m.note}</p>
    </div>
  );
}

export default function MethodCompare({ a }: { a: Arena }) {
  return (
    <section>
      <p className="mb-4 text-lg font-semibold text-ink md:text-xl">Same crowd, same {SEATS} seats, three ways of handing them out. Look at the orange squares: those are seats that went to bots.</p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {COLUMNS.map((c) => <Column key={c.key} m={a.methods[c.key]} spec={c} />)}
      </div>
      <div className="mt-4 grid gap-3 text-sm text-mute md:grid-cols-2">
        <p className="rounded-xl border border-line bg-panel/60 p-3"><b className="text-ink">One thing no method can stop:</b> someone who buys many real verified accounts still gets one entry per account (it just costs them money). The numbers above include that.</p>
        <p className="rounded-xl border border-line bg-panel/60 p-3"><b className="text-ink">About column 2:</b> {a.methods.naive.status === "final" ? "this is not a separate live run: it is calculated from the same traffic, averaged over 200 random draws." : "the numbers are estimated from the same traffic, not a separate live run. They become exact when the final result arrives."}</p>
      </div>
    </section>
  );
}
