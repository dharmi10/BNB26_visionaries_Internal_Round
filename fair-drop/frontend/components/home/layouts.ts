// Pure data: where every particle sits in each of the 8 chapters, plus camera / light tables.
// Colours: ice = real people, hot = bots, lime = let in, gold = Fair Drop, violet = sealed things.
import { BOT_ORDER, BOTS as BOTINFO } from "@/components/admin/botinfo";

export const STAGES = 8;
type V3 = [number, number, number];
export const ICE: V3 = [0.5, 0.85, 1], HOT: V3 = [1, 0.23, 0.36], LIME: V3 = [0.72, 1, 0.29], GOLD: V3 = [1, 0.76, 0.2], VIOLET: V3 = [0.55, 0.42, 1];
const hex = (h: string): V3 => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

export type Layout = { pos: Float32Array; col: Float32Array; size: Float32Array };
export type Built = { layouts: Layout[]; kind: Float32Array; seed: Float32Array; n: number };

function mulberry32(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function build(N: number): Built {
  const rng = mulberry32(11), g = () => (rng() + rng() + rng() - 1.5) * 2;
  const SEATS = Math.round(N * 0.125), BOTS = Math.round(N * 0.03);
  const botA = Math.round(0.2 * SEATS), botC = Math.round(0.025 * SEATS);
  // id ranges: bots [0,BOTS): A=[0,botA) C=[botA,botA+botC) rest; humans [BOTS,N): blockA, blockB, blockC, queue
  const hA0 = BOTS, hB0 = hA0 + (SEATS - botA), hC0 = hB0 + SEATS, hQ0 = hC0 + (SEATS - botC);
  const inA = (i: number) => i < botA || (i >= hA0 && i < hB0);
  const inB = (i: number) => i >= hB0 && i < hC0;
  const inC = (i: number) => (i >= botA && i < botA + botC) || (i >= hC0 && i < hQ0);
  const winner = inC; // winners of the fair draw
  const isBot = (i: number) => i < BOTS;
  const slotA = (i: number) => (i < botA ? i : botA + (i - hA0));
  const slotC = (i: number) => (i < botA + botC ? i - botA : botC + (i - hC0));
  const slotB = (i: number) => i - hB0;

  const mk = (): Layout => ({ pos: new Float32Array(N * 3), col: new Float32Array(N * 3), size: new Float32Array(N) });
  const L = Array.from({ length: STAGES }, mk);
  const put = (s: number, i: number, x: number, y: number, z: number, c: V3, k: number, sz: number) => {
    const l = L[s]; l.pos[i * 3] = x; l.pos[i * 3 + 1] = y; l.pos[i * 3 + 2] = z;
    l.col[i * 3] = c[0] * k; l.col[i * 3 + 1] = c[1] * k; l.col[i * 3 + 2] = c[2] * k; l.size[i] = sz;
  };
  const COLS = 25, SP = 0.27;
  const seat = (k: number, cx: number, cy: number, cz: number): V3 => [cx + ((k % COLS) - (COLS - 1) / 2) * SP, cy - (Math.floor(k / COLS) - SEATS / COLS / 2) * SP, cz];
  const laneColors = BOT_ORDER.map((id) => hex(BOTINFO[id].color));
  const R = 64; // particles per gate ring
  const gateCol: V3[] = [ICE, ICE, VIOLET, VIOLET, VIOLET, GOLD, LIME];
  const LY = 9; // protection layers
  const ringBase = hQ0; // gate rings and layer rings are taken from the queue

  const rnd = Array.from({ length: N }, () => rng());
  for (let i = 0; i < N; i++) {
    const bot = isBot(i), r1 = rnd[i], r2 = rng(), r3 = rng(), r4 = rng();
    // 0 arena crowd
    {
      const z = -3 + Math.pow(r1, 0.85) * 21;
      const arms = r3 < 0.07 ? r4 * 1.3 : 0;
      put(0, i, g() * (8 + z * 0.55), -2.5 + r2 * 0.5 + arms, z, bot ? HOT : ICE, bot ? 1 : 0.45 + 0.4 * r4, bot ? 0.55 : 0.2 + 0.2 * r3);
    }
    // 1 problem: everybody rushes one door, the 500 seats wait behind it, bots are at the very front
    {
      if (winner(i)) { const p = seat(slotC(i), 0, 1.7, -9.5); put(1, i, p[0], p[1], p[2], GOLD, 0.45, 0.22); }
      else if (bot) put(1, i, (r1 - 0.5) * 2.6, -2.3 + r2 * 0.5, -4 + r3 * 2.2, HOT, 1, 0.8);
      else { const z = -4.2 + Math.pow(r1, 1.35) * 15, w = 3 + (z + 4.2) * 0.75; put(1, i, g() * w * 0.5, -2.4 + r2 * 0.7, z, ICE, 0.4 + 0.4 * r4, 0.2 + 0.08 * r3); }
    }
    // 2 the bot roster: one light column per kind, the real person on the left, the crowd far behind
    {
      if (bot) {
        const k = i % 11, j = Math.floor(i / 11), per = Math.ceil(BOTS / 11);
        put(2, i, (k - 4.2) * 1.55, -2.6 + (j / per) * 9, Math.sin(k * 1.7) * 0.8, laneColors[k], 1, 0.9);
      } else if (i < BOTS + 16) put(2, i, -8.8, -2.6 + ((i - BOTS) / 16) * 9, 0, ICE, 1, 0.85);
      else put(2, i, g() * 15, -2.5 + r2 * 9, -9 - r1 * 9, ICE, 0.3 + 0.3 * r4, 0.26);
    }
    // 3 the fan's journey: a tunnel of seven gates, the fan's light flows through
    {
      const gi = i >= ringBase && i < ringBase + 7 * R ? i - ringBase : -1;
      if (gi >= 0) {
        const gt = Math.floor(gi / R), a = ((gi % R) / R) * Math.PI * 2, gz = 4 - gt * 6.5;
        put(3, i, Math.cos(a) * 4.2, Math.sin(a) * 3.4 + 0.3, gz, gateCol[gt], 1, 0.6);
      } else if (bot) { const a = r1 * 6.283, rr = 9 + r2 * 4; put(3, i, Math.cos(a) * rr, Math.sin(a) * rr * 0.6, 6 - r3 * 36, HOT, 0.6, 0.55); }
      else { const a = r1 * 6.283, rr = 0.6 + Math.sqrt(r2) * 2.2; put(3, i, Math.cos(a) * rr, Math.sin(a) * rr * 0.7 - 0.5, 9 - Math.pow(r3, 1.1) * 46, ICE, 0.35 + 0.4 * r4, 0.2); }
    }
    // 4 three ways: old way (left), lottery (middle), Fair Drop (right)
    {
      if (inA(i)) { const p = seat(slotA(i), -10.5, 1.4, 0); put(4, i, p[0], p[1], p[2], bot ? HOT : ICE, 1, bot ? 0.34 : 0.25); }
      else if (inB(i)) { const p = seat(slotB(i), 0, 1.4, 0); put(4, i, p[0], p[1], p[2], VIOLET, 0.95, 0.25); }
      else if (inC(i)) { const p = seat(slotC(i), 10.5, 1.4, 0); put(4, i, p[0], p[1], p[2], bot ? HOT : LIME, 1, bot ? 0.34 : 0.25); }
      else put(4, i, g() * 18, -3 + r2 * 3, -4 - r1 * 12, bot ? HOT : ICE, 0.3, 0.24);
    }
    // 5 what we do: nine gates in a stack, real people fall through, bots are stuck on the rims, the sealed list glows below
    {
      const qi = i >= ringBase && i < ringBase + LY * 48 ? i - ringBase : -1;
      if (qi >= 0) { const l = Math.floor(qi / 48), a = ((qi % 48) / 48) * Math.PI * 2; put(5, i, Math.cos(a) * 5.6, 7 - l * 1.45, Math.sin(a) * 5.6, VIOLET, 0.9, 0.34); }
      else if (bot) { const l = Math.floor(r1 * LY), a = r2 * 6.283; put(5, i, Math.cos(a) * (5.2 + r3 * 0.9), 7.1 - l * 1.45, Math.sin(a) * (5.2 + r3 * 0.9), HOT, 1, 0.75); }
      else if (winner(i)) { const k = slotC(i); put(5, i, ((k % COLS) - 12) * 0.46, -6.6, Math.floor(k / COLS) * 0.46 - 4.4, GOLD, 0.9, 0.26); }
      else { const a = r1 * 6.283, rr = Math.sqrt(r2) * 2.2; put(5, i, Math.cos(a) * rr, 9 - r3 * 15, Math.sin(a) * rr, ICE, 0.5 + 0.5 * r4, 0.3); }
    }
    // 6 proof: the 500 winners hold the grid, a golden ticket floats above, everyone else orbits far away
    {
      if (winner(i)) { const p = seat(slotC(i), 0, 0.2, 0); put(6, i, p[0], p[1], p[2], bot ? HOT : LIME, 1, bot ? 0.34 : 0.25); }
      else if (i >= hQ0 && i < hQ0 + 170) {
        const k = i - hQ0, per = 2 * (8 + 3.6), d = (k / 170) * per; let x: number, y: number;
        if (d < 8) { x = -4 + d; y = 7 + 3.6; } else if (d < 11.6) { x = 4; y = 10.6 - (d - 8); } else if (d < 19.6) { x = 4 - (d - 11.6); y = 7; } else { x = -4; y = 7 + (d - 19.6); }
        put(6, i, x, y - 1.2, 1.5, GOLD, 1, 0.3);
      } else { const a = r1 * 6.283, rr = 15 + r2 * 14; put(6, i, Math.cos(a) * rr, -2 + g() * 5, Math.sin(a) * rr - 8, bot ? HOT : ICE, 0.35, 0.26); }
    }
  }
  L[7] = L[0];
  const kind = new Float32Array(N), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) { kind[i] = isBot(i) ? 1 : 0; seed[i] = rng(); }
  return { layouts: L, kind, seed, n: N };
}

// ---- camera: per chapter a start and an end pose (drifts while you read), blended into the next chapter's start
type Cam = [V3, V3, V3, V3]; // posA, lookA, posB, lookB
export const CAM: Cam[] = [
  [[0, 3.2, 27], [0, 3, -4], [0, 3.6, 25], [0, 3, -4]],
  [[0, 2, 17], [0, 1, -6], [0, 1.6, 12], [0, 1, -6]],
  [[0, 3, 25], [-0.8, 2, 0], [0, 2.4, 21], [-0.8, 2, 0]],
  [[0, 0.4, 14], [0, 0, -14], [0, 0, -24], [0, 0, -46]],
  [[0, 4, 27], [0, 1, 0], [0, 3.4, 24], [0, 1, 0]],
  [[11, 5, 19], [0, 0.2, 0], [8, 3.5, 15], [0, 0.2, 0]],
  [[0, 3.4, 20], [0, 4, 0], [0, 3, 17], [0, 3.6, 0]],
  [[0, 3.2, 26], [0, 3, -4], [0, 3.4, 29], [0, 3, -4]],
];
// particle brightness per chapter (1 = full), keeps text readable on dense chapters
export const DIM = [0.9, 0.95, 0.62, 0.68, 0.6, 0.55, 0.65, 0.4];

// beams: five colours per chapter + intensity
const c = (r: number, g: number, b: number) => [r, g, b] as V3;
export const BEAM: { cols: V3[]; i: number }[] = [
  { cols: [GOLD, VIOLET, GOLD, VIOLET, GOLD], i: 1 },
  { cols: [HOT, HOT, VIOLET, HOT, HOT], i: 0.85 },
  { cols: [VIOLET, c(1, 0.54, 0.24), VIOLET, HOT, VIOLET], i: 0.55 },
  { cols: [VIOLET, ICE, VIOLET, ICE, VIOLET], i: 0.7 },
  { cols: [HOT, HOT, VIOLET, GOLD, GOLD], i: 0.6 },
  { cols: [VIOLET, GOLD, VIOLET, GOLD, VIOLET], i: 0.55 },
  { cols: [GOLD, GOLD, GOLD, LIME, GOLD], i: 0.8 },
  { cols: [GOLD, VIOLET, GOLD, VIOLET, GOLD], i: 0.45 },
];
// the glowing stage / door plane: x, y, z, width, height, intensity + colour
export const DOOR: { p: V3; s: [number, number]; i: number; col: V3 }[] = [
  { p: [0, 1.5, -13], s: [30, 8], i: 0.55, col: GOLD },
  { p: [0, 1, -6], s: [4.4, 7.5], i: 0.95, col: GOLD },
  { p: [0, 0, -16], s: [44, 16], i: 0.22, col: VIOLET },
  { p: [0, 0, -47], s: [9, 9], i: 1, col: GOLD },
  { p: [0, 1, -8], s: [40, 12], i: 0.22, col: VIOLET },
  { p: [0, -6.6, -6], s: [22, 2], i: 0.5, col: GOLD },
  { p: [0, 3, -9], s: [18, 10], i: 0.55, col: GOLD },
  { p: [0, 1.5, -13], s: [30, 8], i: 0.3, col: GOLD },
];
