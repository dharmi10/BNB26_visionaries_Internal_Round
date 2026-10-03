# custom_mix 

Your own test: 3,000 real people plus no bots.

*policy under test:* **fairdrop** &nbsp; *duration:* 18.4s &nbsp; *drop:* `exp-custom_mix-fairdrop-4866bd`

## Traffic
- verified identities participating: **3000** (3000 humans, 0 bot identities across 0 operators)
- client requests sent: **12,000**; recorded entry attempts (server): **3000**
- assumed identity cost: **$3.0** (explicit, configurable; this shows the *cost* of buying more identities, it does not claim bots are impossible)


## Same traffic, three allocation policies

| policy | seats | bot share of seats | bot share of identities | **bot advantage ratio** | humans won / entered | human win rate |
|---|---|---|---|---|---|---|
| FCFS (actual) | 500 | 0.000 | 0.000 | **n/a** | 500.0 / 3000 | 0.167 |
| Naive lottery (E over draws) | 500 | 0.000 | 0.000 | **n/a** | 500.0 / 3000 | 0.167 |
| Fair Drop (E over draws) | 500 | 0.000 | 0.000 | **n/a** | 500.0 / 3000 | 0.167 |
| Fair Drop (the one actual draw) | 500 | 0.000 | 0.000 | **n/a** | 500.0 / 3000 | 0.167 |
| FCFS (live run, real requests against the classic sale) | 500 | 0.000 | 0.000 | **n/a** | 500.0 / 3000 | 0.167 |

*Naive lottery and Fair Drop (expected) are averaged over 200 independent re-draws of the identical entries; FCFS is deterministic given arrival order.*


## Live FCFS run (same actors replayed against the classic sale)

operators' seats: humans=500

## Latency (client observed)

| endpoint | requests | rps | p50 | p95 | p99 | 5xx/conn errors | error rate | rejected by design (4xx) |
|---|---|---|---|---|---|---|---|---|
| POST /test/login | 3000 | 163 | 41 ms | 336 ms | 546 ms | 0 | 0.0000% | 0 |
| GET /drops/{id} | 3000 | 163 | 20 ms | 175 ms | 258 ms | 0 | 0.0000% | 0 |
| POST /drops/{id}/test-token | 3000 | 163 | 44 ms | 443 ms | 577 ms | 0 | 0.0000% | 0 |
| POST /drops/{id}/register | 3000 | 163 | 14 ms | 285 ms | 432 ms | 0 | 0.0000% | 0 |

## Integrity (must be 0)

```
{
 "broken_merkle": 0,
 "duplicate_entries": 0,
 "duplicate_seats": 0,
 "invalid_transitions": 0,
 "missing_receipts": 2110,
 "oversold": 0
}
```
audit chain valid: **True** (894423 events)  -> overall: **VIOLATIONS**

## Independent verification (Python reference verifier)

- PASS seed commitment: sha256(seed) == published seed_hash
- PASS entry list has unique receipt ids
- PASS merkle root recomputed from entry list == published root
- PASS root equals the root observed when the list was locked (before seed reveal)
- PASS final randomness = H(seed || root || beacon)
- PASS tier gold: winner order + waitlist recomputed from scores
- PASS tier silver: winner order + waitlist recomputed from scores
- PASS tier general: winner order + waitlist recomputed from scores

Charts: `charts/*.png`; machine-readable: `results.json`, `results.csv`, `latency.csv`.
