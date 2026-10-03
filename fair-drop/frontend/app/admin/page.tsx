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

const TABS = [{ id: "show", label: "● Control Room" }, { id: "home", label: "Summary" }, { id: "drops", label: "Run a sale, step by step" }, { id: "live", label: "Server details" }, { id: "fair", label: "Detailed results" }, { id: "audit", label: "Tamper checks" }, { id: "lab", label: "Test tools" }];

export default function Admin() {
  const [authed, setAuthed] = useState(false);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState("show");
  const [dropId, setDropId] = useState("");
  const [f, setF] = useState({ username: "admin", password: "" });
  const [err, setErr] = useState("");

  useEffect(() => { setAuthed(!!adminToken.get()); setDropId(sessionStorage.getItem("fd:admin-drop") || ""); setReady(true); }, []);
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
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === "show" && <ControlRoom dropId={dropId} setDropId={setDropId} goTab={setTab} />}
      {tab === "home" && <OverviewTab dropId={dropId} setDropId={setDropId} go={setTab} />}
      {tab === "drops" && <DropsTab dropId={dropId} setDropId={setDropId} />}
      {tab === "live" && <LiveTab dropId={dropId} />}
      {tab === "fair" && <FairnessTab />}
      {tab === "audit" && <AuditTab dropId={dropId} />}
      {tab === "lab" && <TestLabTab dropId={dropId} />}
    </div>
  );
}
