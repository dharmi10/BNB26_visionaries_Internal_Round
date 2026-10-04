"use client";
import { useEffect, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

// scroll progress 0..1 is written by the page (GSAP ScrollTrigger) and read every frame
export const prog = { p: 0, reduced: false };

const N = 3600, BOTS = 100, SEATS = 500, STAGES = 6;
const TEAL: [number, number, number] = [0.18, 0.83, 0.75], ORANGE: [number, number, number] = [1, 0.62, 0.05], GREEN: [number, number, number] = [0.13, 0.9, 0.4], WHITE: [number, number, number] = [1, 1, 1];

function mulberry32(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function build() {
  const rng = mulberry32(7), g = () => (rng() + rng() + rng() - 1.5) * 2;
  const pos = Array.from({ length: STAGES }, () => new Float32Array(N * 3));
  const col = Array.from({ length: STAGES }, () => new Float32Array(N * 3));
  const perm = Array.from({ length: N }, (_, i) => i).sort(() => rng() - 0.5);
  const rank = new Int32Array(N); perm.forEach((id, r) => (rank[id] = r));
  const put = (s: number, i: number, x: number, y: number, z: number, c: [number, number, number], k = 1) => { pos[s].set([x, y, z], i * 3); col[s].set([c[0] * k, c[1] * k, c[2] * k], i * 3); };
  const bot = (i: number) => i < BOTS;
  for (let i = 0; i < N; i++) {
    const base = bot(i) ? ORANGE : TEAL;
    // 0 crowd
    put(0, i, g() * 7, g() * 4.5, g() * 5, base, bot(i) ? 1 : 0.8);
    // 1 first come first served: bots (fast) grab seats, a few people squeeze in, everyone else is left behind
    const seatIdx = bot(i) ? i : i < BOTS + (SEATS - BOTS) ? i : -1;
    if (seatIdx >= 0) { const c = seatIdx % 25, r = Math.floor(seatIdx / 25); put(1, i, 4.2 + (c - 12) * 0.3, (r - 10) * 0.3, 4, base, 1); }
    else put(1, i, -3 + g() * 5, g() * 4, -6 + rng() * 5, TEAL, 0.35);
    // 2 one person one ticket: an even grid, bots are just one dot each
    const c2 = i % 60, r2 = Math.floor(i / 60);
    put(2, i, (c2 - 30) * 0.4, (r2 - 30) * 0.4, 0, base, bot(i) ? 1 : 0.85);
    // 3 sealed list: a hash tree funnelling to one root
    const layer = Math.floor(Math.log2(i + 1)), idxIn = i + 1 - 2 ** layer, cnt = 2 ** layer, ang = (idxIn / cnt) * Math.PI * 2 + layer * 0.5, rad = 0.4 + (layer * 1.1) * (layer > 8 ? 1.15 : 1);
    put(3, i, Math.cos(ang) * rad, 9 - layer * 1.5, Math.sin(ang) * rad, layer < 2 ? WHITE : bot(i) ? ORANGE : TEAL, layer < 2 ? 1 : 0.8);
    // 4 the draw: lowest scores win and rise; everyone else sinks
    const rk = rank[i];
    if (rk < SEATS) { const c = rk % 25, r = Math.floor(rk / 25); put(4, i, (c - 12) * 0.3, 4 + (r - 10) * 0.3, 0, bot(i) ? ORANGE : GREEN, 1); }
    else put(4, i, g() * 11, -6 + g() * 1.5, g() * 6, bot(i) ? ORANGE : TEAL, 0.28);
    // 5 verify: winners hold the centre, the rest orbit far away
    if (rk < SEATS) { const c = rk % 25, r = Math.floor(rk / 25); put(5, i, (c - 12) * 0.3, (r - 10) * 0.3, 3, bot(i) ? ORANGE : GREEN, 1); }
    else { const a = rng() * Math.PI * 2, rr = 14 + rng() * 14; put(5, i, Math.cos(a) * rr, g() * 6, Math.sin(a) * rr - 6, bot(i) ? ORANGE : TEAL, 0.25); }
  }
  return { pos, col };
}

const CAM: [number, number, number][] = [[0, 0, 26], [1, 0.5, 15], [0, 0, 24], [0, 1, 25], [0, 0.5, 23], [0, 0, 20]];
const LOOK: [number, number, number][] = [[0, 0, 0], [2, 0, 2], [0, 0, 0], [0, 2, 0], [0, 0, 0], [0, 0, 2]];
const ease = (t: number) => t * t * (3 - 2 * t);

function Points() {
  const { camera } = useThree();
  const data = useMemo(build, []);
  const geo = useMemo(() => {
    const gm = new THREE.BufferGeometry();
    gm.setAttribute("position", new THREE.BufferAttribute(new Float32Array(data.pos[0]), 3));
    gm.setAttribute("color", new THREE.BufferAttribute(new Float32Array(data.col[0]), 3));
    return gm;
  }, [data]);
  const mat = useMemo(() => {
    const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d")!;
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(255,255,255,.8)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    return new THREE.PointsMaterial({ size: 0.2, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, map: new THREE.CanvasTexture(c) });
  }, []);
  const obj = useMemo(() => new THREE.Points(geo, mat), [geo, mat]);
  const look = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);

  useFrame(({ clock }) => {
    const s = Math.min(STAGES - 1.0001, Math.max(0, prog.p) * (STAGES - 1)), a = Math.floor(s), b = a + 1, t = ease(s - a);
    const P = geo.attributes.position.array as Float32Array, C = geo.attributes.color.array as Float32Array;
    const A = data.pos[a], B = data.pos[b], CA = data.col[a], CB = data.col[b];
    const tm = prog.reduced ? 0 : clock.elapsedTime;
    for (let i = 0; i < N * 3; i += 3) {
      const sway = Math.sin(tm * 0.6 + i) * 0.04;
      P[i] = A[i] + (B[i] - A[i]) * t + sway; P[i + 1] = A[i + 1] + (B[i + 1] - A[i + 1]) * t + Math.cos(tm * 0.5 + i) * 0.04; P[i + 2] = A[i + 2] + (B[i + 2] - A[i + 2]) * t;
      C[i] = CA[i] + (CB[i] - CA[i]) * t; C[i + 1] = CA[i + 1] + (CB[i + 1] - CA[i + 1]) * t; C[i + 2] = CA[i + 2] + (CB[i + 2] - CA[i + 2]) * t;
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
    const cp = CAM[a], cn = CAM[b], lp = LOOK[a], ln = LOOK[b];
    camera.position.set(cp[0] + (cn[0] - cp[0]) * t, cp[1] + (cn[1] - cp[1]) * t, cp[2] + (cn[2] - cp[2]) * t);
    look.set(lp[0] + (ln[0] - lp[0]) * t, lp[1] + (ln[1] - lp[1]) * t, lp[2] + (ln[2] - lp[2]) * t);
    camera.lookAt(look);
    obj.rotation.y = prog.reduced ? 0 : Math.sin(tm * 0.15) * 0.08;
  });
  return <primitive object={obj} />;
}

export default function Scene() {
  return (
    <Canvas camera={{ position: [0, 0, 26], fov: 55 }} dpr={[1, 1.75]} gl={{ antialias: true, alpha: true }}>
      <Points />
    </Canvas>
  );
}
