"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { api, money, seatLabel, session } from "@/lib/api";
import { Button, Callout, Card, Hash, Spinner } from "@/components/ui";

export default function Ticket() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [t, setT] = useState<any>(null);
  const [d, setD] = useState<any>(null);
  const [qr, setQr] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!session.get()) { router.replace(`/login?next=/ticket/${id}`); return; }
    Promise.all([api<any[]>("/me/tickets", { auth: "user" }), api<any>(`/drops/${id}`)]).then(async ([ts, drop]) => {
      const mine = ts.find((x) => x.drop_id === id);
      setD(drop);
      if (!mine) { setErr("No confirmed ticket for this drop on this account."); return; }
      setT(mine); setQr(await QRCode.toDataURL(mine.qr_payload, { margin: 1, width: 360, errorCorrectionLevel: "M" }));
    }).catch((e) => setErr(e.message));
  }, [id, router]);
  if (err) return <Callout tone="warn" title="No ticket">{err} <Link className="underline" href={`/claim/${id}`}>Go to claim</Link></Callout>;
  if (!t || !d) return <Spinner />;
  const tier = d.tiers.find((x: any) => x.id === t.tier);
  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="overflow-hidden rounded-2xl border border-line bg-panel">
        <div className="bg-gradient-to-r from-accent to-accent2 p-5 text-black"><div className="text-xs font-semibold uppercase tracking-widest">Fair Drop ticket</div><div className="text-2xl font-extrabold">{t.event_name}</div><div className="text-sm">{t.venue} · {new Date(d.starts_at).toLocaleString()}</div></div>
        <div className="grid grid-cols-3 gap-3 border-b border-dashed border-line p-5 text-sm">
          <div><div className="text-xs uppercase text-mute">Seat</div><div className="text-xl font-bold">{seatLabel(t.tier, t.seat_no)}</div></div>
          <div><div className="text-xs uppercase text-mute">Tier</div><div className="text-xl font-bold">{tier?.name}</div></div>
          <div><div className="text-xs uppercase text-mute">Paid</div><div className="text-xl font-bold">{tier && money(tier.price_cents)}</div></div>
        </div>
        <div className="grid place-items-center bg-white p-5">{qr && <img src={qr} alt="ticket QR code" className="h-56 w-56" />}</div>
        <div className="space-y-2 p-5"><Hash label="Receipt" v={t.receipt_id} /><div className="text-xs text-mute">The QR holds a payload signed by the drop's key. Seat {t.seat_no} was assigned by draw rank, not by click order.</div></div>
      </div>
      <div className="no-print flex gap-2"><Button onClick={() => window.print()} variant="secondary">Print</Button><Link href={`/verify?drop=${id}&receipt=${t.receipt_id}`}><Button variant="ghost">Verification link</Button></Link></div>
    </div>
  );
}
