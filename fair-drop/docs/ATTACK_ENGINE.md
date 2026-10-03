# Attack engine

`attack_engine/`: Locust + a scenario runner. Everything is driven by a seeded plan (each scenario has a fixed seed), so who acts when, from which IP and with which tier is identical across runs; `/test/reset` only rotates the drop's own seed and keys.

## Model
- **Identity pool**: 50,000 synthetic verified users `t_000001…` (`POST /test/seed`).
- **Operators**: a bot operator owns N identities and an IP pool, runs one profile. Humans are operator `humans`, one identity and one IP each.
- **Plan** (`build_plan`): a time-ordered list of actors `{uid, kind, op, profile, offset, tier, ip}`. Bots attack at open; humans arrive in a "rush" (60% right after open, the rest spread).
- **Actor queue**: each Locust user pulls the next actor whose offset is due; worker processes take disjoint slices. Done markers and per-worker metrics/tokens JSON are merged by the runner.

## Profiles
| profile | behaviour |
|---|---|
| HUMAN | login, think time, token, register, occasional retry on failure |
| SPEED_BOT | no think time, immediate token+register, a few repeats |
| FLOOD_BOT | hundreds of requests per identity from few IPs |
| RETRY_BOT | persistent retries with backoff on 429/5xx |
| PROXY_ROTATOR | a new `X-Sim-IP` every request out of a 2,000-IP pool |
| SYBIL_OPERATOR | many identities, each acting once, one IP pool |
| API_SCRAPER | skips the UI, finds `register-fast` (the tarpit) |
| UI_MIMIC | follows the page sequence with human-like delays (no JS execution; see ADR-10) |

Every profile has a Fair Drop flow and an FCFS flow so the same actors can attack both.

## Experiments (`python -m attack_engine run expN [--scale S] [--also-fcfs]`)
| id | what | what we look at |
|---|---|---|
| exp1 | 50,000 humans, no bots | baseline human win rate, latency, integrity |
| exp2 | 20 operators × 10 identities, 2,000 rotating IPs each, flooding | bot advantage ratio vs FCFS/naive |
| exp3 | Sybil scale 100 / 1,000 / 10,000 identities | seats per operator, cost per seat |
| exp4 | ~50,000 bot requests + 1 human | that human's chance vs the ideal |
| exp5 | API scrapers vs UI-mimic bots | tarpit hits, entries accepted |
| exp6 | kill a replica mid-window (`/test/die`) | errors, retries, integrity, recovery |
| exp7 | malicious server drops one entry | victim verify red, `missing_receipts` > 0 |

Run from Admin → Test tools, the control API (`POST :9200/run`), or `scripts/run_experiment.sh|ps1`, `scripts/run_all_experiments.sh|ps1`. `--scale 0.1` runs 10% of the population.

## Output
`reports/<experiment>/{results.json, results.csv, summary.md, charts/}`; live FCFS replays go to `.../live_fcfs/`. Results are also pushed to `/test/experiments` so the admin Fairness tab shows real recorded data.

## Protection self-test (`python -m attack_engine selftest`, or Admin → Control Room → "Quick safety check")
Creates a fresh mini-sale and sends 18 cases whose expected answer is fixed in advance: honest entry, idempotent retry, token reuse, forged signature, tampered token, second token request, unauthenticated request, late signup (ineligible), decoy endpoint, a 150-request flood from one IP (some 429) while a normal person on another IP still gets in, entering after close, token after close, and after locking: the sealed list holds exactly the legitimate entries (forged/decoy/late excluded) and the integrity counters are zero. Last run: **18 / 18 passed**.
