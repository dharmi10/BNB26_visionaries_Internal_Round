# Demo runbook (4 minutes)

Prereq: `scripts/start.sh` (or `.ps1`), `scripts/seed.sh` once. Open `http://localhost:8088`, admin at `/admin` (`admin` / `admin-demo-pass`), Grafana `http://localhost:3001` (anonymous viewer). Test key: `test-key-demo`.

**Quick path (the best 4 minutes):** open `/admin` → **Control Room**.
1. *Start bot attack* (pick a crowd size). Blue dots are people, orange dots are bots. At the gate each turns green (in), red (turned away, with the reason popped up) or purple (decoy trap).
2. Scroll to **How it works**: the 6 steps a real person goes through, and the 7 rules with live "stopped" counts and which bot types each rule caught.
3. **The bots** table: each bot type, what it tried, what it got versus what we expected (✔ as expected).
4. **Is protection right?** scorecard: an independent judge re-checked every decision (people wrongly stopped should be 0).
5. **Old way vs new way** bars: the same crowd under first-come-first-served.
6. Open **Bot Lab**, pick your own mix of bots (or a preset such as *Heavy attack*), *Run this test*.
7. **Try to break it**: the red-team tricks and which ones held.
Also `/story` has a 3D scroll explanation.

**0:00 FCFS under attack.** Admin → Test tools → *Run an experiment*: `exp2`, scale 0.1, tick *also run live FCFS*. Open `reports/exp2_proxy_flood/summary.md`: in the live FCFS row bots (4% of identities) took ~20% of seats (advantage ≈ 5×). Show `live_fcfs` sold-out within seconds.

**1:00 Same traffic, Fair Drop.** Same table: Fair Drop row ≈ 1× (bots hold their identity share), human win rate comparable or better than FCFS and naive lottery. *Counterfactual* = same recorded attempts, three policies. Show the Fairness tab (Detailed results) chart.

**2:00 Cryptographic proof.** Open an event page → *Enter* → status page shows receipt + Merkle proof; `/verify` goes green after lock; run the reference verifier: `python verifier/verify.py --url http://localhost:8088/api --drop <id> --receipt <receipt>`. Show Admin → Audit → **Verify chain** (green), then *edit a stored event* → red at the exact event, *repair*.

**3:00 Kill a replica.** Run exp6 or `scripts/kill_replica.sh 2` while Live monitor is open: replica goes DOWN, traffic continues via failover, comes back, integrity panel stays all zero.

**3:30 Malicious server.** Test tools → Malicious demo (or `scripts/run_malicious_demo.sh`): server drops one entry at lock. Open that fan's verify page: **red banner**, proof fails; Admin → Audit shows `missing_receipts > 0`.

Reset between runs: Test tools → *Reset selected drop* (keeps users) or `scripts/reset.sh` (wipes everything).
