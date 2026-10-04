"use client";
import type { Arena } from "@/lib/arena";
import { BOTS, n } from "@/components/admin/botinfo";

const HUMAN = "#38bdf8";
const pctOf = (x: number, t: number) => (t > 0 ? (x / t) * 100 : 0);
const fmtPct = (p: number) => (p >= 10 || p === 0 ? Math.round(p) : Math.round(p * 10) / 10) + "%";

export default function CrowdStrip({ a }: { a: Arena }) {
  const { humans, bots, total } = a.crowd;
  if (!total) {
    return (
      <div className="rounded-2xl border border-line bg-gradient-to-b from-panel to-panel2/60 px-6 py-8 text-center">
        <div className="text-2xl font-bold text-ink">No test yet. Press Start to create a crowd.</div>
      </div>
    );
  }
  const kinds = a.profiles;
  const kindTotal = kinds.reduce((s, p) => s + p.accounts, 0) || 1;
  return (
    <div className="rounded-2xl border border-line bg-gradient-to-b from-panel to-panel2/60 p-5 md:p-6">
      <div className="text-xs font-semibold uppercase tracking-widest text-mute">Who is in this test?</div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-3xl font-extrabold leading-tight text-ink md:text-4xl 2xl:text-5xl">
        <span><span style={{ color: HUMAN }}>{n(humans)}</span> real people</span>
        <span className="text-mute">+</span>
        <span><span className="text-[#fb923c]">{n(bots)}</span> bot accounts</span>
        <span className="text-mute">=</span>
        <span>{n(total)} accounts</span>
      </div>
      <p className="mt-2 text-sm text-mute md:text-base">A bot account is a verified account run by a program. Each one counts as one account, exactly like a person.</p>

      <div className="mt-5 flex h-8 w-full gap-[2px] overflow-hidden rounded-lg bg-bg/60 md:h-10" role="img" aria-label={`${n(humans)} real people and ${n(bots)} bot accounts`}>
        {kinds.map((p) => {
          const b = BOTS[p.id];
          return (
            <div key={p.id} title={`${b?.name ?? p.id}: ${n(p.accounts)} accounts (${fmtPct(pctOf(p.accounts, kindTotal))})`}
              className="h-full transition-[flex-grow] duration-700 ease-out motion-reduce:transition-none"
              style={{ flex: `${Math.max(p.accounts, kindTotal * 0.012)} 1 0`, background: b?.color ?? "#64748b", minWidth: 6 }} />
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {kinds.map((p) => {
          const b = BOTS[p.id];
          return (
            <div key={p.id} className="flex items-center gap-2 rounded-xl border border-line bg-bg/40 py-1.5 pl-2 pr-3" style={{ borderLeft: `4px solid ${b?.color ?? "#64748b"}` }} title={b?.does}>
              <span className="text-xl leading-none">{b?.icon}</span>
              <span className="text-sm font-semibold text-ink">{b?.name ?? p.id}</span>
              <span className="text-sm font-bold tabular-nums" style={{ color: b?.color }}>{n(p.accounts)}</span>
              <span className="text-xs tabular-nums text-mute">{fmtPct(pctOf(p.accounts, total))} of crowd</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
