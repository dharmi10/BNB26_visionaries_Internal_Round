"use client";
import Link from "next/link";
import { api, usePoll, money, fmtTime } from "@/lib/api";
import { Badge, Card, StateBadge, Spinner, Button } from "@/components/ui";
import { Shield, Lock, Dice5, FileCheck2, Zap, Shuffle, ShieldCheck, Radio, ArrowRight } from "lucide-react";

const steps = [
  { icon: Shield, t: "One person, one entry", d: "Each verified phone gets exactly one entry per drop. 1,000 retries or 1,000 IP addresses still make one entry." },
  { icon: FileCheck2, t: "A signed receipt", d: "Entering gives you a receipt signed by the server. Arrival time is recorded but never used: second 1 or minute 10 is identical." },
  { icon: Lock, t: "Seal the list, then draw", d: "When the window closes, the entry list is fingerprinted and published BEFORE the server reveals its secret seed." },
  { icon: Dice5, t: "Anyone can re-check the draw", d: "Paste your receipt into the verify page and your own browser re-runs the whole draw. No need to trust us." },
];

const ways = [
  { icon: Zap, name: "First come, first served", tag: "Old way", tone: "red" as const, d: "Fastest click wins. Bots click fastest, and one account can grab several seats.", ring: "border-bad/40" },
  { icon: Shuffle, name: "Simple lottery", tag: "Better, still gameable", tone: "amber" as const, d: "A random draw, but every request is a ticket, so hammering the server buys extra chances.", ring: "border-warn/40" },
  { icon: ShieldCheck, name: "Fair Drop", tag: "This project", tone: "teal" as const, d: "One verified person is one entry. The list is sealed, then a random draw anyone can re-check.", ring: "border-accent/60 glow-ok" },
];

export default function Home() {
  const { data, error } = usePoll(() => api<any[]>("/drops"), 2000);
  const drops = (data || []).filter((d) => !String(d.id).startsWith("exp-"));
  return (
    <div className="space-y-10">
      <section className="slide-in grid items-center gap-8 pt-2 md:grid-cols-[1.35fr_1fr]">
        <div>
          <Badge tone="teal">Fair Drop</Badge>
          <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight md:text-5xl">500 seats, 50,000 people, and bots.<br /><span className="bg-gradient-to-r from-accent to-accent2 bg-clip-text text-transparent">Fair Drop gives bots no advantage.</span></h1>
          <p className="mt-4 max-w-xl text-mute">
            Clicking faster, sending more requests or switching IP address earns no extra chances. One verified person gets one entry, and anyone can re-check the draw.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/live"><Button size="lg"><Radio className="h-4 w-4" />Watch the bots live</Button></Link>
            <a href="#drops"><Button size="lg" variant="secondary">Join a drop<ArrowRight className="h-4 w-4" /></Button></a>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-mute">
            <Link href="/story" className="hover:text-ink">Watch the story</Link>
            <Link href="/verify" className="hover:text-ink">Verify a draw</Link>
            <Link href="/login" className="hover:text-ink">Sign in</Link>
          </div>
        </div>
        <Card className="space-y-3 text-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-mute">What we claim</div>
          <p><span className="text-ok">✔</span> Speed, volume and IP switching do not change your odds in the fair draw.</p>
          <p><span className="text-ok">✔</span> The server cannot quietly drop your entry or rig the draw. You can prove it.</p>
          <div className="border-t border-line pt-3 text-xs font-semibold uppercase tracking-wider text-mute">What we do NOT claim</div>
          <p><span className="text-bad">✘</span> We do not stop identity farms. Someone with many real, verified accounts still gets one entry per account. We make that cost real money instead.</p>
        </Card>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-bold">Three ways to hand out seats</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {ways.map((w) => (
            <Card key={w.name} className={`flex flex-col gap-2 ${w.ring}`}>
              <div className="flex items-center justify-between"><w.icon className="h-6 w-6 text-accent" /><Badge tone={w.tone}>{w.tag}</Badge></div>
              <div className="font-semibold">{w.name}</div>
              <p className="text-sm text-mute">{w.d}</p>
            </Card>
          ))}
        </div>
      </section>

      <section id="drops" className="scroll-mt-20">
        <h2 className="mb-4 text-lg font-bold">Available drops</h2>
        {!data && !error && <Spinner label="loading drops" />}
        {error && <Card className="text-bad">Backend not reachable: {String((error as any).message)}</Card>}
        <div className="grid gap-4 md:grid-cols-2">
          {drops.map((d) => (
            <Card key={d.id} className="flex flex-col gap-3 transition hover:-translate-y-0.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-bold">{d.event_name}</div>
                  <div className="text-sm text-mute">{d.venue} · {new Date(d.starts_at).toLocaleDateString()}</div>
                </div>
                <div className="flex flex-col items-end gap-1"><StateBadge state={d.state} /><Badge tone={d.mode === "fcfs" ? "red" : "teal"}>{d.mode === "fcfs" ? "Old way: first-come-first-served" : "Fair Drop lottery"}</Badge></div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                {d.tiers.map((t: any) => <Badge key={t.id}>{t.name} · {money(t.price_cents)} · {t.seats} seats</Badge>)}
              </div>
              <div className="text-xs text-mute">Window {fmtTime(d.opens_at_ms)} → {fmtTime(d.closes_at_ms)}</div>
              <div className="mt-auto flex gap-2">
                <Link href={d.mode === "fcfs" ? `/baseline/${d.id}` : `/events/${d.id}`}><Button size="sm">{d.mode === "fcfs" ? "Open classic sale" : "Event page"}</Button></Link>
                {d.mode !== "fcfs" && d.state === "OPEN" && <Link href={`/enter/${d.id}`}><Button size="sm" variant="secondary">Enter now</Button></Link>}
                {d.mode !== "fcfs" && d.merkle_root && <Link href={`/verify?drop=${d.id}`}><Button size="sm" variant="ghost">Verify</Button></Link>}
              </div>
            </Card>
          ))}
          {data && drops.length === 0 && <Card className="text-mute">No drops yet. An admin can create one in <Link href="/admin" className="text-accent underline">Admin</Link>.</Card>}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-bold">How fairness works</h2>
        <div className="grid gap-4 md:grid-cols-4">
          {steps.map((s, i) => (
            <Card key={i} className="transition hover:-translate-y-0.5">
              <div className="mb-3 flex items-center gap-2"><s.icon className="h-6 w-6 text-accent" /><span className="num text-xs font-semibold text-mute">STEP {i + 1}</span></div>
              <div className="mb-1 font-semibold">{s.t}</div><p className="text-sm text-mute">{s.d}</p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
