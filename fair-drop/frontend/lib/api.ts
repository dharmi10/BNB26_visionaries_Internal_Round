"use client";
import { useEffect, useRef, useState } from "react";

export const API = process.env.NEXT_PUBLIC_API_BASE || "/api";

export class ApiError extends Error {
  constructor(public status: number, public code: string, public body: any) {
    super(`${status} ${code}`);
  }
}

export type Session = { token: string; user_id: string; verified_at_ms: number; phone?: string };
const safe = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} },
  del: (k: string) => { try { localStorage.removeItem(k); } catch {} },
};
export const session = {
  get: (): Session | null => { const s = safe.get("fd:user"); return s ? JSON.parse(s) : null; },
  set: (s: Session) => safe.set("fd:user", JSON.stringify(s)),
  clear: () => safe.del("fd:user"),
};
export const adminToken = {
  get: () => safe.get("fd:admin"), set: (t: string) => safe.set("fd:admin", t), clear: () => safe.del("fd:admin"),
};
export const testKey = {
  get: () => { try { return sessionStorage.getItem("fd:testkey") || "test-key-demo"; } catch { return "test-key-demo"; } },
  set: (k: string) => { try { sessionStorage.setItem("fd:testkey", k); } catch {} },
};

export function randId() {
  const a = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

type Opts = { method?: string; body?: any; auth?: "user" | "admin" | false; headers?: Record<string, string>; idem?: boolean; base?: string };

export async function api<T = any>(path: string, o: Opts = {}): Promise<T> {
  const h: Record<string, string> = { ...(o.headers || {}) };
  if (o.body !== undefined) h["content-type"] = "application/json";
  if (o.auth === "user") { const s = session.get(); if (s) h.Authorization = "Bearer " + s.token; }
  if (o.auth === "admin") { const t = adminToken.get(); if (t) h.Authorization = "Bearer " + t; }
  if (o.idem) h["Idempotency-Key"] = randId();
  const r = await fetch((o.base ?? API) + path, { method: o.method || (o.body !== undefined ? "POST" : "GET"), headers: h, body: o.body !== undefined ? JSON.stringify(o.body) : undefined, cache: "no-store" });
  const txt = await r.text();
  let j: any = null;
  try { j = txt ? JSON.parse(txt) : null; } catch { j = { raw: txt }; }
  if (!r.ok) throw new ApiError(r.status, j?.error || "error", j);
  return j as T;
}

export function usePoll<T>(fn: () => Promise<T>, ms: number, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try { const d = await fnRef.current(); if (alive) { setData(d); setError(null); } } catch (e: any) { if (alive) setError(e); }
    };
    tick();
    const t = setInterval(tick, ms);
    return () => { alive = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error, reload: async () => { try { setData(await fnRef.current()); } catch (e: any) { setError(e); } } };
}

// ---- per-drop local storage of the user's secret token + signed receipt ----
export type LocalEntry = {
  drop_id: string; token_msg: string; sig?: string; tier: string; idem: string;
  receipt?: { receipt_id: string; arrival_ms: number; server_sig: string; tier: string; replica?: string; sig_ok?: boolean };
  root_at_lock?: string;
};
export const entries = {
  get: (drop: string): LocalEntry | null => { const s = safe.get("fd:entry:" + drop); return s ? JSON.parse(s) : null; },
  set: (e: LocalEntry) => safe.set("fd:entry:" + e.drop_id, JSON.stringify(e)),
  clear: (drop: string) => safe.del("fd:entry:" + drop),
};

export const fmtTime = (ms: number | string) => new Date(typeof ms === "string" ? ms : ms).toLocaleString();
export const money = (c: number) => (c / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
export const seatLabel = (tier: string, seat: number) => `${tier.slice(0, 1).toUpperCase()}-${String(seat).padStart(3, "0")}`;
