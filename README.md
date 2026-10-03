# Fair Drop — baseline (first-come-first-served)

The **baseline** limited-seat drop platform: seats go to whoever's HTTP request
lands first. There is no queue, no lottery, no rate limit and no bot defence —
that is deliberate. This is the system the bot simulator attacks first, and the
comparison baseline for the fair version that comes later.

What it *does* guarantee is bookkeeping integrity: **one seat per user, and never
an oversell**, enforced by a single Redis Lua script. A `?mode=naive` switch
turns that off so the race can be demonstrated side by side.

```
cmd/server/          process entrypoint, timeouts, graceful shutdown
internal/drop/       domain types and state rules (no I/O)
internal/store/      all Redis access, including the atomic buy script
internal/httpapi/    routes, JWT auth, Prometheus middleware, handlers
web/index.html       operator console, embedded into the binary
```

## Run it

```bash
docker compose up --build
```

Then open <http://localhost:8080>. Two services only: `app` and `redis`.

Without Docker, against any local Redis:

```bash
REDIS_ADDR=localhost:6379 go run ./cmd/server
```

### Configuration

| Env | Default | Notes |
| --- | --- | --- |
| `ADDR` | `:8080` | listen address |
| `REDIS_ADDR` | `localhost:6379` | |
| `REDIS_DB` | `0` | |
| `JWT_SECRET` | `dev-secret-change-me` | change outside the lab |
| `TOKEN_TTL_SEC` | `3600` | |
| `REDIS_POOL_SIZE` | `max(64, NumCPU*32)` | the real hot-path concurrency limit |
| `READ_TIMEOUT_MS` / `WRITE_TIMEOUT_MS` / `IDLE_TIMEOUT_MS` | `5000` / `10000` / `60000` | |

## API

All responses are JSON. These paths are a shared contract with the bot lab —
they do not change.

### `POST /admin/drops`

```bash
curl -s localhost:8080/admin/drops -d '{"seats":500,"window_sec":300}'
```

```json
{"drop_id":"d00001","opens_at":"2026-10-03T12:00:00Z","opens_at_ms":1775217600000,
 "seats":500,"window_sec":300}
```

The drop opens immediately. `opens_at` is RFC3339; `opens_at_ms` is the same
instant in Unix milliseconds, which is what the bot lab schedules against.

### `GET /drops/{id}`

```json
{"drop_id":"d00001","seats":500,"seats_left":500,"state":"open"}
```

`state` is one of `pending`, `open`, `sold_out`, `closed`.

### `POST /auth/otp`

```bash
curl -s localhost:8080/auth/otp -d '{"phone":"+15550100","device_fp":"fp-01"}'
```

```json
{"token":"eyJhbGciOiJIUzI1NiIs...","user_id":"u000001"}
```

Simulated login — **there is no OTP challenge at all**. Presenting a phone
number is the entire login, which is exactly the weakness the bot lab exploits.
Users are created or reused by phone. `phone` and `device_fp` are carried inside
the JWT so the buy path needs no user lookup.

### `POST /baseline/{id}/buy`

```bash
curl -s -X POST localhost:8080/baseline/d00001/buy \
  -H "Authorization: Bearer $TOKEN"
```

| Status | Body |
| --- | --- |
| `200` | `{"seat_no":1}` |
| `409` | `{"error":"already_bought"}` |
| `410` | `{"error":"sold_out"}` — also `closed` / `pending` outside the window |
| `401` | `{"error":"missing_token"}` / `{"error":"invalid_token"}` |
| `404` | `{"error":"drop_not_found"}` |

Add `?mode=naive` for the deliberately broken non-atomic path (see below).

### `GET /drops/{id}/results`

```json
{"seats":500,"sold":500,"oversold":0,
 "buyers":[{"user_id":"u000001","phone":"+15550100","device_fp":"fp-01",
            "seat_no":1,"bought_at_ms":1775217600123}]}
```

Ordered by seat number, which in atomic mode is purchase order. `sold` counts
seats actually handed out rather than reading the allocator, so a naive-mode
oversell shows up here instead of hiding behind a clamped counter.

### `GET /drops/{id}/attempts`

Every buy attempt — won or lost — with client IP, timestamp, mode and outcome,
for the bot lab's traffic analysis.

### `GET /healthz`, `GET /metrics`

`/metrics` is Prometheus text format:

- `fairdrop_http_requests_total{endpoint,method,status}`
- `fairdrop_http_request_duration_seconds{endpoint,method}` (histogram)
- `fairdrop_http_inflight_requests`

`endpoint` is the chi route *pattern*, not the raw path, so `/drops/d00001` and
`/drops/d00002` share one low-cardinality series.

## How the atomic path works

`internal/store/store.go` holds the script. Redis runs a script to completion
with nothing interleaved, so this read-check-write is one atomic step:

```lua
local existing = redis.call('HGET', KEYS[1], user_id)   -- already holds a seat?
if existing then return {1, tonumber(existing)} end

local seat = redis.call('INCR', KEYS[2])                -- claim a seat number
if seat > capacity then
  redis.call('DECR', KEYS[2])                           -- roll back; stay at capacity
  return {2, 0}
end

redis.call('HSET', KEYS[1], user_id, seat)              -- commit
redis.call('HSET', KEYS[3], user_id, meta)
return {0, seat}
```

One round trip per buy. The seat counter is the allocator, and because losing
attempts roll it back, it settles at exactly `capacity` rather than drifting
upward with every rejected request.

### Keys

| Key | Type | Contents |
| --- | --- | --- |
| `drop:{id}` | hash | `seats`, `window_sec`, `opens_at_ms`, `closes_at_ms` |
| `drop:{id}:sold` | string | seat allocator (`INCR`) |
| `drop:{id}:seats` | hash | `user_id` → `seat_no` |
| `drop:{id}:meta` | hash | `user_id` → `bought_at_ms\|phone\|device_fp` |
| `drop:{id}:attempts` | list | one record per buy attempt |
| `user:phone:{phone}` | string | `user_id` |
| `user:{user_id}` | hash | `phone`, `device_fp`, `last_seen_ms` |

### Demonstrating the oversell

`?mode=naive` runs the same three operations as three separate round trips.
Concurrent buyers all read the same stale count, all claim the same seat number
and all write it back. With 2,000 buyers against 500 seats it does not oversell
by a little — every single request wins:

```
naive mode: 200s=2000  sold=2000  seats=500  OVERSOLD=1500
```

## Tests

```bash
go test ./... -count=1 -v
```

`TestAtomicBuyNeverOversells` releases 2,000 concurrent buys at a 500-seat drop
from a single barrier and asserts exactly 500 sold, 0 oversold, 0 duplicate
users, seat numbers forming a clean `1..500` permutation, and 2,000 logged
attempts. `TestNaiveModeOversells` is the control case.

The tests run against [miniredis](https://github.com/alicebob/miniredis) in
process — including the Lua script — so `go test ./...` needs no Redis and no
Docker.

Each of the 2,000 shoppers gets its own HTTP client with a pre-established
keep-alive connection. Without that warm-up, 2,000 simultaneous TCP handshakes
overrun the listener's accept backlog and the test measures the operating system
instead of the seat allocator.

> On Windows, `go test -race` needs a 64-bit gcc for cgo; without one the race
> detector is unavailable and the plain `go test` run above is the one to use.

## Deliberate baseline weaknesses

Not bugs — the attack surface the bot lab is meant to find:

- **No real OTP.** A phone number is the whole login, so identities are free.
- **No rate limiting** on `/auth/otp` or `/baseline/{id}/buy`.
- **`device_fp` is self-reported** and never checked for reuse across accounts.
- **Proxy headers are trusted**, so `X-Forwarded-For` lets a client choose the
  IP that lands in the attempt log.
- **First-come-first-served**, which rewards whoever is closest and fastest.

The fair version addresses these; the attempt log and `/results` are what make
the before-and-after measurable.
