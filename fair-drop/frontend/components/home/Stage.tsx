"use client";
// The pinned arena: thousands of lit particles that morph between chapter layouts, spotlight cones, a grid floor and a glowing door.
// Everything is driven by prog.u (written by the page on scroll). No React state per frame, no allocation inside useFrame.
import { useEffect, useMemo, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { prog } from "./store";
import { build, CAM, DIM, BEAM, DOOR, STAGES } from "./layouts";

const POINT_VERT = /* glsl */ `
attribute vec3 aPosB; attribute vec3 aColA; attribute vec3 aColB; attribute float aSizeA; attribute float aSizeB; attribute float aSeed; attribute float aKind;
uniform float uT, uTime, uPx, uDim, uCalm;
varying vec3 vC; varying float vK; varying float vA;
void main(){
  float tt = clamp(uT * 1.55 - aSeed * 0.55, 0., 1.); tt = tt * tt * (3. - 2. * tt);
  vec3 p = mix(position, aPosB, tt);
  float arc = sin(tt * 3.14159) * (1. - uCalm);
  p += vec3(sin(aSeed * 57.), cos(aSeed * 91.), sin(aSeed * 33.)) * arc * 1.7;
  p.x += sin(uTime * .6 + aSeed * 40.) * .05 * (1. - uCalm);
  p.y += cos(uTime * .5 + aSeed * 70.) * .06 * (1. - uCalm);
  vec4 mv = modelViewMatrix * vec4(p, 1.);
  gl_Position = projectionMatrix * mv;
  float sz = mix(aSizeA, aSizeB, tt) * (1. + .22 * sin(uTime * 2. + aSeed * 100.) * (1. - uCalm));
  gl_PointSize = clamp(sz * uPx / max(-mv.z, .1), 1.5, 30.);
  vC = mix(aColA, aColB, tt); vK = aKind; vA = uDim;
}`;
const POINT_FRAG = /* glsl */ `
varying vec3 vC; varying float vK; varying float vA;
void main(){
  vec2 q = gl_PointCoord * 2. - 1.;
  float d = vK > .5 ? (abs(q.x) + abs(q.y)) * .92 : length(q); // bots are diamonds, people are discs
  if (d > 1.) discard;
  float core = smoothstep(.62, .38, d), halo = exp(-d * d * 3.2) * .36;
  float a = (core * .9 + halo) * vA;
  gl_FragColor = vec4(vC * (1. + core * .2), a);
}`;
const BEAM_VERT = /* glsl */ `
varying vec3 vN; varying vec3 vV; varying vec2 vUv;
void main(){ vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const BEAM_FRAG = /* glsl */ `
uniform vec3 uCol; uniform float uI; varying vec3 vN; varying vec3 vV; varying vec2 vUv;
void main(){ float f = pow(abs(dot(normalize(vN), normalize(vV))), 2.2); float a = f * pow(vUv.y, 1.7) * uI * .42; gl_FragColor = vec4(uCol, a); }`;
const FLOOR_VERT = /* glsl */ `varying vec3 vP; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FLOOR_FRAG = /* glsl */ `
uniform vec3 uCol; uniform float uI; varying vec3 vP;
void main(){
  vec2 c = vP.xz / 2.5; vec2 g = abs(fract(c - .5) - .5) / fwidth(c);
  float line = 1. - min(min(g.x, g.y), 1.);
  float fade = 1. - smoothstep(8., 70., length(vP.xz - vec2(0., -4.)));
  gl_FragColor = vec4(uCol, line * fade * uI * .5);
}`;
const DOOR_FRAG = /* glsl */ `
uniform vec3 uCol; uniform float uI; varying vec2 vUv;
void main(){
  vec2 p = vUv * 2. - 1.;
  float box = (1. - smoothstep(.35, 1., abs(p.x))) * (1. - smoothstep(.35, 1., abs(p.y)));
  float core = (1. - smoothstep(.0, .55, abs(p.x))) * (1. - smoothstep(.2, 1., abs(p.y)));
  gl_FragColor = vec4(uCol * (.6 + core * .9), (box * .55 + core * .45) * uI);
}`;
const PLAIN_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const add = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending } as const;

function World({ n }: { n: number }) {
  const { camera, invalidate } = useThree();
  const rig = useMemo(() => {
    const data = build(n);
    const root = new THREE.Group();
    const disposables: { dispose(): void }[] = [];
    const reg = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

    // particles: positions, colours and sizes of the current pair of layouts live in the geometry; the GPU morphs between them
    const geo = reg(new THREE.BufferGeometry());
    const attr = (name: string, size: number, len = n) => { const a = new THREE.BufferAttribute(new Float32Array(len * size), size); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(name, a); return a; };
    const A = { pos: attr("position", 3), posB: attr("aPosB", 3), colA: attr("aColA", 3), colB: attr("aColB", 3), sizeA: attr("aSizeA", 1), sizeB: attr("aSizeB", 1) };
    geo.setAttribute("aSeed", new THREE.BufferAttribute(data.seed, 1));
    geo.setAttribute("aKind", new THREE.BufferAttribute(data.kind, 1));
    const pointMat = reg(new THREE.ShaderMaterial({ ...add, vertexShader: POINT_VERT, fragmentShader: POINT_FRAG, uniforms: { uT: { value: 0 }, uTime: { value: 0 }, uPx: { value: 900 }, uDim: { value: 1 }, uCalm: { value: 0 } } }));
    const points = new THREE.Points(geo, pointMat); points.frustumCulled = false; root.add(points);
    let pair = -1;
    const setPair = (p: number) => {
      pair = p; const a = data.layouts[p], b = data.layouts[p + 1];
      (A.pos.array as Float32Array).set(a.pos); (A.posB.array as Float32Array).set(b.pos);
      (A.colA.array as Float32Array).set(a.col); (A.colB.array as Float32Array).set(b.col);
      (A.sizeA.array as Float32Array).set(a.size); (A.sizeB.array as Float32Array).set(b.size);
      for (const x of Object.values(A)) x.needsUpdate = true;
    };

    // spotlight cones
    const coneGeo = reg(new THREE.ConeGeometry(3.4, 26, 32, 1, true)); coneGeo.translate(0, -13, 0);
    const beams = [-13, -6.5, 0, 6.5, 13].map((x) => {
      const m = reg(new THREE.ShaderMaterial({ ...add, side: THREE.DoubleSide, vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG, uniforms: { uCol: { value: new THREE.Color() }, uI: { value: 1 } } }));
      const mesh = new THREE.Mesh(coneGeo, m); mesh.position.set(x, 14, -9); mesh.frustumCulled = false; root.add(mesh); return mesh;
    });
    // floor grid
    const floorMat = reg(new THREE.ShaderMaterial({ ...add, vertexShader: FLOOR_VERT, fragmentShader: FLOOR_FRAG, uniforms: { uCol: { value: new THREE.Color(0.55, 0.42, 1) }, uI: { value: 0.7 } } }));
    const floorGeo = reg(new THREE.PlaneGeometry(180, 180)); floorGeo.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(floorGeo, floorMat); floor.position.y = -3.2; floor.frustumCulled = false; root.add(floor);
    // door / stage glow
    const doorMat = reg(new THREE.ShaderMaterial({ ...add, side: THREE.DoubleSide, vertexShader: PLAIN_VERT, fragmentShader: DOOR_FRAG, uniforms: { uCol: { value: new THREE.Color() }, uI: { value: 1 } } }));
    const doorGeo = reg(new THREE.PlaneGeometry(1, 1));
    const door = new THREE.Mesh(doorGeo, doorMat); door.frustumCulled = false; root.add(door);

    return { root, data, setPair, getPair: () => pair, pointMat, beams, door, doorMat, dispose: () => disposables.forEach((d) => d.dispose()) };
  }, [n]);

  useEffect(() => () => rig.dispose(), [rig]);
  useEffect(() => { prog.ping = () => invalidate(); return () => { prog.ping = null; }; }, [invalidate]);

  const tmp = useMemo(() => ({ ud: prog.u, c1: new THREE.Color(), c2: new THREE.Color(), p: new THREE.Vector3(), q: new THREE.Vector3(), l: new THREE.Vector3(), m: new THREE.Vector3() }), []);

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const calm = prog.reduced ? 1 : 0;
    tmp.ud += (prog.u - tmp.ud) * (calm ? 1 : 1 - Math.exp(-dt * 4.5));
    if (Math.abs(prog.u - tmp.ud) < 1e-4) tmp.ud = prog.u;
    const u = Math.min(tmp.ud, STAGES - 1e-3), i = Math.floor(u), f = u - i, j = Math.min(i + 1, STAGES - 1);
    const tt = clamp01((f - 0.6) / 0.4), te = tt * tt * (3 - 2 * tt);
    const s = Math.min(i + tt, STAGES - 1), p = Math.min(Math.floor(s), STAGES - 2);
    if (rig.getPair() !== p) rig.setPair(p);
    const U = rig.pointMat.uniforms;
    U.uT.value = s - p; U.uTime.value = calm ? 0 : state.clock.elapsedTime; U.uCalm.value = calm;
    U.uDim.value = DIM[i] + (DIM[j] - DIM[i]) * te;
    U.uPx.value = (state.size.height * state.viewport.dpr) / (2 * Math.tan(((camera as THREE.PerspectiveCamera).fov * Math.PI) / 360));

    // camera
    const ci = CAM[i], cj = CAM[j];
    tmp.p.set(ci[0][0] + (ci[2][0] - ci[0][0]) * f, ci[0][1] + (ci[2][1] - ci[0][1]) * f, ci[0][2] + (ci[2][2] - ci[0][2]) * f);
    tmp.l.set(ci[1][0] + (ci[3][0] - ci[1][0]) * f, ci[1][1] + (ci[3][1] - ci[1][1]) * f, ci[1][2] + (ci[3][2] - ci[1][2]) * f);
    if (i < STAGES - 1) { tmp.q.set(cj[0][0], cj[0][1], cj[0][2]); tmp.p.lerp(tmp.q, te); tmp.q.set(cj[1][0], cj[1][1], cj[1][2]); tmp.l.lerp(tmp.q, te); }
    camera.position.copy(tmp.p); camera.lookAt(tmp.l);

    // beams
    const t = calm ? 0 : state.clock.elapsedTime, bi = BEAM[i], bj = BEAM[j];
    rig.beams.forEach((m, k) => {
      const mat = m.material as THREE.ShaderMaterial, a = bi.cols[k], b = bj.cols[k];
      tmp.c1.setRGB(a[0], a[1], a[2]); tmp.c2.setRGB(b[0], b[1], b[2]);
      mat.uniforms.uCol.value.copy(tmp.c1).lerp(tmp.c2, te); mat.uniforms.uI.value = bi.i + (bj.i - bi.i) * te;
      m.rotation.z = (k - 2) * 0.05 + Math.sin(t * 0.35 * (1 + k * 0.2) + k) * 0.18;
      m.rotation.x = -0.4 + Math.cos(t * 0.27 + k) * 0.1;
    });
    // door
    const di = DOOR[i], dj = DOOR[j];
    rig.door.position.set(di.p[0] + (dj.p[0] - di.p[0]) * te, di.p[1] + (dj.p[1] - di.p[1]) * te, di.p[2] + (dj.p[2] - di.p[2]) * te);
    rig.door.scale.set(di.s[0] + (dj.s[0] - di.s[0]) * te, di.s[1] + (dj.s[1] - di.s[1]) * te, 1);
    tmp.c1.setRGB(di.col[0], di.col[1], di.col[2]); tmp.c2.setRGB(dj.col[0], dj.col[1], dj.col[2]);
    rig.doorMat.uniforms.uCol.value.copy(tmp.c1).lerp(tmp.c2, te); rig.doorMat.uniforms.uI.value = di.i + (dj.i - di.i) * te;
  });
  return <primitive object={rig.root} />;
}

export default function Stage({ n, narrow }: { n: number; narrow: boolean }) {
  const [vis, setVis] = useState(true);
  useEffect(() => {
    const on = () => { prog.visible = !document.hidden; setVis(!document.hidden); };
    document.addEventListener("visibilitychange", on); on();
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return (
    <Canvas
      frameloop={!vis ? "never" : prog.reduced ? "demand" : "always"}
      dpr={[1, narrow ? 1.5 : 1.75]}
      gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
      camera={{ fov: 50, near: 0.1, far: 220, position: [0, 3.2, 27] }}
    >
      <World n={n} />
    </Canvas>
  );
}
