"use client";
import { ArrowDown, Radio, Ticket } from "lucide-react";
import { Marquee, Stub } from "@/components/ui";
import { BOT_ORDER, LAYERS } from "@/components/admin/botinfo";
import { Chapter, Legend, LinkBtn, Looking, Wrap } from "./parts";

export default function Hero() {
  return (
    <Chapter id="top" idx={0} className="flex min-h-[calc(100svh-3.5rem)] flex-col justify-end overflow-hidden">
      <div className="beams" />
      <Wrap className="relative z-10 pb-6 pt-10 md:pt-14">
        <div className="eyebrow mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-gold" data-reveal>
          <Ticket className="h-4 w-4" aria-hidden /><span>Tonight: a bot-proof ticket lottery</span><span className="h-px w-8 bg-gold/50" /><span className="text-mute">a 4-minute tour</span>
        </div>
        <h1 className="display text-[clamp(3.5rem,10.6vw,10rem)] leading-[.86]" aria-label="500 seats. 50,000 fans. Zero bot advantage.">
          <span className="block overflow-hidden"><span data-line className="block">500 seats.</span></span>
          <span className="block overflow-hidden"><span data-line className="block">50,000 fans.</span></span>
          <span className="block overflow-hidden pb-[.04em]">
            <span data-line className="block bg-gradient-to-r from-gold via-gold to-hot bg-clip-text text-[clamp(3.5rem,8.8vw,8.4rem)] text-transparent">
              <span className="block md:inline">Zero bot </span><span className="block md:inline">advantage.</span>
            </span>
          </span>
        </h1>
        <div className="mt-8 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="panel-glass max-w-xl space-y-5 p-5" data-reveal>
            <p className="text-lg leading-snug text-ink/90 md:text-xl">
              Bots click faster than people. Here, clicking faster buys nothing: <b className="text-gold">1 login, 1 ticket, 1 seat at most</b>, then a random draw anyone can re-run.
            </p>
            <div className="flex flex-wrap gap-3">
              <LinkBtn href="/live" variant="primary"><Radio className="h-4 w-4" />Watch it live</LinkBtn>
              <LinkBtn href="#shows">Book a seat</LinkBtn>
              <LinkBtn href="#problem" variant="ghost"><ArrowDown className="h-4 w-4" />Start the 4-minute tour</LinkBtn>
            </div>
            <Looking>An arena before the doors open. Every dot is a person who wants a ticket. Ice discs are real people, red diamonds are bots. Scroll and the crowd will show you the whole story.</Looking>
          </div>
          <div className="hidden w-[300px] shrink-0 rotate-[5deg] lg:block" aria-hidden>
            <Stub accent="gold" className="glow-gold" tear={<div className="flex items-center justify-between gap-3"><span className="eyebrow text-gold">1 login / 1 ticket / 1 seat</span><div className="barcode w-20 text-ink" /></div>}>
              <div className="eyebrow">Admit one</div>
              <div className="display mt-1 text-5xl text-gold">Fair<br />Drop</div>
              <div className="eyebrow mt-3">Seat chosen by a draw, not a click</div>
            </Stub>
          </div>
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
          <div className="eyebrow flex flex-wrap gap-x-6 gap-y-1">
            <span><b className="text-ink">{BOT_ORDER.length}</b> kinds of bot attack it</span><span><b className="text-ink">{LAYERS.length}</b> protection layers</span><span><b className="text-ink">0</b> trust required</span>
          </div>
          <Legend className="hidden md:flex" />
        </div>
      </Wrap>
      <Marquee className="relative z-10" items={["500 seats", "50,000 fans", "zero bot advantage", "1 login · 1 ticket · 1 seat at most", "the list is sealed before the draw", "anyone can re-run the draw"]} />
    </Chapter>
  );
}
