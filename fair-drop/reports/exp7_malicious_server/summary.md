# exp7_malicious_server 

Experiment 7 - malicious server: it silently drops one entry; that fan's verify page must turn red with proof.

*policy under test:* **fairdrop** &nbsp; *duration:* 23.3s &nbsp; *drop:* `exp-exp7_malicious_server-fairdrop-4866bd`

## Traffic
- verified identities participating: **300** (300 humans, 0 bot identities across 0 operators)
- client requests sent: **1,200**; recorded entry attempts (server): **300**
- assumed identity cost: **$3.0** (explicit, configurable; this shows the *cost* of buying more identities, it does not claim bots are impossible)


## Same traffic, three allocation policies

| policy | seats | bot share of seats | bot share of identities | **bot advantage ratio** | humans won / entered | human win rate |
|---|---|---|---|---|---|---|
| FCFS (actual) | 300 | 0.000 | 0.000 | **n/a** | 300.0 / 300 | 1.000 |
| Naive lottery (E over draws) | 300 | 0.000 | 0.000 | **n/a** | 300.0 / 300 | 1.000 |
| Fair Drop (E over draws) | 299 | 0.000 | 0.000 | **n/a** | 299.0 / 300 | 0.997 |
| Fair Drop (the one actual draw) | 299 | 0.000 | 0.000 | **n/a** | 299.0 / 300 | 0.997 |

*Naive lottery and Fair Drop (expected) are averaged over 200 independent re-draws of the identical entries; FCFS is deterministic given arrival order.*


## Latency (client observed)

| endpoint | requests | rps | p50 | p95 | p99 | 5xx/conn errors | error rate | rejected by design (4xx) |
|---|---|---|---|---|---|---|---|---|
| POST /test/login | 300 | 13 | 11 ms | 79 ms | 104 ms | 0 | 0.0000% | 0 |
| GET /drops/{id} | 300 | 13 | 4 ms | 32 ms | 69 ms | 0 | 0.0000% | 0 |
| POST /drops/{id}/test-token | 300 | 13 | 26 ms | 66 ms | 105 ms | 0 | 0.0000% | 0 |
| POST /drops/{id}/register | 300 | 13 | 6 ms | 17 ms | 30 ms | 0 | 0.0000% | 0 |

## Integrity (must be 0)

```
{
 "broken_merkle": 0,
 "duplicate_entries": 0,
 "duplicate_seats": 0,
 "invalid_transitions": 0,
 "missing_receipts": 1,
 "oversold": 0
}
```
audit chain valid: **True** (607 events)  -> overall: **VIOLATIONS**

## Independent verification (Python reference verifier)

- PASS seed commitment: sha256(seed) == published seed_hash
- PASS entry list has unique receipt ids
- PASS merkle root recomputed from entry list == published root
- PASS root equals the root observed when the list was locked (before seed reveal)
- PASS final randomness = H(seed || root || beacon)
- PASS tier gold: winner order + waitlist recomputed from scores
- PASS tier silver: winner order + waitlist recomputed from scores
- PASS tier general: winner order + waitlist recomputed from scores
- FAIL YOUR RECEIPT IS IN THE LOCKED LIST

## malicious_target

```
{
 "receipt_id": "7e9dcaaac122358aeafd3e95e50fdf561f61b3fae1484517ba6b142f06e2f239",
 "uid": "t_035906"
}
```

## malicious

```
{
 "victim_proof_status": 404,
 "victim_sees": "not_included",
 "control_proof_status": 200,
 "reference_verifier_flags_victim": true,
 "integrity_missing_receipts": 1,
 "detected": true
}
```

Charts: `charts/*.png`; machine-readable: `results.json`, `results.csv`, `latency.csv`.
