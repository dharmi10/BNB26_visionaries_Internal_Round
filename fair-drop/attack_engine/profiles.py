"""Bot / human behaviour profiles. Each profile has a Fair Drop flow and an FCFS flow, so the very same actors can
be replayed against either policy. Bots are NOT written to lose: they are fast, persistent, and (where the profile
says so) rotate IPs freely.

  HUMAN          realistic delays, one attempt, polite retries
  SPEED_BOT      fires the instant the window opens, no think time, hammers retries
  FLOOD_BOT      one identity, hundreds of rapid mixed requests (token, register, browse)
  RETRY_BOT      repeats register with the same idempotency key, also races duplicates concurrently
  PROXY_ROTATOR  few identities, a fresh IP on every request (thousands of IPs)
  SYBIL_OPERATOR many verified identities, each doing a competent fast flow behind a big IP pool
  API_SCRAPER    naive: finds the hidden 'fast' endpoint and uses it (tarpit); never speaks the real flow
  UI_MIMIC       drives the real flow with browser-like page loads and human-ish pacing
"""
from __future__ import annotations
import random
import uuid
from dataclasses import dataclass
from typing import Callable, Dict, Optional

import gevent


@dataclass
class Ctx:
    c: object            # FDClient
    actor: dict          # plan entry
    op: object           # Operator or None (humans)
    p: dict              # profile params
    rng: random.Random
    rec: object          # Recorder
    tier: str

    def ip_any(self) -> str:
        return self.op.ip(self.rng.randrange(max(1, self.op.ip_pool))) if self.op else self.c.ip

    def think(self, lo: float, hi: float):
        gevent.sleep(self.rng.uniform(lo, hi))

    def ev(self, name: str):
        self.rec.events[name] += 1


RETRYABLE = (0, 429, 502, 503, 504)


def retry(ctx: Ctx, fn: Callable, tries: int, lo: float, hi: float, ok=(200,)):
    code, data = 0, None
    for i in range(tries):
        code, data = fn()
        if code in ok or code not in RETRYABLE:
            break
        ctx.ev(f"retry_{code}")
        gevent.sleep(ctx.rng.uniform(lo, hi) * (1 + i * 0.25))
    return code, data


def keep(ctx: Ctx, tok: dict, resp: dict):
    ctx.rec.tokens.append({"uid": ctx.actor["uid"], "kind": ctx.actor["kind"], "op": ctx.actor["op"], "profile": ctx.actor["profile"],
                           "token_msg": tok["token_msg"], "sig": tok["sig"], "tier": tok["tier"], "receipt_id": resp["receipt_id"],
                           "arrival_ms": resp.get("arrival_ms")})


def _login(ctx, tries=6, lo=0.3, hi=1.0) -> bool:
    code, _ = retry(ctx, ctx.c.login, tries, lo, hi)
    if code != 200:
        ctx.ev(f"login_failed_{code}")
    return code == 200


def _token(ctx, tries=6, lo=0.3, hi=1.2, ip=None):
    code, d = retry(ctx, lambda: ctx.c.test_token(ctx.tier, ip=ip), tries, lo, hi)
    if code != 200:
        ctx.ev(f"token_failed_{code}")
        return None
    return d


def _register(ctx, tok, tries=6, lo=0.3, hi=1.2, idem=None, ip=None, fast=False):
    idem = idem or uuid.uuid4().hex
    code, d = retry(ctx, lambda: ctx.c.register(tok, idem=idem, ip=ip, fast=fast), tries, lo, hi)
    if code == 200 and not fast:
        keep(ctx, tok, d)
    elif code != 200:
        ctx.ev(f"register_failed_{code}")
    return code, d


# ----------------------------------------------------------------- Fair Drop flows

def human(ctx: Ctx):
    if not _login(ctx):
        return
    ctx.c.browse(); ctx.think(0.4, 2.0)
    tok = _token(ctx, tries=6, lo=0.5, hi=2.0)
    if not tok:
        return
    ctx.think(0.2, 1.2)
    _register(ctx, tok, tries=6, lo=0.5, hi=2.0)


def speed_bot(ctx: Ctx):
    if not _login(ctx, tries=30, lo=0.02, hi=0.1):
        return
    tok = _token(ctx, tries=60, lo=0.02, hi=0.1, ip=ctx.ip_any())
    if not tok:
        return
    idem = uuid.uuid4().hex
    code, _ = _register(ctx, tok, tries=60, lo=0.02, hi=0.1, idem=idem, ip=ctx.ip_any())
    for _ in range(int(ctx.p.get("requests", 20))):       # hammer: more requests = more chances (in a naive lottery)
        ctx.c.register(tok, idem=uuid.uuid4().hex, ip=ctx.ip_any())


def flood_bot(ctx: Ctx):
    if not _login(ctx, tries=30, lo=0.02, hi=0.1):
        return
    tok = _token(ctx, tries=60, lo=0.02, hi=0.1, ip=ctx.ip_any())
    if tok:
        _register(ctx, tok, tries=60, lo=0.02, hi=0.1, ip=ctx.ip_any())
    for i in range(int(ctx.p.get("requests", 300))):
        ip = ctx.ip_any() if i % 5 == 0 else None
        r = ctx.rng.random()
        if tok and r < 0.6:
            ctx.c.register(tok, idem=uuid.uuid4().hex, ip=ip)
        elif r < 0.8:
            ctx.c.test_token(ctx.tier, ip=ip)
        else:
            ctx.c.browse()


def retry_bot(ctx: Ctx):
    if not _login(ctx, tries=30, lo=0.02, hi=0.1):
        return
    tok = _token(ctx, tries=60, lo=0.02, hi=0.1, ip=ctx.ip_any())
    if not tok:
        return
    idem = uuid.uuid4().hex
    first, resp = _register(ctx, tok, tries=60, lo=0.02, hi=0.1, idem=idem, ip=ctx.ip_any())
    for _ in range(int(ctx.p.get("retries", 30))):
        # simulate "timeout, retry" + racing duplicates (the idempotency / spent-token set must collapse them)
        gs = [gevent.spawn(ctx.c.register, tok, idem, ctx.ip_any()) for _ in range(3)]
        gevent.joinall(gs, timeout=10)
        ctx.c.test_token(ctx.tier)            # and retries the token request too (409 already_issued)
        gevent.sleep(ctx.rng.uniform(0, 0.05))


def proxy_rotator(ctx: Ctx):
    if not _login(ctx, tries=30, lo=0.02, hi=0.1):
        return
    tok = _token(ctx, tries=60, lo=0.02, hi=0.1, ip=ctx.ip_any())
    if not tok:
        return
    first = True
    for _ in range(int(ctx.p.get("requests", 120))):    # a brand-new IP every single request: never rate limited
        code, d = ctx.c.register(tok, idem=uuid.uuid4().hex, ip=ctx.ip_any())
        if code == 200 and first:
            keep(ctx, tok, d); first = False
        if ctx.rng.random() < 0.1:
            ctx.c.test_token(ctx.tier, ip=ctx.ip_any())  # also tries to mint more tokens from other IPs


def sybil_operator(ctx: Ctx):
    if not _login(ctx, tries=30, lo=0.02, hi=0.2):
        return
    tok = _token(ctx, tries=60, lo=0.02, hi=0.2, ip=ctx.ip_any())
    if not tok:
        return
    _register(ctx, tok, tries=60, lo=0.02, hi=0.2, ip=ctx.ip_any())
    for _ in range(int(ctx.p.get("requests", 3))):
        ctx.c.register(tok, idem=uuid.uuid4().hex, ip=ctx.ip_any())


def api_scraper(ctx: Ctx):
    """Naive scraper: read the 'API', found the faster-looking endpoint, used it. Honest limit: only catches bots that bite."""
    if not _login(ctx, tries=30, lo=0.02, hi=0.1):
        return
    tok = _token(ctx, tries=60, lo=0.02, hi=0.1, ip=ctx.ip_any())
    if not tok:
        return
    code, d = ctx.c.register(tok, idem=uuid.uuid4().hex, ip=ctx.ip_any(), fast=True)
    if code == 200:
        ctx.ev("tarpit_receipt")                   # bot believes it is in
    elif ctx.p.get("fallback", 0):
        _register(ctx, tok, tries=20, lo=0.05, hi=0.2, ip=ctx.ip_any())


def ui_mimic(ctx: Ctx):
    """Drives only the documented UI flow with browser-like page loads and human-ish pacing."""
    if not _login(ctx, tries=10, lo=0.3, hi=1.0):
        return
    ctx.c.req("GET", "/drops", "GET /drops", auth=False); ctx.think(0.3, 1.0)
    ctx.c.browse(); ctx.think(0.3, 1.0)
    ctx.c.req("GET", f"/drops/{ctx.c.drop}/seats", "GET /drops/{id}/seats", auth=False); ctx.think(0.5, 1.5)
    tok = _token(ctx, tries=10, lo=0.3, hi=1.0)
    if not tok:
        return
    ctx.think(0.3, 1.2)
    _register(ctx, tok, tries=10, lo=0.3, hi=1.0)


# ----------------------------------------------------------------- FCFS flows (same actors, classic sale)

def _buy_loop(ctx: Ctx, attempts: int, rotate: bool, lo: float, hi: float):
    got = 0
    for i in range(attempts):
        code, d = ctx.c.buy(ctx.tier, ip=ctx.ip_any() if rotate else None)
        if code == 200:
            got += 1; ctx.rec.tokens.append({"uid": ctx.actor["uid"], "kind": ctx.actor["kind"], "op": ctx.actor["op"], "seat_no": d["seat_no"], "tier": ctx.tier})
        elif code == 409 and d and d.get("error") in ("limit_reached", "sold_out"):
            break
        elif code == 410:
            break
        if hi > 0:
            gevent.sleep(ctx.rng.uniform(lo, hi))
    return got


def fcfs_human(ctx: Ctx):
    if not _login(ctx, tries=6, lo=0.3, hi=1.0):
        return
    ctx.c.browse(); ctx.think(0.4, 2.0)
    for _ in range(6):                      # a human clicks "buy" a few times if the page is slow
        code, d = ctx.c.buy(ctx.tier)
        if code == 200:
            ctx.rec.tokens.append({"uid": ctx.actor["uid"], "kind": "human", "op": ctx.actor["op"], "seat_no": d["seat_no"], "tier": ctx.tier}); break
        if code in (409, 410):
            break
        gevent.sleep(ctx.rng.uniform(0.5, 2.0))


def fcfs_bot(rotate: bool, default_attempts: int):
    def run(ctx: Ctx):
        if not _login(ctx, tries=30, lo=0.02, hi=0.1):
            return
        _buy_loop(ctx, int(ctx.p.get("requests", default_attempts)), rotate, 0.0, 0.0)
    return run


def fcfs_ui_mimic(ctx: Ctx):
    if not _login(ctx, tries=10, lo=0.3, hi=1.0):
        return
    ctx.c.browse(); ctx.think(0.3, 1.0)
    _buy_loop(ctx, 10, False, 0.5, 1.5)


@dataclass
class Profile:
    fd: Callable
    fcfs: Callable
    defaults: Dict[str, float]
    kind: str = "bot"
    ip_pool: int = 20


PROFILES: Dict[str, Profile] = {
    "HUMAN": Profile(human, fcfs_human, {}, "human", 1),
    "SPEED_BOT": Profile(speed_bot, fcfs_bot(True, 200), {"requests": 20}, "bot", 20),
    "FLOOD_BOT": Profile(flood_bot, fcfs_bot(False, 400), {"requests": 300}, "bot", 5),
    "RETRY_BOT": Profile(retry_bot, fcfs_bot(True, 100), {"retries": 30}, "bot", 20),
    "PROXY_ROTATOR": Profile(proxy_rotator, fcfs_bot(True, 400), {"requests": 120}, "bot", 2000),
    "SYBIL_OPERATOR": Profile(sybil_operator, fcfs_bot(True, 60), {"requests": 3}, "bot", 1000),
    "API_SCRAPER": Profile(api_scraper, fcfs_bot(False, 100), {"fallback": 0}, "bot", 5),
    "UI_MIMIC": Profile(ui_mimic, fcfs_ui_mimic, {}, "bot", 50),
}
