# custom_mix 

Your own test: 1,500 real people plus 15 speed bots, 10 flood bots, 12 retry bots, 35 proxy rotators, 25 sybil operators, 15 api scrapers, 10 ui mimics, 12 crypto swarms, 10 smart scrapers, 10 state snipers, 8 claim snipers.

*policy under test:* **fairdrop** &nbsp; *duration:* 128.9s &nbsp; *drop:* `exp-custom_mix-fairdrop-4866bd`

## Traffic
- verified identities participating: **1662** (1500 humans, 162 bot identities across 11 operators)
- client requests sent: **16,374**; recorded entry attempts (server): **9218**
- assumed identity cost: **$3.0** (explicit, configurable; this shows the *cost* of buying more identities, it does not claim bots are impossible)

  - operator `lab-speed-bot`: SPEED_BOT, IP pool 20
  - operator `lab-flood-bot`: FLOOD_BOT, IP pool 5
  - operator `lab-retry-bot`: RETRY_BOT, IP pool 20
  - operator `lab-proxy-rotator`: PROXY_ROTATOR, IP pool 2000
  - operator `lab-sybil-operator`: SYBIL_OPERATOR, IP pool 1000
  - operator `lab-api-scraper`: API_SCRAPER, IP pool 5
  - operator `lab-ui-mimic`: UI_MIMIC, IP pool 50
  - operator `lab-crypto-swarm`: CRYPTO_SWARM, IP pool 200
  - operator `lab-smart-scraper`: SMART_SCRAPER, IP pool 2000
  - operator `lab-state-sniper`: STATE_SNIPER, IP pool 20
  - operator `lab-claim-sniper`: CLAIM_SNIPER, IP pool 20

## Same traffic, three allocation policies

| policy | seats | bot share of seats | bot share of identities | **bot advantage ratio** | humans won / entered | human win rate |
|---|---|---|---|---|---|---|
| FCFS (actual) | 500 | 0.200 | 0.097 | **2.052** | 400.0 / 1500 | 0.267 |
| Naive lottery (E over draws) | 500 | 0.193 | 0.097 | **1.980** | 403.5 / 1500 | 0.269 |
| Fair Drop (E over draws) | 500 | 0.068 | 0.097 | **0.695** | 466.1 / 1500 | 0.311 |
| Fair Drop (the one actual draw) | 500 | 0.066 | 0.097 | **0.677** | 467.0 / 1500 | 0.311 |
| FCFS (live run, real requests against the classic sale) | 500 | 0.200 | 0.097 | **2.052** | 400.0 / 1500 | 0.267 |

*Naive lottery and Fair Drop (expected) are averaged over 200 independent re-draws of the identical entries; FCFS is deterministic given arrival order.*

## Seats and cost per seat by operator

| operator | identities | FCFS seats | naive seats (E) | Fair Drop seats (E) | Fair Drop cost/seat |
|---|---|---|---|---|---|
| lab-speed-bot | 15 | 28 | 3.9 | 3.4 | 13.16 |
| lab-sybil-operator | 25 | 22 | 1.4 | 5.8 | 12.83 |
| lab-proxy-rotator | 35 | 14 | 52.3 | 7.9 | 13.28 |
| lab-retry-bot | 12 | 12 | 14.4 | 2.7 | 13.21 |
| lab-flood-bot | 10 | 8 | 22.4 | 2.3 | 13.13 |
| lab-crypto-swarm | 12 | 7 | 0.1 | 2.9 | 12.41 |
| lab-state-sniper | 10 | 5 | 0.2 | 2.2 | 13.45 |
| lab-api-scraper | 15 | 2 | 0.2 | 0.0 | n/a |
| lab-claim-sniper | 8 | 2 | 0.1 | 1.8 | 12.97 |
| lab-smart-scraper | 10 | 0 | 1.4 | 2.5 | 12.12 |
| lab-ui-mimic | 10 | 0 | 0.2 | 2.2 | 13.33 |

## Live FCFS run (same actors replayed against the classic sale)

operators' seats: humans=400, lab-crypto-swarm=24, lab-speed-bot=20, lab-state-sniper=12, lab-sybil-operator=10, lab-proxy-rotator=9, lab-retry-bot=9, lab-api-scraper=4, lab-claim-sniper=4, lab-flood-bot=4, lab-smart-scraper=4, lab-ui-mimic=0

## Latency (client observed)

| endpoint | requests | rps | p50 | p95 | p99 | 5xx/conn errors | error rate | rejected by design (4xx) |
|---|---|---|---|---|---|---|---|---|
| POST /drops/{id}/register | 9218 | 72 | 7 ms | 30 ms | 63 ms | 0 | 0.0000% | 6511 |
| POST /drops/{id}/test-token | 3065 | 24 | 5 ms | 45 ms | 75 ms | 0 | 0.0000% | 1415 |
| GET /drops/{id} | 2103 | 16 | 2 ms | 13 ms | 44 ms | 0 | 0.0000% | 0 |
| POST /test/login | 1662 | 13 | 3 ms | 44 ms | 64 ms | 0 | 0.0000% | 0 |
| GET /healthz (clock sync) | 211 | 2 | 1 ms | 1 ms | 2 ms | 0 | 0.0000% | 0 |
| GET site script (scraper) | 48 | 0 | 11 ms | 36 ms | 45 ms | 0 | 0.0000% | 0 |
| POST /drops/{id}/register-fast | 15 | 0 | 6 ms | 22 ms | 22 ms | 0 | 0.0000% | 0 |
| POST /drops/{id}/token | 12 | 0 | 7 ms | 11 ms | 11 ms | 0 | 0.0000% | 0 |
| POST /drops/{id}/test-link | 12 | 0 | 3 ms | 10 ms | 10 ms | 0 | 0.0000% | 0 |
| GET /drops | 10 | 0 | 4 ms | 73 ms | 73 ms | 0 | 0.0000% | 0 |
| GET /drops/{id}/seats | 10 | 0 | 8 ms | 51 ms | 51 ms | 0 | 0.0000% | 0 |
| GET site page (scraper) | 8 | 0 | 28 ms | 114 ms | 114 ms | 0 | 0.0000% | 0 |

## Integrity (must be 0)

```
{
 "broken_merkle": 0,
 "duplicate_entries": 0,
 "duplicate_seats": 0,
 "invalid_transitions": 0,
 "missing_receipts": 0,
 "oversold": 0
}
```
audit chain valid: **True** (1027565 events)  -> overall: **OK**

## Independent verification (Python reference verifier)

- PASS seed commitment: sha256(seed) == published seed_hash
- PASS entry list has unique receipt ids
- PASS merkle root recomputed from entry list == published root
- PASS root equals the root observed when the list was locked (before seed reveal)
- PASS final randomness = H(seed || root || beacon)
- PASS tier gold: winner order + waitlist recomputed from scores
- PASS tier silver: winner order + waitlist recomputed from scores
- PASS tier general: winner order + waitlist recomputed from scores

## boundary

```
{
 "boundary_violations": 0,
 "all_checks_ran": true,
 "parts": {
  "accepted_outside_window": 0,
  "accepted_after_closed_in_audit": 0,
  "orphan_receipts": 0,
  "sealed_count_mismatch": 0,
  "accepted_but_not_in_sealed_list": 0
 },
 "entries_accepted_by_server": 1647,
 "entries_in_sealed_list": 1647,
 "receipts_clients_were_given": 1647,
 "tokens_issued": 1662,
 "sale_opened_at_ms": 1791063394363,
 "sale_closed_at_ms": 1791063522845,
 "open_flip_vs_announced_ms": 1,
 "close_flip_vs_announced_ms": -17,
 "runner_clock_offset_s": -0.0003948211669921875,
 "runner_clock_uncertainty_s": 0.006760716438293457,
 "runner_clock_synced": true,
 "shots": {
  "sniper_close_http_200": 10,
  "sniper_close_http_409": 10,
  "sniper_close_http_410": 20,
  "sniper_close_in_band": 40,
  "sniper_close_shots": 40,
  "sniper_open_http_200": 5,
  "sniper_open_http_409": 35,
  "sniper_open_in_band": 40,
  "sniper_open_shots": 40
 },
 "note": "shots are counted by the bot's own clock (about +-200 ms around the announced instant); the violations come from the server's records"
}
```

## claim_sniper

```
{
 "sniper_receipts": 8,
 "seats_claimed_by_snipers": 2,
 "still_without_a_seat": 6,
 "requests_sent": 2168,
 "answers": {
  "ok": 2,
  "refused_not_reserved_for_it": 2166
 },
 "seats_claimed_without_entitlement": 0,
 "client_duplicate_seats": 0,
 "server_duplicate_seats": 0,
 "server_oversold": 0,
 "blocked_duplicate_seat_attempts": 0,
 "double_allocated_seats": 0
}
```

## Claims

```
{
 "claimed_by_client": 500,
 "client_forfeits": 66,
 "expired_rejects": 0,
 "other_rejects": 0,
 "server_summary": {
  "claimed": 500,
  "expired": 66,
  "pending": 0,
  "promoted": 66,
  "state": "SETTLED",
  "tiers": [
   {
    "counts": {
     "claimed": 100
    },
    "seats": 100,
    "tier": "gold"
   },
   {
    "counts": {
     "claimed": 150
    },
    "seats": 150,
    "tier": "silver"
   },
   {
    "counts": {
     "claimed": 250
    },
    "seats": 250,
    "tier": "general"
   }
  ],
  "totals": {
   "claimed": 500
  }
 },
 "claim_sniper": {
  "sniper_receipts": 8,
  "seats_claimed_by_snipers": 2,
  "still_without_a_seat": 6,
  "requests_sent": 2168,
  "answers": {
   "ok": 2,
   "refused_not_reserved_for_it": 2166
  },
  "seats_claimed_without_entitlement": 0,
  "client_duplicate_seats": 0,
  "server_duplicate_seats": 0,
  "server_oversold": 0,
  "blocked_duplicate_seat_attempts": 0,
  "double_allocated_seats": 0
 }
}
```

Charts: `charts/*.png`; machine-readable: `results.json`, `results.csv`, `latency.csv`.
