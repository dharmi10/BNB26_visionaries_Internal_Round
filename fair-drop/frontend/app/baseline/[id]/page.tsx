"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, money, seatLabel, session, usePoll } from "@/lib/api";
import { Badge, Button, Callout, Card, StateBadge } from "@/components/ui";

// The classic ticket sale: exists purely for the demo. "Fastest requests win."
export default function Baseline() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: d } = usePoll(() => api<any>(`/drops/${id}`), 1500, [id]);
  const { data: s } = usePoll(() => api<any>(`/baseline/${id}/status`), 700, [id]);
  const [log, setLog] = useState<{ ok: boolean; text: string }[]>([]);
  const [mine, setMine] = useState<{ tier: string; seat: number }[]>([]);
  useEffect(() => { if (!session.get()) router.replace(`/login?next=/baseline/${id}`); }, [id, router]);

  const buy = async (tier: string) => {
    try {
      const r = await api(`/baseline/${id}/buy`, { body: { tier }, auth: "user" });
      setMine((m) => [...m, { tier, seat: r.seat_no }]); setLog((l) => [{ ok: true, text: `Got seat ${seatLabel(tier, r.seat_no)} (request landed at ${new Date(r.arrival_ms).toLocaleTimeString()}.${r.arrival_ms % 1000})` }, ...l]);
    } catch (e: any) { setLog((l) => [{ ok: false, text: { sold_out: "SOLD OUT: someone's request landed first.", limit_reached: "Per-account limit reached.", sale_closed: "Sale closed.", rate_limited: "Rate limited: slow down." }[e.code as string] || e.message }, ...l]); }
  };
  if (!d || !s) return null;
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Callout tone="bad" title="CLASSIC SALE: FASTEST REQUESTS WIN">This is the baseline Fair Drop replaces. Whoever's request reaches the server first gets the seat, so fast scripts and bot farms beat people. Bots in the attack lab hit this exact page's API.</Callout>
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">{d.event_name}</h1><StateBadge state={d.state} /></div>
      <div className="grid gap-3 sm:grid-cols-3">
        {s.tiers.map((t: any) => {
          const left = t.seats - t.sold;
          return (
            <Card key={t.id} className="space-y-2 text-center">
              <div className="text-lg font-bold">{t.name}</div><div className="text-sm text-mute">{money(t.price_cents)}</div>
              <div className={`text-3xl font-extrabold tabular-nums ${left === 0 ? "text-bad" : "text-ok"}`}>{left}</div><div className="text-xs text-mute">of {t.seats} left</div>
              <div className="h-2 overflow-hidden rounded bg-line"><div className="h-full bg-bad" style={{ width: `${(t.sold / t.seats) * 100}%` }} /></div>
              <Button className="w-full" disabled={d.state !== "OPEN" || left === 0} onClick={() => buy(t.id)}>{left === 0 ? "Sold out" : "Buy now"}</Button>
            </Card>
          );
        })}
      </div>
      <Card><div className="mb-2 flex items-center justify-between text-sm font-semibold">Your purchases <Badge>{mine.length} / {s.max_per_account} per account</Badge></div>
        {mine.map((m, i) => <div key={i} className="text-sm text-ok">✔ {seatLabel(m.tier, m.seat)}</div>)}
        {log.map((l, i) => <div key={i} className={`text-xs ${l.ok ? "text-ok" : "text-mute"}`}>{l.text}</div>)}
        {!log.length && <div className="text-xs text-mute">Click “Buy now” as fast as you can…</div>}
      </Card>
      <p className="text-xs text-mute">Compare with the <Link className="underline" href="/">Fair Drop lottery</Link> where arrival time is irrelevant.</p>
    </div>
  );
}
