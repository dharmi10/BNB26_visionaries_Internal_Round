"use client";
// Minimal shadcn/ui-style primitives (copy-in components, class-variance-authority + tailwind-merge).
import { cva, type VariantProps } from "class-variance-authority";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import React, { useEffect, useState } from "react";

export const cn = (...c: ClassValue[]) => twMerge(clsx(c));

const button = cva("inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 ring-accent/60", {
  variants: {
    variant: {
      primary: "bg-accent text-black hover:brightness-110",
      secondary: "bg-panel2 text-ink border border-line hover:border-accent/50",
      ghost: "text-mute hover:text-ink hover:bg-panel2",
      danger: "bg-bad/90 text-white hover:bg-bad",
      warn: "bg-warn text-black hover:brightness-110",
    },
    size: { sm: "px-3 py-1.5 text-xs", md: "", lg: "px-6 py-3 text-base" },
  },
  defaultVariants: { variant: "primary", size: "md" },
});
export function Button({ className, variant, size, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>) {
  return <button className={cn(button({ variant, size }), className)} {...p} />;
}

export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-line bg-panel p-5", className)} {...p} />;
}
export function CardTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold uppercase tracking-wider text-mute">{children}</h3>{right}</div>;
}

export function Input({ className, ...p }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent", className)} {...p} />;
}
export function Select({ className, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn("w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent", className)} {...p} />;
}
export function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-mute">{children}</label>;
}

const badge = cva("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", {
  variants: { tone: { gray: "bg-panel2 text-mute", green: "bg-ok/15 text-ok", red: "bg-bad/15 text-bad", amber: "bg-warn/15 text-warn", teal: "bg-accent/15 text-accent", blue: "bg-accent2/15 text-accent2" } },
  defaultVariants: { tone: "gray" },
});
export function Badge({ tone, className, ...p }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ tone }), className)} {...p} />;
}

export const STATES = ["SCHEDULED", "OPEN", "CLOSED", "LOCKED", "DRAWN", "CLAIM", "SETTLED"];
const stateTone: Record<string, any> = { SCHEDULED: "gray", OPEN: "green", CLOSED: "amber", LOCKED: "blue", DRAWN: "teal", CLAIM: "teal", SETTLED: "gray" };
// The sale's stages in plain words (the technical name stays in the tooltip). Used everywhere a stage is shown.
export const STAGE: Record<string, [string, string]> = {
  SCHEDULED: ["Not open yet", "The sale has been set up but nobody can join yet."],
  OPEN: ["Open: people are joining", "People can join right now. In the fair sale, joining early or late makes no difference."],
  CLOSED: ["Closed: no more entries", "Joining has stopped. The list of entries is final but not yet sealed."],
  LOCKED: ["List sealed", "The final list is locked and its fingerprint published. Nobody can add, remove or swap an entry any more, and the winners aren't picked yet."],
  DRAWN: ["Winners picked", "The random draw is done and can be re-checked by anyone. Winners are decided."],
  CLAIM: ["Winners claiming seats", "Winners have a short time to claim. Unclaimed seats go to the next person waiting."],
  SETTLED: ["Finished", "All seats are given out. The sale is over."],
};
export const stageName = (s: string) => STAGE[s]?.[0] || s;
export const StateBadge = ({ state }: { state: string }) => <Badge tone={stateTone[state] || "gray"} title={`${state}: ${STAGE[state]?.[1] || ""}`}>{stageName(state)}</Badge>;

export function Callout({ tone = "info", title, children, className }: { tone?: "info" | "ok" | "bad" | "warn"; title?: string; children?: React.ReactNode; className?: string }) {
  const t = { info: "border-accent2/40 bg-accent2/10", ok: "border-ok/40 bg-ok/10", bad: "border-bad bg-bad/15 alarm", warn: "border-warn/50 bg-warn/10" }[tone];
  return <div className={cn("rounded-xl border p-4 text-sm", t, className)}>{title && <div className="mb-1 font-semibold">{title}</div>}<div className="text-ink/90">{children}</div></div>;
}

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "ok" | "bad" | "warn" }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className="text-xs uppercase tracking-wider text-mute">{label}</div>
      <div className={cn("mt-1 text-2xl font-bold tabular-nums", tone === "ok" && "text-ok", tone === "bad" && "text-bad", tone === "warn" && "text-warn")}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-mute">{sub}</div>}
    </div>
  );
}

export function Tabs({ tabs, value, onChange }: { tabs: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-line">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)} className={cn("-mb-px border-b-2 px-4 py-2 text-sm font-medium", value === t.id ? "border-accent text-accent" : "border-transparent text-mute hover:text-ink")}>{t.label}</button>
      ))}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return <div className="flex items-center gap-2 text-sm text-mute"><span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent" />{label}</div>;
}

export function Hash({ v, label }: { v?: string | null; label?: string }) {
  if (!v) return null;
  return <div>{label && <div className="text-xs uppercase tracking-wider text-mute">{label}</div>}<div className="hash">{v}</div></div>;
}

export function useCountdown(targetMs: number | undefined, offsetMs = 0) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);
  if (!targetMs) return null;
  return Math.max(0, targetMs - (now + offsetMs));
}
export function fmtDur(ms: number) {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return (h ? h + "h " : "") + (h || m ? String(m).padStart(m || h ? 2 : 1, "0") + "m " : "") + String(r).padStart(2, "0") + "s";
}

export function Timeline({ state, mode = "fairdrop" }: { state: string; mode?: string }) {
  const steps = mode === "fcfs" ? ["SCHEDULED", "OPEN", "CLOSED", "SETTLED"] : STATES;
  const idx = steps.indexOf(state);
  return (
    <div className="space-y-1"><ol className="flex flex-wrap items-center gap-2 text-xs">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span title={STAGE[s]?.[1]} className={cn("rounded-full border px-2.5 py-1 font-semibold", i < idx ? "border-ok/40 bg-ok/10 text-ok" : i === idx ? "border-accent bg-accent/15 text-accent" : "border-line text-mute")}>{i < idx ? "✓ " : ""}{stageName(s)}</span>
          {i < steps.length - 1 && <span className="text-line">›</span>}
        </li>
      ))}
    </ol>{STAGE[state] && <p className="text-xs text-mute">Right now: {STAGE[state][1]}</p>}</div>
  );
}
