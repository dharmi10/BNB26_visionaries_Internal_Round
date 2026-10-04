# Fair Drop demo readiness

Branch `demo-ready`. Updated 2026-10-04 after a live pass with Docker running.

Status labels: **working** (checked in this session, or in a result file from this session), **broken** (a verified defect), **unverified** (not checked, or checked only by reading code).

## Working

| Area | Evidence |
|---|---|
| Stack start | `scripts/start.sh` brought up api1–3, worker, frontend, nginx, redis, postgres, prometheus, grafana, attack. Gateway `/api/healthz` and frontend `/` return 200. The compose file defines no healthchecks, so "healthy" means those HTTP checks passed. |
| Exp2 proxy flood, 10,000 identities | `reports/exp2_proxy_flood/summary.md` (committed earlier). FCFS bot advantage 9.9 modelled, 9.2 live. Fair Drop 0.92 expected, 0.60 for the actual draw. |
| Exp4 one human among bots | `reports/exp4_one_human/summary.md`, committed `3183854`. FCFS: bots take 10/10 seats. Fair Drop expected human win rate 0.465; the actual draw gave the human a seat. |
| Exp6 kill replica | `reports/exp6_kill_replica/summary.md` (earlier run, not repeated this session). 20,000 acknowledged receipts, 0 missing from the tree. |
| 50,000-entry lock and draw | Run with Redis up: `TestLockAndDrawAt50kEntries` PASS. 50,000 entries: lock (`doLock`) 1.094 s, draw (`doDraw`) 3.288 s, total 4.382 s, 50,000 ranked, test wall time 5.73 s. |
| Exp7 malicious server (rerun) | `reports/exp7_malicious_server/summary.md`, committed with this pass. Victim proof 404 `not_included`; control proof 200; reference verifier flags the victim (`reference_verifier_flags_victim: true`); audit `missing_receipts: 1`; `detected: true`. See the Broken section for the earlier run. |
| Bot visibility, per-drop counters | Read after each of two custom attacks from `GET /admin/drops/{id}/live`. Saved to `reports/bot_visibility/live_counters_2026-10-04.json`. Run 2 added +36 rate-limited (429), +484 reused-token rejections, +175 already-issued, +2 tarpit hits. Totals after run 2: 107, 1,097, 403, 5. |

## Broken

1. **Admin tile "Rate limited (all drops)" stays at 0 during a bot attack.** The tile reads `live:global`, which only receives rate limits on paths with no drop ID (`app.go` `live()`, `guard.go` `limited()`). Per-drop 429s (107 in run 2) never reach it. Fix: sum the per-drop `rate_limited` counters for the tile, or relabel it. Not changed in this pass.

2. **Exp7 server audit counter read 0 in the earlier run.** That run (committed earlier as `2676019`, now replaced) showed victim proof 404 and the verifier failing, but `missing_receipts: 0`, `detected: false`. Diagnosis: `ledger.go` (`integrity()`, about lines 288–318) counts `entry_registered` audit rows whose receipt is missing from the locked tree. In the earlier run the victim's receipt had **no** `entry_registered` row in `audit_log` at all, so there was nothing to count. In the rerun the row exists (`epoch 0`) and the count is 1. I could not find the cause of the missing row in the earlier run. It is intermittent, and I have two runs, so this is not settled.
   - The proof is the evidence: it is client-side, needs only the receipt, and does not depend on the server's audit log.
   - The runbook and script were changed to say this. Do not promise a red Audit panel.

3. **Reruns collide on deterministic drop IDs.** `scripts/run_malicious_demo.sh` fails with `duplicate key value violates unique constraint "drops_pkey"` if the exp7 drop already exists in Postgres. `/test/clear` did not remove it, because it only walks the Redis `drops` set, which was empty after the restart. This pass cleared the exp7 drop with the same deletes the handler does (`entries`, `draw_results`, `counterfactuals`, `allocations`, `drop_secrets`, `drops`), leaving `audit_log` alone. Custom runs have no per-run tag, so repeated custom runs with the same tiers reuse one drop ID (`exp-custom_mix-fairdrop-4866bd`). Fix: a per-run tag or a clear that also empties Postgres.

4. **Reports dir: custom runs overwrote tracked files.** Both custom runs wrote to `reports/custom_mix/`, which is tracked. Its tracked files are modified in the working tree and are **not committed**. I could not confirm whether those files held uncommitted results before my runs. Check and restore if needed.

## Unverified

| Item | Why | What would settle it |
|---|---|---|
| Live counters observed mid-attack | The counters were read after each run finished. Each attack took about 30 seconds, and the sampler I wrote to poll mid-run did not parse the drops list, so it captured nothing. | Poll `/admin/drops/{id}/live` every 3–5 s during a run, or do the same in the Live Arena. |
| The Live Arena and Admin tiles in a browser | No browser was used in this pass. Only the endpoints the views read were checked. | Open `/admin` (Live Arena) and `/live` during a run and check the tiles against the saved numbers. |
| Exp7 verify page shows the red banner | The verify page was not opened. The 404 and verifier results come from the API and the report. | Open the victim's `/verify` page after the malicious demo. |
| Redis and API startup | Right after `start.sh`, the API logged `lookup redis: i/o timeout` (03:40:06). It listened at 03:40:35 and no further Redis errors appeared. | Check the startup log on a cold start. |
| Kill-replica re-run | Not repeated this pass (the earlier exp6 result stands). | `scripts/kill_replica.sh 2` with the Live monitor open. |

## Not in git (left out on purpose)

- `reports/exp2_proxy_flood/` regenerated results (10k run output), not part of this pass.
- `reports/custom_mix/` (see Broken item 4).
- `AUDIT_REPORT.md`, `testdata/`, `web/.env.local` (may hold local secrets), `web/.next/`, `web/node_modules/`, `web/next-env.d.ts`, `web/tsconfig.tsbuildinfo`: untracked.
- `*.tokens.json` under `reports/`: git-ignored on purpose.

## Roadmap status (this pass)

| Step | Status |
|---|---|
| 1. `scripts/start.sh`, services up | Working (HTTP checks, no compose healthchecks). |
| 2. Malicious demo: diagnose audit 0, keep proof as evidence, fix claims | Working as evidence (proof 404, verifier flags). Audit counter: diagnosed as an intermittent missing audit row, not settled. Runbook and script updated. Rerun committed. |
| 3. 50,000-entry lock and draw timing | Working. Lock 1.094 s, draw 3.288 s. |
| 4. Bot visibility, live | Partly working. Per-drop 429, reused-token and tarpit counters move (saved). Global tile reads 0 (broken). Mid-run and browser view unverified. |
| 5. Readiness update, commits, push | Done with this file. Push to `demo-ready` only. |
