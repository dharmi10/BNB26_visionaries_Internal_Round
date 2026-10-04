"use client";
import { useState } from "react";
import { api, fmtTime, money, usePoll } from "@/lib/api";
import { Badge, Button, Callout, Card, CardTitle, Hash, Input, Label, Select, StateBadge, STATES, Timeline } from "@/components/ui";

const NEXT: Record<string, Record<string, string>> = {
  fairdrop: { SCHEDULED: "OPEN", OPEN: "CLOSED", CLOSED: "LOCKED", LOCKED: "DRAWN", DRAWN: "CLAIM", CLAIM: "SETTLED" },
  fcfs: { SCHEDULED: "OPEN", OPEN: "CLOSED", CLOSED: "SETTLED" },
};
const LABEL: Record<string, string> = { OPEN: "Open the sale", CLOSED: "Stop letting people join", LOCKED: "Seal the list (publish its fingerprint)", DRAWN: "Pick the winners (run the draw)", CLAIM: "Let winners claim seats", SETTLED: "Finish the sale" };

export default function DropsTab({ dropId, setDropId }: { dropId: string; setDropId: (s: string) => void }) {
  const { data: drops, reload } = usePoll(() => api<any[]>("/admin/drops", { auth: "admin" }), 1500);
  const { data: events, reload: reloadEv } = usePoll(() => api<any[]>("/admin/events", { auth: "admin" }), 8000);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; t: string } | null>(null);
  const [busy, setBusy] = useState("");
  const sel = drops?.find((d) => d.id === dropId);

  const advance = async (to: string) => {
    setBusy(to); setMsg(null);
    try { await api(`/admin/drops/${dropId}/advance`, { body: { to }, auth: "admin" }); setMsg({ tone: "ok", t: `→ ${to}` }); }
    catch (e: any) { setMsg({ tone: "bad", t: `${e.code}: ${e.body?.state ? `state is ${e.body.state}, allowed next: ${e.body.allowed}` : e.message}` }); }
    setBusy(""); reload();
  };

  // ---- event form ----
  const [ev, setEv] = useState({ name: "Aurora Live 2026", venue: "Eden Arena", starts: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 16),
    tiers: [{ name: "Gold", price: 250, seats: 100 }, { name: "Silver", price: 150, seats: 150 }, { name: "General", price: 80, seats: 250 }] });
  const createEvent = async () => {
    try { const r = await api("/admin/events", { auth: "admin", body: { name: ev.name, venue: ev.venue, starts_at: new Date(ev.starts).toISOString(), tiers: ev.tiers.map((t) => ({ name: t.name, price_cents: Math.round(t.price * 100), seats: +t.seats })) } }); setMsg({ tone: "ok", t: `event ${r.id} created` }); reloadEv(); setDr((x) => ({ ...x, event_id: r.id })); }
    catch (e: any) { setMsg({ tone: "bad", t: e.message }); }
  };
  // ---- drop form ----
  const [dr, setDr] = useState({ event_id: "", mode: "fairdrop", opens_in: 0, window: 600, cutoff: "now", claim: 60, auto: false });
  const createDrop = async () => {
    const now = Date.now();
    try {
      const r = await api("/admin/drops", { auth: "admin", body: { event_id: dr.event_id || events?.[0]?.id, mode: dr.mode, opens_at: new Date(now + dr.opens_in * 1000).toISOString(),
        closes_at: new Date(now + (dr.opens_in + dr.window) * 1000).toISOString(), cutoff_at: new Date(now + (dr.cutoff === "now" ? 0 : dr.cutoff === "1h" ? 3600e3 : 0)).toISOString(), claim_sec: +dr.claim, auto_draw: dr.auto } });
      setMsg({ tone: "ok", t: `drop ${r.id} created. Seed hash ${r.seed_hash.slice(0, 16)}… and public key published` }); setDropId(r.id); reload();
    } catch (e: any) { setMsg({ tone: "bad", t: e.message }); }
  };

  return (
    <div className="space-y-5">
      {msg && <Callout tone={msg.tone === "ok" ? "ok" : "bad"}>{msg.t}</Callout>}
      <Card>
        <CardTitle>Drops</CardTitle>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase text-mute"><th className="pb-2">Drop</th><th>Event</th><th>Mode</th><th>State</th><th>Tiers</th><th></th></tr></thead>
          <tbody>{(drops || []).map((d) => (
            <tr key={d.id} className={`border-t border-line ${d.id === dropId ? "bg-accent/5" : ""}`}>
              <td className="mono py-2 text-xs">{d.id}</td><td>{d.event_name}</td><td><Badge tone={d.mode === "fcfs" ? "red" : "teal"}>{d.mode}</Badge></td><td><StateBadge state={d.state} /></td>
              <td className="text-xs text-mute">{d.tiers.map((t: any) => `${t.name} ${t.seats}`).join(" · ")}</td>
              <td className="text-right"><Button size="sm" variant={d.id === dropId ? "primary" : "secondary"} onClick={() => setDropId(d.id)}>{d.id === dropId ? "selected" : "select"}</Button></td>
            </tr>))}</tbody></table></div>
      </Card>

      {sel && (
        <Card className="space-y-4">
          <CardTitle right={<span className="mono text-xs text-mute">{sel.id}</span>}>Phase control: {sel.event_name}</CardTitle>
          <Timeline state={sel.state} mode={sel.mode} />
          <div className="flex flex-wrap gap-2">
            {(sel.mode === "fcfs" ? ["OPEN", "CLOSED", "SETTLED"] : STATES.slice(1)).map((s) => {
              const ok = NEXT[sel.mode][sel.state] === s;
              return <Button key={s} disabled={!ok || !!busy} variant={ok ? "primary" : "secondary"} onClick={() => advance(s)}>{busy === s ? "…" : LABEL[s]}</Button>;
            })}
          </div>
          <div className="text-xs text-mute">Each button is enabled only in the right phase; the server also rejects illegal transitions (409) via compare-and-set. The admin can never pick winners. The draw is a pure function of the committed seed, the locked list and the beacon.</div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2"><Hash label="Seed hash (published at creation)" v={sel.seed_hash} /><Hash label="Token public key" v={sel.public_key?.slice(0, 120) + "…"} /><Hash label="Merkle root" v={sel.merkle_root} /><Hash label="Seed (after reveal)" v={sel.seed} /></div>
            <div className="space-y-1 text-sm text-mute"><div>Opens: {fmtTime(sel.opens_at_ms)}</div><div>Closes: {fmtTime(sel.closes_at_ms)}</div><div>Eligibility cutoff: {fmtTime(sel.cutoff_at_ms)}</div><div>Claim window: {sel.claim_sec}s · token mode: {sel.token_mode} · entries locked: {sel.entry_count ?? "—"}</div></div>
          </div>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="space-y-3">
          <CardTitle>Create event</CardTitle>
          <div className="grid gap-3 sm:grid-cols-2"><div><Label>Name</Label><Input value={ev.name} onChange={(e) => setEv({ ...ev, name: e.target.value })} /></div><div><Label>Venue</Label><Input value={ev.venue} onChange={(e) => setEv({ ...ev, venue: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label>Date</Label><Input type="datetime-local" value={ev.starts} onChange={(e) => setEv({ ...ev, starts: e.target.value })} /></div></div>
          {ev.tiers.map((t, i) => (
            <div key={i} className="grid grid-cols-[1fr_90px_90px_auto] gap-2"><Input value={t.name} onChange={(e) => setEv({ ...ev, tiers: ev.tiers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
              <Input type="number" value={t.price} onChange={(e) => setEv({ ...ev, tiers: ev.tiers.map((x, j) => (j === i ? { ...x, price: +e.target.value } : x)) })} title="price USD" />
              <Input type="number" value={t.seats} onChange={(e) => setEv({ ...ev, tiers: ev.tiers.map((x, j) => (j === i ? { ...x, seats: +e.target.value } : x)) })} title="seats" />
              <Button variant="ghost" size="sm" onClick={() => setEv({ ...ev, tiers: ev.tiers.filter((_, j) => j !== i) })}>✕</Button></div>))}
          <div className="flex gap-2"><Button variant="secondary" size="sm" onClick={() => setEv({ ...ev, tiers: [...ev.tiers, { name: "Tier", price: 50, seats: 50 }] })}>+ tier</Button><Button onClick={createEvent}>Create event</Button></div>
        </Card>
        <Card className="space-y-3">
          <CardTitle>Create drop</CardTitle>
          <div><Label>Event</Label><Select value={dr.event_id} onChange={(e) => setDr({ ...dr, event_id: e.target.value })}><option value="">(latest)</option>{(events || []).map((e) => <option key={e.id} value={e.id}>{e.name} · {e.id}</option>)}</Select></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Mode</Label><Select value={dr.mode} onChange={(e) => setDr({ ...dr, mode: e.target.value })}><option value="fairdrop">Fair Drop (lottery)</option><option value="fcfs">FCFS baseline</option></Select></div>
            <div><Label>Opens in (s)</Label><Input type="number" value={dr.opens_in} onChange={(e) => setDr({ ...dr, opens_in: +e.target.value })} /></div>
            <div><Label>Window length (s)</Label><Input type="number" value={dr.window} onChange={(e) => setDr({ ...dr, window: +e.target.value })} /></div>
            <div><Label>Eligibility cutoff</Label><Select value={dr.cutoff} onChange={(e) => setDr({ ...dr, cutoff: e.target.value })}><option value="now">now (new signups can't enter)</option><option value="1h">in 1 hour (new signups can enter)</option></Select></div>
            <div><Label>Claim time (s)</Label><Input type="number" value={dr.claim} onChange={(e) => setDr({ ...dr, claim: +e.target.value })} /></div>
            <label className="mt-6 flex items-center gap-2 text-sm"><input type="checkbox" checked={dr.auto} onChange={(e) => setDr({ ...dr, auto: e.target.checked })} />auto-advance after close</label>
          </div>
          <Button onClick={createDrop}>Create drop (generates seed + signing key)</Button>
        </Card>
      </div>
    </div>
  );
}
