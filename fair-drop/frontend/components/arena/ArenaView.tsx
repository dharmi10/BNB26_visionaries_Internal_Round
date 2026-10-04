"use client";
// The Live Arena: one screen that shows the crowd, the three methods side by side, and every bot at work.
// Used by /live (second monitor / second tab) and by the admin "Live Arena" tab.
import { useEffect, useRef, useState } from "react";
import { api, adminToken } from "@/lib/api";
import { Button, Callout, Card, CardTitle, Input, Label } from "@/components/ui";
import DotStage, { StageHandle } from "@/components/admin/DotStage";
import { reasonOf } from "@/components/admin/botinfo";
import { useArena } from "@/lib/arena";
import ArenaControls from "./ArenaControls";
import StatusBar from "./StatusBar";
import Guide from "./Guide";
import CrowdStrip from "./CrowdStrip";
import MethodCompare from "./MethodCompare";
import BotWatch from "./BotWatch";
import NumbersCheck from "./NumbersCheck";
import ResearchMetrics from "./ResearchMetrics";
import LiveHttp from "./LiveHttp";

function SignIn() {
  const [f, setF] = useState({ username: "admin", password: "" });
  const [err, setErr] = useState("");
  const go = async () => { setErr(""); try { const r = await api<any>("/admin/login", { body: f }); adminToken.set(r.token); } catch (e: any) { setErr(e.status === 401 ? "Wrong credentials" : e.message); } };
  return (
    <div className="mx-auto max-w-sm pt-10"><Card className="space-y-3">
      <CardTitle>Sign in to watch the arena</CardTitle>
      <div><Label>Username</Label><Input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></div>
      <div><Label>Password</Label><Input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} onKeyDown={(e) => e.key === "Enter" && go()} /></div>
      {err && <Callout tone="bad">{err}</Callout>}
      <Button onClick={go}>Sign in</Button>
    </Card></div>
  );
}

const H = ({ children, sub }: { children: React.ReactNode; sub?: string }) => (
  <div className="pt-3"><h2 className="text-xl font-bold tracking-tight md:text-2xl">{children}</h2>{sub && <p className="text-sm text-mute">{sub}</p>}</div>
);

export default function ArenaView({ screen = false }: { screen?: boolean }) {
  const a = useArena();
  const stage = useRef<StageHandle>(null);
  const seen = useRef<Set<string>>(new Set());
  const [gateOpen, setGateOpen] = useState(true);

  // feed the gate picture with the live decisions of whichever sale is running (each decision exactly once)
  useEffect(() => { stage.current?.reset(); seen.current = new Set(); }, [a.fairId, a.oldId]);
  useEffect(() => {
    const mode = a.phase === "old" ? "fcfs" : "fairdrop";
    const fresh = a.events.filter((e) => e.mode === mode && !seen.current.has(e.id));
    fresh.forEach((e) => seen.current.add(e.id));
    if (seen.current.size > 4000) seen.current = new Set(a.events.map((e) => e.id));
    if (fresh.length && a.running) stage.current?.push(fresh.slice(0, 60).reverse().map((e) => ({ v: e.v, k: e.k, pf: e.pf, r: reasonOf(e.s, e.o) })));
  }, [a.events]);

  if (!a.ready) return null;
  if (!a.authed) return <SignIn />;

  const side = a.phase === "old" ? a.gate.old : a.gate.fair;
  const lanes: Record<string, { entered: number; blocked: number }> = {};
  a.profiles.forEach((p) => { lanes[p.id] = { entered: p.gotInFair, blocked: p.blocked }; });

  return (
    <div className="space-y-5">
      {screen && <div className="flex flex-wrap items-center justify-between gap-2"><h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">Live Arena <span className="text-base font-medium text-mute">· real people vs bots, three ways to hand out 500 seats</span></h1></div>}
      <Guide />
      <ArenaControls a={a} screenLink={!screen} />
      <StatusBar a={a} />
      <CrowdStrip a={a} />
      <H sub="The same crowd, the same 500 seats, three ways of handing them out. Orange squares are seats that went to bots.">Which method is fair?</H>
      <MethodCompare a={a} />
      <NumbersCheck a={a} />
      <H sub="Hover a bot to watch what it is doing right now. Click an account in the console to follow just that one.">The bots, live</H>
      {!a.running && <div className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-2 text-sm text-warn">{a.fairId ? "Nothing is running right now. These cards, the log and the traffic below show the last test. Press ▶ Start (control panel at the top) to watch the bots work live." : "No test has run yet. Press ▶ Start in the control panel at the top and everything below comes alive."}</div>}
      <BotWatch a={a} />
      <LiveHttp a={a} />
      <div className="flex items-end justify-between gap-3 pt-3">
        <div><h2 className="text-xl font-bold tracking-tight md:text-2xl">The gate</h2><p className="text-sm text-mute">Every dot is one real decision by the server, shown as a picture: blue = person, orange = bot. Green = let in, red = turned away, purple = fell for the decoy trap. The sale shown is the one running now.</p></div>
        <Button variant="ghost" size="sm" onClick={() => setGateOpen(!gateOpen)}>{gateOpen ? "Hide picture" : "Show picture"}</Button>
      </div>
      <Card className={`p-2 ${gateOpen ? "" : "hidden"}`}><DotStage ref={stage} counts={side} lanes={lanes} seats={a.gate.seats} /></Card>
      <ResearchMetrics a={a} />
    </div>
  );
}
