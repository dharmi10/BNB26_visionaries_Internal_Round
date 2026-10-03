# show_bot_zoo 

Live show: real people plus every kind of bot (about 4% of the crowd): speed bots, flooders, retry-spammers, address-hoppers, an identity farm, shortcut seekers and human mimics.

*policy under test:* **fcfs** &nbsp; *duration:* 17.2s &nbsp; *drop:* `exp-show_bot_zoo-fcfs-4866bd`

## Traffic
- verified identities participating: **2500** (2400 humans, 100 bot identities across 7 operators)
- client requests sent: **7,509**; recorded entry attempts (server): **n/a**
- assumed identity cost: **$3.0** (explicit, configurable; this shows the *cost* of buying more identities, it does not claim bots are impossible)

  - operator `speed`: SPEED_BOT, IP pool 20
  - operator `flood`: FLOOD_BOT, IP pool 5
  - operator `retry`: RETRY_BOT, IP pool 20
  - operator `hopper`: PROXY_ROTATOR, IP pool 2000
  - operator `farm`: SYBIL_OPERATOR, IP pool 1000
  - operator `scraper`: API_SCRAPER, IP pool 5
  - operator `mimic`: UI_MIMIC, IP pool 50

## Same traffic, three allocation policies

| policy | seats | bot share of seats | bot share of identities | **bot advantage ratio** | humans won / entered | human win rate |
|---|---|---|---|---|---|---|
| FCFS (live run, real requests against the classic sale) | 500 | 0.200 | 0.040 | **5.000** | 400.0 / 2400 | 0.167 |

*Naive lottery and Fair Drop (expected) are averaged over 200 independent re-draws of the identical entries; FCFS is deterministic given arrival order.*


## Latency (client observed)

| endpoint | requests | rps | p50 | p95 | p99 | 5xx/conn errors | error rate | rejected by design (4xx) |
|---|---|---|---|---|---|---|---|---|
| POST /baseline/{id}/buy | 2599 | 151 | 3 ms | 26 ms | 55 ms | 0 | 0.0000% | 2099 |
| POST /test/login | 2500 | 145 | 4 ms | 53 ms | 81 ms | 0 | 0.0000% | 0 |
| GET /drops/{id} | 2410 | 140 | 2 ms | 21 ms | 38 ms | 0 | 0.0000% | 0 |

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
audit chain valid: **True** (809280 events)  -> overall: **OK**

Charts: `charts/*.png`; machine-readable: `results.json`, `results.csv`, `latency.csv`.
