# Fair Drop demo readiness

Branch `demo-ready`. Updated 2026-10-04 after the fix pass. Docker was running for this pass.

Labels: **working** (checked this session, or in a result file from this session), **broken** (a verified defect still open), **unverified** (not checked, or checked only by reading code).

## Working

| Area | Evidence |
|---|---|
| Stack start | `scripts/start.sh` rebuilt and started all services. Gateway `/api/healthz` and frontend `/` return 200. The compose file has no healthchecks, so "healthy" means those HTTP checks passed. |
| Exp2 proxy flood, 10,000 identities | `reports/exp2_proxy_flood/summary.md`. FCFS bot advantage 9.9 modelled, 9.2 live. Fair Drop 0.92 expected, 0.60 for the actual draw. |
| Exp4 one human among bots | `reports/exp4_one_human/summary.md` (`3183854`). FCFS: bots take 10 of 10 seats. Fair Drop expected human win rate 0.465; the actual draw gave the human a seat. |
| Exp6 kill replica | `reports/exp6_kill_replica/summary.md` (earlier run, not repeated). 20,000 acknowledged receipts, 0 missing from the tree. |
| 50,000-entry lock and draw | `TestLockAndDrawAt50kEntries` PASS with Redis up. Lock 1.094 s, draw 3.288 s, total 4.382 s, 50,000 ranked. |
| Exp7 malicious server, rerunnable | `scripts/run_malicious_demo.sh` ran twice in a row, both exit 0. Each run: victim proof 404 `not_included`, control 200, reference verifier flags the victim, audit `missing_receipts` 1, `detected` true, audit chain ok. Result in `reports/exp7_malicious_server/`. |
| Rerunnable sales | The runner now calls `/test/clear` with its own drop ID before creating the sale. `/test/clear` accepts `{"drop_id": "exp-..."}`, takes IDs from Redis and Postgres (so an empty Redis set no longer skips rows), and clears the per-drop keys and ticket sets. Custom runs and the malicious demo both reran without a `drops_pkey` error. |
| Admin "Rate limited" tile | Now shows global plus this drop's `rate_limited`. In a sampled run it read 7, then 207, then 355 during the attack (`reports/bot_visibility/server_details_mid_attack.png`). The previous build showed 0. |
| Bot visibility in a custom attack | Admin → More tools → **Server details**. Tiles reset to 0 at the start of a sale, then climb. Custom run (600 people, 6 flood, 8 retry, 8 scraper, 4 proxy): rate-limited 0→355, reused-token 0→1,572, tarpit 0→8, tokens issued reached 556 in the sampled window. Samples in `reports/bot_visibility/tile_samples.txt`. Per-run totals in `reports/bot_visibility/live_counters_2026-10-04.json`. |
| `reports/custom_mix` | Restored to the committed version with `git checkout`. The working copy held only output from my custom runs (400 humans, 17 bots). |

## Broken

1. **The Live Arena's own run does not move the rate-limited or tarpit tiles early on.** Arena preset "Watchable (2 min)": 3,000 people + 800 bots, started through the Arena's Start button. Sampled at 1 s intervals on Server details from 09:36 to 09:39 (local): tokens issued climbed from 2,871 to 3,800, rate-limited stayed at 6,332, tarpit stayed at 70, reused-token moved only once, from 31,673 to 31,696 at 09:37:57. So the bots arrived late, or the Arena runs them differently. The cause is not established. I did not sample the full two minutes, and the page drifted to other tabs during the run, so later rows are missing.
   - Demo impact: use a custom attack (above) for these three tiles on screen. Do not promise them during the Arena's run.

2. **The three tiles are not in the Live Arena.** They are on Admin → More tools → Server details. `DEMO_SCRIPT.md` now says so.

3. **Exp7 audit counter read 0 in the earlier committed run (`2676019`).** The victim's receipt had no `entry_registered` row in `audit_log`, so there was nothing to count. Reruns now show 1 consistently. The cause of the missing row in the earlier run is not settled; it happened once in two runs. The proof (404 plus verifier failure) is the evidence the demo relies on. The runbook and script say so, and do not promise a red Audit panel.

## Unverified

| Item | Why | What would settle it |
|---|---|---|
| Arena-run tile movement over the full two minutes | Sampling stopped at 09:39, and the page drifted off Server details during the run. | Keep Server details open and sample for the full run. |
| Exp7 verify page shows a red banner | The verify page was not opened; the 404 and verifier results come from the API and report. | Open the victim's `/verify` page after the malicious demo. |
| Live Arena in a browser with the tiles on screen at the same time | Two windows were needed (Arena and Server details). | Put the Live Arena on one monitor and Server details on another. |
| Kill-replica re-run | Not repeated; the earlier exp6 result stands. | `scripts/kill_replica.sh 2` with the Live monitor open. |
| 50k test timing on a cold stack | Measured once with Redis up. | Rerun `scripts/test.sh ./internal/app/ -run TestLockAndDrawAt50kEntries -v`. |

## Not in git (left out on purpose)

- `reports/exp2_proxy_flood/` regenerated results (10k run output), not part of these passes.
- `AUDIT_REPORT.md`, `testdata/`, `web/.env.local` (may hold local secrets), `web/.next/`, `web/node_modules/`, `web/next-env.d.ts`, `web/tsconfig.tsbuildinfo`: untracked.
- `*.tokens.json` under `reports/`: git-ignored on purpose.

## Known constraints

- Drop IDs are deterministic for a given scenario and tiers, so two runs with the same spec share one sale. The runner clears it before each run, so the second run replaces the first run's data.
- `gofmt -l` flags `backend/internal/app/testkit.go` because the file uses CRLF line endings. The original file has the same issue; I kept CRLF.

## Roadmap status

| Step | Status |
|---|---|
| 1. Fix the admin "Rate limited" tile | Done (per-drop plus global). Visible in the screenshot. |
| 2. Rerunnable malicious demo and custom runs | Done. `/test/clear` takes an optional drop ID and finds Postgres rows. The runner clears its own sale before each run. |
| 3. Restore `reports/custom_mix` | Done, with `git checkout`. |
| 4. Live Arena tiles move during an attack | Partly. Custom attack confirmed on Server details. The Arena's own run did not move the rate-limited or tarpit tiles in the sampled window. |
| 5. Malicious demo twice in a row | Done. Both runs passed. |
| 6. Update this file, commit, push | Done with this pass. Push to `demo-ready` only. |
