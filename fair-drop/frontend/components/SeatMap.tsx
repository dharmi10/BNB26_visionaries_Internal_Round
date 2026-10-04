"use client";
import { cn } from "./ui";

// Public seat map: tiers as blocks of seats. mine = the viewer's assigned seat number.
export default function SeatMap({ data, mine }: { data: { tiers: { id: string; name: string; offset: number; seats: string[] }[] }; mine?: number }) {
  const color: Record<string, string> = { open: "bg-line/60", reserved: "bg-warn/70", claimed: "bg-ok", unclaimed: "bg-line/30 outline outline-1 outline-dashed outline-mute/40" };
  return (
    <div className="space-y-4">
      {data.tiers.map((t) => (
        <div key={t.id}>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-mute">{t.name} · seats {t.offset + 1}–{t.offset + t.seats.length}</div>
          <div className="flex flex-wrap gap-[3px]">
            {t.seats.map((s, i) => {
              const n = t.offset + i + 1;
              return <span key={n} title={`seat ${n}: ${s}`} className={cn("h-3.5 w-3.5 rounded-[3px]", color[s] || "bg-line", mine === n && "scale-150 bg-accent ring-2 ring-white")} />;
            })}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-3 text-xs text-mute">
        <span><i className="mr-1 inline-block h-3 w-3 rounded-sm bg-warn/70" />reserved for a winner</span>
        <span><i className="mr-1 inline-block h-3 w-3 rounded-sm bg-ok" />claimed</span>
        <span><i className="mr-1 inline-block h-3 w-3 rounded-sm bg-line/30 outline outline-1 outline-dashed outline-mute/40" />unclaimed (no waitlist left)</span>
        <span><i className="mr-1 inline-block h-3 w-3 rounded-sm bg-accent ring-2 ring-white" />your seat</span>
      </div>
    </div>
  );
}
