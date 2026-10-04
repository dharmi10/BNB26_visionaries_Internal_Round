# Fair Drop demo readiness

Branch `demo-ready`. Status as of 2026-10-04. Sorted as **working** (verified in a result file or by a test that actually ran), **broken** (a verified defect or missing result), and **unverified** (code exists but was not exercised here).

**Environment this session:** Docker Desktop was not running, so no live stack was started or tested. Nothing in this file was re-run live; live statements come from result files already on disk (`reports/`). Host services were not touched.

## Working

| Area | Evidence |
|---|---|
| Exp2 proxy flood, 10,000 identities (Fair Drop vs FCFS) | `reports/exp2_proxy_flood/summary.md`. FCFS bot advantage 9.9 modelled, 9.2 live. Fair Drop 0.92 expected, 0.60 one draw. |
| Exp4 one human among bots | `reports/exp4_one_human/summary.md`, committed in `3183854`. 1 human, 20 bot identities, 5 operators, 10 seats. FCFS: bots take 10/10. Fair Drop expected human win rate 0.465; the actual draw gave the human a seat. |
| Exp6 kill replica (api-2 killed mid-window) | `reports/exp6_kill_replica/summary.md`. 20,000 acknowledged receipts, 0 missing from the Merkle tree (client error count not checked). Existing run; not re-run this session. |
| 50,000-entry lock and draw timing test | Committed in `4655029`. Skips without a Redis stack (`no REDIS_ADDR`). Only the skip was observed here. |
| Live counters for bot visibility (code path) | Read, not run: rate limiting (`guard.go` → `rate_limited` in the live hash), reused-token rejection (`lua.go` → `rejected_reused`), tarpit hits (`lua.go` → `tarpit_hits`). `LiveTab.tsx` displays all three. |

## Broken

1. **Exp7 malicious server: the server's own audit does not see the dropped receipt.**
   - Evidence: `reports/exp7_malicious_server/summary.md`, committed in `2676019`. Victim proof returns 404 `not_included`; the reference verifier fails (`reference_verifier_flags_victim: true`); but `integrity_missing_receipts: 0` and `detected: false`.
   - The runbook (`docs/DEMO_RUNBOOK.md`, step 3:30) says Admin → Audit shows `missing_receipts > 0`. That is false for the last run.
   - Where to look: `backend/internal/app/ledger.go` (~lines 288–318) counts `entry_registered` audit rows missing from the tree. The victim's audit row either is not written, or its `receipt_id` in the payload does not match the tree key. Not confirmed; needs a live run with Postgres to check the audit rows for the victim receipt.
   - Demo impact: the malicious demo still proves misconduct to a client (404 plus verifier failure). Do not claim the server's own audit catches it.
   - Fix not made: changing the `detected` definition to make it read true would hide the gap. Left as is.

2. **Runbook numbers are stale.** `docs/DEMO_RUNBOOK.md` (0:00) says bots take about 20% of seats at about 5× advantage. The 10k run gives 19.8% and 9.9× modelled, 9.2× live. `DEMO_SCRIPT.md` uses the current numbers; the runbook has not been updated.

## Unverified

| Item | Why unverified | What would settle it |
|---|---|---|
| Kill-replica live re-run (roadmap step 3) | Docker not running. The existing exp6 result is from an earlier run. | `scripts/start.sh`, then `scripts/kill_replica.sh 2` with Live monitor open, or `docker compose exec -T attack python -m attack_engine run exp6`. |
| 50,000-entry lock and draw timing | The test skips without Redis; no run has passed here. | `scripts/test.sh` with the stack up, then check the logged lock and draw timings. |
| Bot visibility live (roadmap step 5) | Only the code path was read. The live counters and the web traffic table were not seen on screen. | Run an exp2 or exp4 scenario with the Live Arena open; confirm 429s, rejected reused tokens and tarpit hits increment. |
| Malicious demo from the UI (Test tools → Malicious demo) | Only the script path was read. | `scripts/run_malicious_demo.sh`, then open the victim's verify page. |
| Exp4 and exp7 live FCFS rows match the modelled rows | Reports exist; not compared against a fresh run. | Compare `live_fcfs/summary.md` with the modelled table after a re-run. |

## Not in git (left out on purpose)

- Uncommitted regenerated results in `reports/exp2_proxy_flood/` (the 10k run output). Not committed in this pass because the roadmap did not list them.
- `AUDIT_REPORT.md`, `testdata/`, `web/.env.local`, `web/.next/`, `web/node_modules/`, `web/next-env.d.ts`, `web/tsconfig.tsbuildinfo`: untracked. `web/.env.local` may contain local secrets; do not commit it.
- `*.tokens.json` under `reports/` are git-ignored on purpose.

## Roadmap status

| # | Item | Status |
|---|---|---|
| 1 | exp4 one human among bots | Done. Report committed in `3183854`. |
| 2 | exp7 malicious-server toggle | Toggle exists and runs. Committed in `2676019`. Broken: server audit does not flag the drop (see above). |
| 3 | Kill-replica test | Existing exp6 result is valid. No new live run (Docker down). |
| 4 | 50,000-entry lock and draw timing | Committed earlier in `4655029`. Unverified: skips without Redis. |
| 5 | Bot visibility check | Code path verified by reading. Not checked live. |
| 6 | DEMO_SCRIPT.md and DEMO_READINESS.md | Written (this file and `DEMO_SCRIPT.md`). |
