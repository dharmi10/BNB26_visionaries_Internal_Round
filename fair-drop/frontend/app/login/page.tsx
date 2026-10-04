"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, session } from "@/lib/api";
import { Button, Callout, Card, Input, Label } from "@/components/ui";

function Login() {
  const router = useRouter();
  const next = useSearchParams().get("next") || "/";
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState<any>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setErr(""); setBusy(true);
    try { const r = await api("/auth/otp", { body: { phone } }); setSent(r); setOtp(r.otp); }
    catch (e: any) { setErr(e.code === "bad_phone" ? "Enter a phone number (any digits, e.g. +1 555 010 2030)." : String(e.message)); }
    setBusy(false);
  };
  const verify = async () => {
    setErr(""); setBusy(true);
    try {
      const r = await api("/auth/verify", { body: { phone, otp } });
      session.set({ token: r.token, user_id: r.user_id, verified_at_ms: r.verified_at_ms, phone });
      router.push(next);
    } catch (e: any) { setErr(e.code === "bad_otp" ? "That code is wrong or expired." : String(e.message)); }
    setBusy(false);
  };

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Sign in</h1>
      <Callout tone="warn" title="Simulated verification">
        This hackathon build does <b>not</b> send SMS. The one-time code is shown on screen so you can try the flow. In production this step would be a real phone verification.
        Your verification time matters: accounts verified <b>after</b> a drop's eligibility cutoff can browse but cannot enter.
      </Callout>
      <Card className="space-y-4">
        <div><Label>Phone number</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 010 2030" disabled={!!sent} /></div>
        {!sent ? (
          <Button onClick={send} disabled={busy || phone.length < 6} className="w-full">Send code (simulated)</Button>
        ) : (
          <>
            <Callout tone="info" title="Simulated SMS inbox">Your code is <span className="mono text-lg font-bold text-accent">{sent.otp}</span></Callout>
            <div><Label>One-time code</Label><Input value={otp} onChange={(e) => setOtp(e.target.value)} className="mono" /></div>
            <Button onClick={verify} disabled={busy || otp.length < 4} className="w-full">Verify and sign in</Button>
          </>
        )}
        {err && <div className="text-sm text-bad">{err}</div>}
      </Card>
    </div>
  );
}
export default function Page() { return <Suspense><Login /></Suspense>; }
