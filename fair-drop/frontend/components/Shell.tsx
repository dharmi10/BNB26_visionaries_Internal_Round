"use client";
import { usePathname } from "next/navigation";

// Page frame: normal centred column everywhere, full-width (and no footer) on the /live screen.
export default function Shell({ children }: { children: React.ReactNode }) {
  const live = (usePathname() || "").startsWith("/live");
  if (live) return <main className="px-4 py-4 md:px-6">{children}</main>;
  return (
    <>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      <footer className="mx-auto max-w-6xl px-4 pb-10 pt-4 text-xs text-mute">
        Fair Drop is a hackathon demo. OTP is <b>simulated</b>, payments are <b>mock</b>. Claim: network speed, request volume and IP rotation do not change your odds.
        Not claimed: that bots cannot exist or that buying real verified identities is impossible.
      </footer>
    </>
  );
}
