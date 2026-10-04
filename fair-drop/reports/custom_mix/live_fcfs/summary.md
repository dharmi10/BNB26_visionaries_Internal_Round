# custom_mix 

Your own test: 1,500 real people plus 15 speed bots, 10 flood bots, 12 retry bots, 35 proxy rotators, 25 sybil operators, 15 api scrapers, 10 ui mimics, 12 crypto swarms, 10 smart scrapers, 10 state snipers, 8 claim snipers.

*policy under test:* **fcfs** &nbsp; *duration:* 121.3s &nbsp; *drop:* `exp-custom_mix-fcfs-4866bd`

## Traffic
- verified identities participating: **1662** (1500 humans, 162 bot identities across 11 operators)
- client requests sent: **4,931**; recorded entry attempts (server): **n/a**
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
| FCFS (live run, real requests against the classic sale) | 500 | 0.200 | 0.097 | **2.052** | 400.0 / 1500 | 0.267 |

*Naive lottery and Fair Drop (expected) are averaged over 200 independent re-draws of the identical entries; FCFS is deterministic given arrival order.*


## Latency (client observed)

| endpoint | requests | rps | p50 | p95 | p99 | 5xx/conn errors | error rate | rejected by design (4xx) |
|---|---|---|---|---|---|---|---|---|
| POST /baseline/{id}/buy | 1759 | 14 | 1 ms | 2 ms | 25 ms | 0 | 0.0000% | 1259 |
| POST /test/login | 1662 | 14 | 2 ms | 4 ms | 23 ms | 0 | 0.0000% | 0 |
| GET /drops/{id} | 1510 | 12 | 1 ms | 1 ms | 22 ms | 0 | 0.0000% | 0 |

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
audit chain valid: **True** (1028702 events)  -> overall: **OK**

Charts: `charts/*.png`; machine-readable: `results.json`, `results.csv`, `latency.csv`.
