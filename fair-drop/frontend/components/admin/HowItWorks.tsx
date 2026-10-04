"use client";
import Link from "next/link";
import { Card, CardTitle } from "@/components/ui";
import { BOTS, LAYERS, n } from "./botinfo";

// Two pictures for a demo audience: (1) how a real person gets in, step by step, with live numbers;
// (2) what protected us: every rule a request meets, how many it stopped in THIS test and which bots it caught.

const ORDER: Record<string, number> = { SCHEDULED: 0, OPEN: 2, CLOSED: 3, LOCKED: 4, DRAWN: 5, CLAIM: 6, SETTLED: 7 };
// which of the 6 steps are finished / happening now / still to come, for each stage of the sale
const stepStatus = (state: string, i: number): "done" | "now" | "later" => {
  const nowRange: Record<string, [number, number]> = { OPEN: [0, 2], CLOSED: [3, 3], LOCKED: [4, 4], DRAWN: [5, 5], CLAIM: [5, 5] };
  if (state === "SETTLED") return "done";
  const r = nowRange[state];
  if (!r) return "later";
  return i < r[0] ? "done" : i <= r[1] ? "now" : "later";
};

export default function HowItWorks({ pulse, prot, dropId, isOld }: { pulse: any; prot: any; dropId: string; isOld: boolean }) {
  const st = pulse?.state || "SCHEDULED";
  const at = ORDER[st] ?? 0;
  const f = pulse?.flow || {};
  const root: string = pulse?.merkle_root || "";
  const steps = [
    { icon: "🪪", t: "Prove who you are", d: "Verify your phone once, before the deadline. This is what makes you one real person.", live: "verified people only" },
    { icon: "🎟️", t: "Get your ONE ticket", d: "The server signs a ticket for you without ever seeing which one is yours (a “blind” signature). Ask twice and the second is refused.", live: `${n(f.tokens_issued)} tickets handed out` },
    { icon: "🚪", t: "Enter, anonymously", d: "You hand in the ticket without logging in, so nobody can link the entry to you. A ticket works once; repeats are ignored.", live: `${n(f.entries)} entries so far` },
    { icon: "🔒", t: "The list is sealed", d: "When the sale closes, all entries are locked and one fingerprint (a Merkle root) is published. Nobody can add, remove or swap an entry any more.", live: root ? `fingerprint ${root.slice(0, 12)}…` : "not sealed yet" },
    { icon: "🎲", t: "Winners are drawn", d: "A secret committed in advance plus public randomness picks the winners. Anyone can re-run the draw on their own computer.", live: at >= 5 ? "draw done: anyone can check it" : "not drawn yet" },
    { icon: "💺", t: "Winners claim seats", d: "Winners have a short time to claim. Unclaimed seats go to the next person waiting.", live: at >= 6 ? "claiming open or finished" : "later" },
  ];
  const audit = prot?.audit || {}, bp = prot?.by_profile || {};
  const layers = LAYERS.map((l) => {
    const stopped = l.keys.reduce((a, k) => a + (audit[k]?.Rejected || 0), 0);
    const who = Object.entries(bp).map(([id, v]: any) => [id, l.keys.reduce((a, k) => a + (v.Reasons?.[k] || 0), 0)] as [string, number]).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
    return { ...l, stopped, who };
  }).filter((l) => (isOld ? l.name.startsWith("Old sale") : !l.name.startsWith("Old sale")));
  const max = Math.max(1, ...layers.map((l) => l.stopped));

  return (
    <div className="space-y-4">
      {!isOld ? (
        <Card className="space-y-3">
          <CardTitle>How a real person gets in, step by step <span className="text-xs font-normal text-mute">(numbers are live from this test)</span></CardTitle>
          <ol className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
            {steps.map((s, i) => {
              const status = stepStatus(st, i), done = status === "done", now = status === "now";
              return (
                <li key={i} className={`rounded-xl border p-3 ${now ? "border-accent bg-accent/10" : done ? "border-ok/40 bg-ok/5" : "border-line bg-panel"}`}>
                  <div className="flex items-center gap-2"><span className="text-xl">{s.icon}</span><span className="text-[11px] font-bold uppercase tracking-wide text-mute">Step {i + 1}</span></div>
                  <div className="mt-1 font-bold">{s.t}</div>
                  <p className="mt-1 text-xs text-mute">{s.d}</p>
                  <div className="mt-2 text-xs font-semibold text-accent">{s.live}</div>
                </li>);
            })}
          </ol>
          <div className="text-xs text-mute">Why a bot can’t cheat this: it can’t get a second ticket, can’t reuse one, can’t forge one, and arriving early or late changes nothing. {dropId && pulse?.state && ["DRAWN", "CLAIM", "SETTLED"].includes(pulse.state) && <Link className="text-accent underline" href={`/verify?drop=${dropId}`}>Re-check this draw yourself →</Link>}</div>
        </Card>
      ) : (
        <Card className="space-y-2"><CardTitle>How you get a seat in the OLD way</CardTitle>
          <p className="text-sm text-mute">Press “Buy”. Whoever’s click reaches the server first gets the seat, until the seats run out. Nothing checks who is a bot, nothing protects people with slower connections, and there is no list anyone can check. That is why bots do so well here.</p></Card>)}

      <Card className="space-y-3">
        <CardTitle>{isOld ? "What protects the old sale" : "What protected us: every rule a request meets"} <span className="text-xs font-normal text-mute">(counts are for the sale you are watching)</span></CardTitle>
        <div className="space-y-2">
          {layers.map((l, i) => (
            <div key={l.name} className="grid items-center gap-3 rounded-xl border border-line bg-panel p-3 md:grid-cols-[2.2rem_1.3fr_2fr_1.3fr]" style={{ borderLeft: `4px solid ${l.color}` }}>
              <div className="text-2xl">{l.icon}</div>
              <div><div className="font-bold">{isOld ? "" : `Rule ${i + 1}: `}{l.name}</div><div className="text-xs text-mute">“{l.asks}”</div></div>
              <div className="text-xs text-ink/85">{l.stops}
                {l.keys.length > 0 && <div className="mt-1 h-2 overflow-hidden rounded bg-panel2"><div className="h-2 rounded" style={{ width: Math.max(l.stopped ? 3 : 0, (l.stopped / max) * 100) + "%", background: l.color }} /></div>}</div>
              <div className="text-xs">{l.keys.length > 0 ? <><div className="text-lg font-bold" style={{ color: l.color }}>{n(l.stopped)} <span className="text-xs font-normal text-mute">stopped</span></div>
                {l.who.length ? <div className="text-mute">mostly: {l.who.map(([id, c]) => `${BOTS[id]?.name || id} (${n(c)})`).join(", ")}</div> : <div className="text-mute">none needed it in this test</div>}</> : <div className="text-mute">{!isOld && at >= 4 ? "✔ the list is sealed" : "applies after the sale closes"}</div>}</div>
            </div>))}
        </div>
        {!isOld && <p className="text-xs text-mute">Every “stopped” number above was re-checked afterwards by an independent judge (see “Is the protection right?”). Real people are never in these counts unless the judge says it was a mistake: it counted {n((prot?.confusion?.human?.FP) || 0)} real people wrongly stopped.</p>}
      </Card>
    </div>
  );
}

