# custom_mix 

Your own test: 3,000 real people plus no bots.

*policy under test:* **fcfs** &nbsp; *duration:* 17.2s &nbsp; *drop:* `exp-custom_mix-fcfs-4866bd`

## Traffic
- verified identities participating: **3000** (3000 humans, 0 bot identities across 0 operators)
- client requests sent: **9,000**; recorded entry attempts (server): **n/a**
- assumed identity cost: **$3.0** (explicit, configurable; this shows the *cost* of buying more identities, it does not claim bots are impossible)


## Same traffic, three allocation policies

| policy | seats | bot share of seats | bot share of identities | **bot advantage ratio** | humans won / entered | human win rate |
|---|---|---|---|---|---|---|
| FCFS (live run, real requests against the classic sale) | 500 | 0.000 | 0.000 | **n/a** | 500.0 / 3000 | 0.167 |

*Naive lottery and Fair Drop (expected) are averaged over 200 independent re-draws of the identical entries; FCFS is deterministic given arrival order.*


## Latency (client observed)

| endpoint | requests | rps | p50 | p95 | p99 | 5xx/conn errors | error rate | rejected by design (4xx) |
|---|---|---|---|---|---|---|---|---|
| POST /test/login | 3000 | 174 | 4 ms | 38 ms | 68 ms | 0 | 0.0000% | 0 |
| GET /drops/{id} | 3000 | 174 | 2 ms | 19 ms | 37 ms | 0 | 0.0000% | 0 |
| POST /baseline/{id}/buy | 3000 | 174 | 3 ms | 41 ms | 126 ms | 0 | 0.0000% | 2500 |

## Integrity (must be 0)

```
{
 "broken_merkle": 0,
 "duplicate_entries": 0,
 "duplicate_seats": 0,
 "invalid_transitions": 0,
 "missing_receipts": null,
 "oversold": 0
}
```
audit chain valid: **True** (894928 events)  -> overall: **OK**

Charts: `charts/*.png`; machine-readable: `results.json`, `results.csv`, `latency.csv`.
