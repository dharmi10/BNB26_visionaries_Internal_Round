"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { session } from "@/lib/api";
import { cn } from "./ui";

export default function Nav() {
  const path = usePathname() || "";
  const live = path.startsWith("/live");
  const [user, setUser] = useState<string | null>(null);
  useEffect(() => { setUser(session.get()?.user_id || null); }, [path]);
  const links = [["/", "Drops"], ["/live", "Live Arena"], ["/story", "Story"], ["/verify", "Verify"], ["/admin", "Admin"]];
  return (
    <nav className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
      <div className={cn("flex items-center justify-between px-4", live ? "py-1.5 md:px-6" : "mx-auto max-w-6xl py-3")}>
        <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
          <span className={cn("grid place-items-center rounded-md bg-accent text-black", live ? "h-6 w-6 text-xs" : "h-7 w-7")}>FD</span>
          <span>Fair&nbsp;Drop</span>
        </Link>
        <div className="flex items-center gap-1 text-sm">
          {links.map(([h, l]) => (
            <Link key={h} href={h} className={cn("rounded-md px-3 py-1.5 text-mute hover:text-ink", live && "py-1", (h === "/" ? path === "/" : path.startsWith(h)) && "bg-panel2 text-ink")}>{l}</Link>
          ))}
          {!live && (user ? (
            <button className="ml-2 rounded-md border border-line px-3 py-1.5 text-xs text-mute hover:text-ink" onClick={() => { session.clear(); setUser(null); location.href = "/"; }} title="sign out">{user}</button>
          ) : (
            <Link href="/login" className="ml-2 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-black">Sign in</Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
