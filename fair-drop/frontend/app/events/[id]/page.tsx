"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, usePoll, money, fmtTime } from "@/lib/api";
import { Badge, Button, Callout, Card, CardTitle, Hash, Spinner, StateBadge, Timeline, fmtDur, useCountdown } from "@/components/ui";

export default function EventPage() {
  const { id } = useParams<{ id: string }>();
  const { data: d, error } = usePoll(() => api<any>(`/drops/${id}`), 1500, [id]);
  const off = d ? d.server_time_ms - Date.now() : 0;
  const toOpen = useCountdown(d?.state === "SCHEDULED" ? d.opens_at_ms : undefined, off);
  const toClose = useCountdown(d?.state === "OPEN" ? d.closes_at_ms : undefined, off);
  if (error && !d) return <Callout tone="bad" title="Drop not found">{String((error as any).message)}</Callout>;
  if (!d) return <Spinner label="loading" />;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">{d.event_name}</h1>
          <div className="text-mute">{d.venue} · {new Date(d.starts_at).toLocaleString()}</div>
        </div>
        <div className="text-right"><StateBadge state={d.state} />
          {toOpen !== null && <div className="mt-1 text-sm text-mute">opens in <b className="text-ink">{fmtDur(toOpen)}</b></div>}
          {toClose !== null && <div className="mt-1 text-sm text-mute">closes in <b className="text-ink">{fmtDur(toClose)}</b></div>}
        </div>
      </div>
      <Timeline state={d.state} mode={d.mode} />
      {d.state === "OPEN" && <Callout tone="ok" title="The window is open">Timing within the window never matters. Take your time. <Link className="ml-2 underline" href={`/enter/${d.id}`}>Enter the drop →</Link></Callout>}

      <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardTitle>Tiers & prices</CardTitle>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase text-mute"><th className="pb-2">Tier</th><th>Price</th><th className="text-right">Seats</th></tr></thead>
            <tbody>{d.tiers.map((t: any) => <tr key={t.id} className="border-t border-line"><td className="py-2 font-semibold">{t.name}</td><td>{money(t.price_cents)}</td><td className="text-right">{t.seats}</td></tr>)}</tbody>
          </table>
          <div className="mt-3 text-xs text-mute">{d.total_seats} seats total. Seat numbers are assigned by draw rank, never by click order.</div>
        </Card>
        <Card className="space-y-2 text-sm">
          <CardTitle>Drop timeline</CardTitle>
          <div className="flex justify-between"><span className="text-mute">Eligibility cutoff</span><b>{fmtTime(d.cutoff_at_ms)}</b></div>
          <div className="flex justify-between"><span className="text-mute">Window opens</span><b>{fmtTime(d.opens_at_ms)}</b></div>
          <div className="flex justify-between"><span className="text-mute">Window closes</span><b>{fmtTime(d.closes_at_ms)}</b></div>
          <div className="flex justify-between"><span className="text-mute">Claim time after draw</span><b>{d.claim_sec}s</b></div>
          <Callout tone="info" className="mt-2">Verified your phone after the cutoff? You can browse but not enter.</Callout>
        </Card>
      </div>

      <Card className="space-y-3">
        <CardTitle right={<Badge tone={d.token_mode === "blind" ? "teal" : "amber"}>{d.token_mode === "blind" ? "RFC 9474 blind signatures" : "plain signed tokens (privacy fallback)"}</Badge>}>Public verification information</CardTitle>
        <Hash label="Seed hash (committed before the drop; the seed is revealed only after the entry list is locked)" v={d.seed_hash} />
        <Hash label="Token signing public key (RSA-2048, SPKI)" v={d.public_key} />
        <Hash label="Merkle root of the locked entry list" v={d.merkle_root || "— published when the window closes and the list is locked —"} />
        {d.seed && <Hash label="Revealed seed" v={d.seed} />}
        {d.beacon_round ? <div className="text-xs text-mute">Public randomness beacon: drand quicknet round <b className="text-ink">{d.beacon_round}</b> (published after the list was locked)</div> : null}
        <div className="flex gap-2">
          <Link href={`/status/${d.id}`}><Button variant="secondary" size="sm">My entry / status</Button></Link>
          <Link href={`/verify?drop=${d.id}`}><Button variant="ghost" size="sm">Verify this drop</Button></Link>
        </div>
      </Card>
    </div>
  );
}
