"use client";
import Link from "next/link";
import { api, usePoll, money, fmtTime } from "@/lib/api";
import { Badge, Card, StateBadge, Spinner, Button } from "@/components/ui";
import { Shield, Lock, Dice5, FileCheck2 } from "lucide-react";

const steps = [
  { icon: Shield, t: "One identity, one entry", d: "Each verified phone gets exactly one entry token per drop. 1,000 IP addresses or 1,000 retries still make one entry." },
  { icon: FileCheck2, t: "Signed receipt", d: "Entering gives you a receipt signed by the server. Arrival time is recorded but never used: entering at second 1 or minute 10 is identical." },
  { icon: Lock, t: "Locked list, then randomness", d: "When the window closes the entry list is hashed into a Merkle root and published BEFORE the server reveals its secret seed." },
  { icon: Dice5, t: "Anyone can recompute the draw", d: "winner order = sort by SHA-256(seed ‖ root ‖ beacon ‖ receipt). Paste your receipt into the verify page and your browser re-runs the whole draw." },
];

export default function Home() {
  const { data, error } = usePoll(() => api<any[]>("/drops"), 2000);
  const drops = (data || []).filter((d) => !String(d.id).startsWith("exp-"));
  return (
    <div className="space-y-10">
      <section className="grid items-center gap-8 md:grid-cols-[1.4fr_1fr]">
        <div>
          <Badge tone="teal">500 seats · 50,000 people · zero timing advantage</Badge>
          <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight md:text-5xl">Win by luck,<br />not by <span className="text-accent">speed</span>.</h1>
          <p className="mt-4 max-w-xl text-mute">
            Fair Drop sells scarce seats through a lottery where network speed, request volume and IP rotation give <b className="text-ink">no advantage</b>.
            The only way to get more chances is more real, verified identities, and each one costs real money. Everything is publicly verifiable.
          </p>
          <div className="mt-6 flex gap-3">
            <Link href="/login"><Button size="lg">Sign in (simulated OTP)</Button></Link>
            <Link href="/story"><Button size="lg" variant="secondary">▶ Watch the story</Button></Link>
            <Link href="/verify"><Button size="lg" variant="secondary">Verify a draw</Button></Link>
          </div>
        </div>
        <Card className="space-y-2 text-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-mute">What we claim — and what we don't</div>
          <p><span className="text-ok">✔</span> Speed, volume and IP rotation do not change lottery odds when identity eligibility is enforced.</p>
          <p><span className="text-ok">✔</span> The server cannot silently drop your entry or rig the draw: you can prove it.</p>
          <p><span className="text-bad">✘</span> We do <b>not</b> claim bots can't exist, that CAPTCHAs/IP blocks solve botting, or that nobody can buy real verified identities. We measure the <i>cost per seat</i> instead.</p>
        </Card>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-bold">Available drops</h2>
        {!data && !error && <Spinner label="loading drops" />}
        {error && <Card className="text-bad">Backend not reachable: {String((error as any).message)}</Card>}
        <div className="grid gap-4 md:grid-cols-2">
          {drops.map((d) => (
            <Card key={d.id} className="flex flex-col gap-3">
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
            <Card key={i}><s.icon className="mb-3 h-6 w-6 text-accent" /><div className="mb-1 font-semibold">{s.t}</div><p className="text-sm text-mute">{s.d}</p></Card>
          ))}
        </div>
      </section>
    </div>
  );
}
