"use client";
// "New here?" card: three steps and a tiny glossary. Open the first time, then remembers.
import { useEffect, useState } from "react";

const KEY = "fd:arena-guide";
const STEPS = [
  "A crowd of real people AND bots all try to get 500 seats.",
  "Three different ways of handing out the seats are compared on that same crowd.",
  "Orange = bots, blue = real people. A fair method gives bots no more seats than their share.",
];
const WORDS: [string, string][] = [
  ["Bot account", "An account run by a program, not a person. It can still be a verified account."],
  ["Entry", "One ticket in the fair draw. One verified account gets one entry, no matter how fast it clicks."],
  ["Decoy trap", "A fake “fast lane” that only bots find. Anyone who takes it gets a worthless receipt."],
  ["Protection", "The rules that stop cheating: one entry per person, click limits, the decoy trap."],
  ["The judge", "A separate checker that replays every decision from the records and says if any was wrong."],
];

export default function Guide() {
  const [open, setOpen] = useState(true);
  useEffect(() => { try { if (localStorage.getItem(KEY) === "0") setOpen(false); } catch {} }, []);
  const toggle = () => { const v = !open; setOpen(v); try { localStorage.setItem(KEY, v ? "1" : "0"); } catch {} };

  return (
    <section className="rounded-2xl border border-line bg-gradient-to-br from-panel2/60 to-panel">
      <button onClick={toggle} aria-expanded={open} className="flex w-full items-center justify-between px-5 py-3 text-left">
        <span className="text-sm font-bold">👋 New here? What am I looking at</span>
        <span className="text-xs text-mute">{open ? "▲ hide" : "▼ show"}</span>
      </button>
      {open && (
        <div className="grid gap-5 border-t border-line px-5 py-4 lg:grid-cols-2">
          <ol className="space-y-2.5">
            {STEPS.map((s, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-black">{i + 1}</span>
                <span className="leading-snug">{s}</span>
              </li>
            ))}
            <li className="flex gap-4 pl-9 text-xs text-mute">
              <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-[#38bdf8]" />real people</span>
              <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-[#fb923c]" />bots</span>
            </li>
          </ol>
          <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
            {WORDS.map(([w, d]) => (
              <div key={w}><dt className="font-semibold text-accent">{w}</dt><dd className="text-xs leading-snug text-mute">{d}</dd></div>
            ))}
          </dl>
        </div>
      )}
    </section>
  );
}
