"use client";
import { useEffect, useState } from "react";
import { api, adminToken } from "@/lib/api";
import { Button, Callout, Card, CardTitle, Input, Label, Tabs } from "@/components/ui";
import DropsTab from "@/components/admin/DropsTab";
import LiveTab from "@/components/admin/LiveTab";
import FairnessTab from "@/components/admin/FairnessTab";
import AuditTab from "@/components/admin/AuditTab";
import ControlRoom from "@/components/admin/ControlRoom";
import OverviewTab from "@/components/admin/OverviewTab";
import TestLabTab from "@/components/admin/TestLabTab";

import ArenaView from "@/components/arena/ArenaView";

// Three simple places. Everything the old Control Room had is still here, under "More tools".
const TOP = [{ id: "arena", label: "▶ Live Arena" }, { id: "proof", label: "Proof & checks" }, { id: "adv", label: "More tools" }];
const ADV = [{ id: "show", label: "Detailed control room" }, { id: "home", label: "Summary" }, { id: "drops", label: "Run a sale, step by step" }, { id: "live", label: "Server details" }, { id: "lab", label: "Test tools" }];
const PROOF = [{ id: "fair", label: "Detailed results" }, { id: "audit", label: "Tamper checks" }];

export default function Admin() {
  const [authed, setAuthed] = useState(false);
  const [ready, setReady] = useState(false);
  const [top, setTop] = useState("arena");
  const [tab, setTab] = useState("show");        // sub-tab inside "More tools"
  const [pf, setPf] = useState("fair");          // sub-tab inside "Proof & checks"
  const goTab = (t: string) => { if (t === "fair" || t === "audit") { setTop("proof"); setPf(t); } else if (t === "arena") setTop("arena"); else { setTop("adv"); setTab(t); } };
  const [dropId, setDropId] = useState("");
  const [f, setF] = useState({ username: "admin", password: "" });
  const [err, setErr] = useState("");

  useEffect(() => { setAuthed(!!adminToken.get()); setDropId(sessionStorage.getItem("fd:admin-drop") || ""); setReady(true); }, []);
  // with nothing chosen yet, follow the newest test sale so the proof tabs always have something to show
  useEffect(() => {
    if (!authed || dropId) return;
    api<any[]>("/admin/drops", { auth: "admin" }).then((ds) => { const d = ds.filter((x) => x.mode === "fairdrop").sort((x, y) => y.opens_at_ms - x.opens_at_ms)[0]; if (d) setDropId(d.id); }).catch(() => {});
  }, [authed, dropId, top]);
  useEffect(() => { if (dropId) sessionStorage.setItem("fd:admin-drop", dropId); }, [dropId]);

  const login = async () => {
    setErr("");
    try { const r = await api<any>("/admin/login", { body: f }); adminToken.set(r.token); setAuthed(true); }
    catch (e: any) { setErr(e.status === 401 ? "Wrong credentials" : e.message); }
  };
  if (!ready) return null;
  if (!authed) return (
    <div className="mx-auto max-w-sm pt-10">
      <Card className="space-y-3">
        <CardTitle>Admin sign-in</CardTitle>
        <div><Label>Username</Label><Input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></div>
        <div><Label>Password</Label><Input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} onKeyDown={(e) => e.key === "Enter" && login()} /></div>
        {err && <Callout tone="bad">{err}</Callout>}
        <Button onClick={login}>Sign in</Button>
        <p className="text-xs text-mute">Admins run the phases. They cannot pick winners: the draw is a pure function of the committed seed and the locked list.</p>
      </Card>
    </div>
  );
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">Admin</h1><Button variant="ghost" size="sm" onClick={() => { adminToken.clear(); setAuthed(false); }}>Sign out</Button></div>
      <Tabs tabs={TOP} value={top} onChange={setTop} />
      {top === "arena" && <ArenaView />}
      {top === "proof" && <div className="space-y-4">
        <Tabs tabs={PROOF} value={pf} onChange={setPf} />
        {pf === "fair" && <FairnessTab />}
        {pf === "audit" && <AuditTab dropId={dropId} />}
      </div>}
      {top === "adv" && <div className="space-y-4">
        <Tabs tabs={ADV} value={tab} onChange={setTab} />
        {tab === "show" && <ControlRoom dropId={dropId} setDropId={setDropId} goTab={goTab} />}
        {tab === "home" && <OverviewTab dropId={dropId} setDropId={setDropId} go={goTab} />}
        {tab === "drops" && <DropsTab dropId={dropId} setDropId={setDropId} />}
        {tab === "live" && <LiveTab dropId={dropId} />}
        {tab === "lab" && <TestLabTab dropId={dropId} />}
      </div>}
    </div>
  );
}
