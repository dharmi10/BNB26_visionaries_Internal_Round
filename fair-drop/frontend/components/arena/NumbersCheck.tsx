"use client";
import type { Arena } from "@/lib/arena";

// "Do the numbers add up?" The arena checks itself: every figure on screen is tested against the others, live.
export default function NumbersCheck({ a }: { a: Arena }) {
  if (!a.checks.length) return null;
  const bad = a.checks.filter((c) => !c.ok).length;
  return (
    <section className={"rounded-2xl border p-4 " + (bad ? "border-bad/60 bg-bad/5" : "border-ok/40 bg-ok/5")}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wider text-mute">Do the numbers add up?</h3>
        <span className={"rounded-full px-2.5 py-0.5 text-xs font-bold " + (bad ? "bg-bad/20 text-bad" : "bg-ok/15 text-ok")}>{bad ? `${bad} check${bad > 1 ? "s" : ""} failed` : `All ${a.checks.length} checks pass`}</span>
        <span className="text-xs text-mute">checked live against each other, nothing is hard-coded</span>
      </div>
      <ul className="grid gap-x-6 gap-y-1 text-sm md:grid-cols-2">
        {a.checks.map((c) => (
          <li key={c.label} className="flex gap-2"><span className={c.ok ? "text-ok" : "text-bad"}>{c.ok ? "✔" : "✘"}</span><span className="min-w-0"><span className="text-ink/90">{c.label}</span> <span className="text-mute tabular-nums">{c.detail}</span></span></li>
        ))}
      </ul>
      {a.running && <p className="mt-2 text-xs text-mute">While a test is running, some checks can briefly differ because the sale is still taking entries. They settle once it finishes.</p>}
    </section>
  );
}
