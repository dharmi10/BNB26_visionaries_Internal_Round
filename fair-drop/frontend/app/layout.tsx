import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "Fair Drop - 500 seats, 50,000 people, no bot advantage",
  description: "A verifiable lottery: one verified identity, one entry, a publicly locked list, and a draw anyone can recompute.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-10 pt-4 text-xs text-mute">
          Fair Drop is a hackathon demo. OTP is <b>simulated</b>, payments are <b>mock</b>. Claim: network speed, request volume and IP rotation do not change your odds.
          Not claimed: that bots cannot exist or that buying real verified identities is impossible.
        </footer>
      </body>
    </html>
  );
}
