"use client";
import { Card, CardTitle, STAGE, STATES } from "@/components/ui";

// Every test and every stage in plain words. No jargon: if a word needs explaining, it is explained here.
const TESTS: { name: string; tech: string; q: string; how: string; where: string; tone: string }[] = [
  { name: "Bot attack", tech: "load test", q: "What happens when thousands of people AND bots rush the site at once?", how: "A crowd (you choose 2,500 to 50,000) plus seven kinds of bots tries to get tickets, first in the new fair sale and then in the old first-come-first-served sale. You watch it live.", where: "Press ▶ Start bot attack (top of this page).", tone: "#38bdf8" },
  { name: "Quick safety check", tech: "self-test", q: "Does the gate let the right people in and keep the wrong ones out?", how: "18 requests where the right answer was written down before sending: an honest person, a retry after a glitch, a fake ticket, a reused ticket, a late sign-up, a flood from one address, and so on. Each shows ✔ (as expected) or ✘ (a mistake).", where: "Press “Quick safety check” (about 10 seconds).", tone: "#22c55e" },
  { name: "Try to break it", tech: "red team", q: "Can a clever bot owner find a way to cheat?", how: "We play the attacker: 14 real tricks, such as turning one phone number into many accounts, guessing login codes, hijacking someone’s retry, sending giant requests, or faking an address. Anything that works is a hole we must fix. The first time we tried, 6 worked; all 6 are now closed and re-tested.", where: "Press “Try to break it” (about 15 seconds).", tone: "#f59e0b" },
  { name: "Old way vs new way", tech: "before / after, counterfactual", q: "Is the new fair sale really fairer than the old one?", how: "The very same crowd is run through three ways of selling: first-come-first-served (old), a plain random lottery, and Fair Drop (new). Bars show how many seats the bots ended up with and a real person’s chance of getting one.", where: "Section “Old way vs new way” below, after a bot attack.", tone: "#a855f7" },
  { name: "Full walkthrough", tech: "smoke test", q: "Does one whole sale work from the very start to the very end?", how: "30 people and 7 seats. It opens the sale, hands out tickets, lets people enter, closes, seals the list, picks winners, lets them claim, replaces two who stay silent with the next people waiting, and finally checks the safety counters are all zero and the tamper-proof log is unbroken. Prints “SMOKE OK” if everything held.", where: "Developer command: python tests/smoke.py", tone: "#2dd4bf" },
  { name: "Code checks", tech: "unit tests", q: "Is each small piece of the program correct on its own?", how: "Dozens of tiny automatic checks: the maths of the sealed list, the draw giving the same winners every time, one ticket per person even if 200 requests arrive at once, seats never sold twice, a dishonest server being caught, and a regression check for every hole the red team found.", where: "Developer command: bash scripts/test.sh", tone: "#94a3b8" },
  { name: "The 7 big experiments", tech: "attack experiments 1–7", q: "How does it behave in seven specific situations, at full size?", how: "1 a normal day with no bots · 2 bots hopping between thousands of addresses · 3 one operator buying 100, 1,000 or 10,000 accounts · 4 one human against 50,000 bot attempts · 5 the decoy trap · 6 a server dies mid-sale · 7 a dishonest server secretly drops someone. Each writes a report in the reports folder.", where: "Test tools tab, or bash scripts/run_all_experiments.sh", tone: "#fb923c" },
];

export default function TestsExplained() {
  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <CardTitle>The tests, in plain words</CardTitle>
        <div className="grid gap-3 md:grid-cols-2">
          {TESTS.map((t) => (
            <div key={t.name} className="rounded-xl border border-line bg-panel p-4" style={{ borderLeft: `4px solid ${t.tone}` }}>
              <div className="flex flex-wrap items-baseline gap-2"><div className="text-base font-bold">{t.name}</div><div className="text-xs text-mute">(technical name: {t.tech})</div></div>
              <div className="mt-1 text-sm font-semibold" style={{ color: t.tone }}>{t.q}</div>
              <p className="mt-1 text-sm text-ink/85">{t.how}</p>
              <div className="mt-2 text-xs text-mute">▶ {t.where}</div>
            </div>))}
        </div>
      </Card>
      <Card className="space-y-3">
        <CardTitle>The stages of a sale, in plain words</CardTitle>
        <ol className="space-y-2 text-sm">
          {STATES.map((s, i) => (
            <li key={s} className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-bold text-accent">{i + 1}</span>
              <span><b>{STAGE[s][0]}</b> <span className="text-xs text-mute">(technical name: {s})</span><br /><span className="text-mute">{STAGE[s][1]}</span></span></li>))}
        </ol>
        <p className="text-xs text-mute">The old first-come-first-served sale only has four stages: Not open yet → Open → Closed → Finished.</p>
      </Card>
    </div>
  );
}
