"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { prog } from "@/components/story/Scene";

const Scene = dynamic(() => import("@/components/story/Scene"), { ssr: false });

const STEPS = [
  { k: "THE PROBLEM", h: "50,000 people. 500 seats.", p: "Every dot is a person who wants a ticket. A few of the orange ones are bots: programs that click faster than any human and never get tired.", n: "Illustration: orange dots are bots. In our tests bots were as few as 0.4% of the crowd.", side: "left" },
  { k: "THE OLD WAY", h: "First come, first served: bots win.", p: "Whoever clicks fastest gets the seat. The bots are first at the gate and fill the front rows while thousands of real people are left behind.", n: "Measured: bots were 0.4% of the crowd and took 20% of the seats (50 times their share).", side: "right" },
  { k: "STEP 1", h: "One verified person. One ticket.", p: "Everyone must prove who they are once. Each verified person gets exactly one entry into the draw, and sending a million requests does not add a second. Speed and volume stop mattering.", n: "A bot is just one dot, like everybody else. To get more, it must buy more real identities, and that costs money.", side: "left" },
  { k: "STEP 2", h: "Seal the list before anyone knows the result.", p: "All entries are combined into one fingerprint (a Merkle root) and published. After that nobody, not even us, can add, remove or swap an entry without the fingerprint changing.", n: "If a dishonest server dropped one entry, that person's own screen turns red.", side: "right" },
  { k: "STEP 3", h: "A draw anyone can re-run.", p: "A secret seed, committed in advance, plus public randomness nobody controls, picks the winners. The lowest scores rise to the top. Everyone can recompute it on their own computer.", n: "Measured: bots held 0.4% of the seats, exactly their share of the crowd.", side: "left" },
  { k: "STEP 4", h: "Don't trust us. Check.", p: "The live show on the admin page shows every accept and reject as it happens, then re-checks each decision with an independent test. Open it and attack the system yourself.", n: "", side: "right", cta: true },
];

export default function Story() {
  const wrap = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    prog.reduced = reduced;
    let lenis: Lenis | null = null, raf: ((t: number) => void) | null = null;
    if (!reduced) {
      lenis = new Lenis({ lerp: 0.09, smoothWheel: true });
      lenis.on("scroll", ScrollTrigger.update);
      raf = (time: number) => lenis!.raf(time * 1000);
      gsap.ticker.add(raf); gsap.ticker.lagSmoothing(0);
    }
    const st = ScrollTrigger.create({ trigger: wrap.current, start: "top top", end: "bottom bottom", scrub: reduced ? true : 0.6,
      onUpdate: (self) => { prog.p = self.progress; setStep(Math.min(STEPS.length - 1, Math.round(self.progress * (STEPS.length - 1)))); } });
    return () => { st.kill(); if (raf) gsap.ticker.remove(raf); lenis?.destroy(); prog.p = 0; };
  }, []);

  return (
    <div ref={wrap} className="relative -mx-4 -my-8">
      <div className="pointer-events-none fixed inset-0 z-0"><Scene /></div>
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-10 flex justify-center gap-2">
        {STEPS.map((_, i) => <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-8 bg-accent" : "w-2 bg-line"}`} />)}
      </div>
      <div className="relative z-10">
        {STEPS.map((s, i) => (
          <section key={i} className={`flex min-h-screen items-center px-6 md:px-16 ${s.side === "right" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-md rounded-2xl border border-line/60 bg-bg/70 p-6 backdrop-blur transition-all duration-700 ${step === i ? "translate-y-0 opacity-100" : "translate-y-6 opacity-30"}`}>
              <div className="mb-2 text-xs font-semibold tracking-[0.2em] text-accent">{s.k}</div>
              <h2 className="mb-3 text-3xl font-bold leading-tight md:text-4xl">{s.h}</h2>
              <p className="text-ink/85">{s.p}</p>
              {s.n && <p className="mt-3 rounded-lg bg-panel2/80 p-3 text-sm text-mute">{s.n}</p>}
              {s.cta && (
                <div className="mt-5 flex flex-wrap gap-2 pointer-events-auto">
                  <Link href="/admin" className="rounded-lg bg-accent px-4 py-2 font-semibold text-black">Open the Live Show</Link>
                  <Link href="/" className="rounded-lg border border-line px-4 py-2">Try it as a fan</Link>
                  <Link href="/verify" className="rounded-lg border border-line px-4 py-2">Verify a draw</Link>
                </div>
              )}
              {i === 0 && <div className="mt-4 text-sm text-mute">Scroll ↓</div>}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
