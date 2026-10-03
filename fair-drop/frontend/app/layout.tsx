import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import Shell from "@/components/Shell";

export const metadata: Metadata = {
  title: "Fair Drop - 500 seats, 50,000 people, no bot advantage",
  description: "A verifiable lottery: one verified identity, one entry, a publicly locked list, and a draw anyone can recompute.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
