# Fair Drop demo script (about 5 minutes)

Companion to `docs/DEMO_RUNBOOK.md` (full detail). This is the order to talk through things on stage. Status of each step is in `DEMO_READINESS.md`.

## Before the audience arrives

1. Start Docker Desktop, then from `fair-drop/`: `scripts/start.sh` (or `scripts/start.ps1`). Wait for it to print the URLs.
2. Seed once if the database is empty: `scripts/seed.sh` (50,000 synthetic verified users, no SMS).
3. Open these in advance:
   - Fair Drop gateway: `http://localhost:8088`
   - Admin: `http://localhost:8088/admin` (user `admin`, password `admin-demo-pass`), tab **Live Arena**
   - Live screen: `http://localhost:8088/live` (put it on the second monitor)
   - Grafana: `http://localhost:3001` (anonymous viewer)
4. Check the reports exist: `reports/exp2_proxy_flood/summary.md`, `reports/exp4_one_human/summary.md`, `reports/exp6_kill_replica/summary.md`, `reports/exp7_malicious_server/summary.md`.
5. Reset any drop left from rehearsal: Admin → Test tools → *Reset selected drop*, or `scripts/reset.sh` for a full wipe.

## 0:00 The problem: first come, first served favours bots

- Say: a sale of 500 seats; bots use many identities and many IPs and retry constantly.
- Show `reports/exp2_proxy_flood/summary.md`, 10,000 identities (9,800 humans, 200 bot identities across 20 operators).
- The FCFS row: bots hold **2%** of identities and take **19.8%** of seats. Bot advantage ratio **9.9** modelled, **9.2** in the live FCFS run.
- Show the `live_fcfs` run: the classic sale sells out in seconds.

## 1:00 Same crowd, Fair Drop

- Same table, Fair Drop row: bot share of seats **1.8%** (expected) and **1.2%** (the actual draw). Advantage ratio **0.92** expected, **0.60** for the actual draw.
- Human win rate **5.0%** against **4.2%** for FCFS.
- Say what it is not: a counterfactual, the same recorded attempts scored under three policies.

## 1:45 One human among bots (the worst case for the human)

- Show `reports/exp4_one_human/summary.md`: 1 human, 20 bot identities, 5 operators, 10 seats.
- FCFS: the bots take all 10 seats and the human gets none.
- Fair Drop's one actual draw: the human won a seat. The expected human win rate is **46.5%**, so it is a lottery, not a guarantee. Say that out loud.
- Assumed identity cost is $3 per identity. This shows what buying identities costs the attacker; it does not claim bots are impossible.

## 2:30 Cryptographic proof

- Open an event page → **Enter**. The status page shows the receipt and its Merkle proof.
- Open `/verify`: green after the lock.
- Run the reference verifier: `python verifier/verify.py --url http://localhost:8088/api --drop <id> --receipt <receipt>`.
- Admin → Audit → **Verify chain**: green. Then edit a stored event: it turns red at that exact event. Then **repair**.

## 3:15 Kill a replica

- Keep the Live monitor open. Run `scripts/kill_replica.sh 2`.
- The replica goes DOWN, traffic carries on through failover, the replica comes back.
- Integrity panel stays at zero. The research run (exp6) acknowledged 20,000 receipts and found 0 missing from the tree.

## 3:45 Malicious server

- Admin → Test tools → Malicious demo, or `scripts/run_malicious_demo.sh`. The server silently drops one entry at lock.
- Open that fan's verify page. The proof for the dropped receipt returns 404 `not_included`; the reference verifier fails on it.
- **Known gap, say it honestly if asked:** the server's own integrity counter (`missing_receipts`) reported 0 in the last run, so Admin → Audit does not show the drop. See `DEMO_READINESS.md`. Do not promise a red Audit panel until it is fixed.

## 4:15 Bots, visible live

- Live Arena → the bots card and the real web traffic table: filter by bot kind, or *Only refused / errors*.
- Point out, as they appear: rate-limited requests (429), rejected reused tokens, and tarpit hits (decoy endpoint, purple on the gate).
- The gate: blue dot is a person, orange is a bot; green is in, red is turned away, purple is a decoy trap.

## 5:00 Close

- Fair Drop does not stop bots from buying identities. It makes each identity worth one ticket, proves the draw, and lets anyone check the list.
- Hand over to `/story` (3D scroll explanation) or Grafana if there is time.

## After the demo

- Reset: Admin → Test tools → *Reset selected drop*, or `scripts/reset.sh`.
- Don't re-run exp2 on stage; it takes about 90 seconds of traffic plus scoring.
