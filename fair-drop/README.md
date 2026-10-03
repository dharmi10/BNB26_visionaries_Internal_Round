# Fair Drop

Sell **500 seats to 50,000 people** where speed, request volume and IP rotation give **no advantage**: one verified identity gets one entry, the entry list is publicly locked (Merkle root) *before* the seed is revealed, and anyone can recompute the draw.

> We do **not** claim bots are impossible. We claim a bot gets nothing from speed, volume or IPs, and that every extra seat costs it a real verified identity. The experiments below measure exactly that.

## Run it
```bash
scripts/start.sh            # or scripts\start.ps1  (docker compose up -d --build)
scripts/seed.sh             # 50,000 synthetic verified users (TEST_MODE, no phones/SMS)
```
| what | where |
|---|---|
| fan site + admin | http://localhost:8088 · admin `/admin` (`admin` / `admin-demo-pass`) |
| API | http://localhost:8088/api |
| Grafana (dashboard "Fair Drop") | http://localhost:3001 |
| Prometheus | http://localhost:9090 |
| attack engine control API | http://localhost:9200 |

Services: 3 Go API replicas, a worker, Redis, Postgres, Nginx, Prometheus, Grafana, Next.js frontend, Locust attack engine. Test key `test-key-demo` (TEST_MODE only).

Experiments:
```bash
scripts/run_experiment.sh exp2 --scale 0.1 --also-fcfs     # one experiment (exp1..exp7)
scripts/run_all_experiments.sh --scale 1.0 --also-fcfs      # all seven, 50,000 identities
scripts/kill_replica.sh 2      scripts/run_malicious_demo.sh      scripts/reset.sh
```
Windows equivalents: `scripts\*.ps1`. Tests: what each one means in plain English is in [docs/TESTS_EXPLAINED.md](docs/TESTS_EXPLAINED.md); commands in [docs/TESTING.md](docs/TESTING.md).

## Where to look (no jargon)
- **`/story`**: a scroll-driven 3D explanation (people, bots, the old way, the sealed list, the draw).
- **Admin → Control Room** (default tab): start a bot attack with one button; watch each decision as a dot (green accepted, red rejected, purple decoy trap; circle = person, diamond = bot); live users, requests/s, accepted/s, rejected/s; people vs bots let in; a **protection scorecard** (correctly blocked / false negatives / false positives / correctly allowed, with every rejection reason re-checked by an independent oracle); **BEFORE (first-come-first-served) vs AFTER (Fair Drop)** bars; and a **protection self-test** of 18 known-good/known-bad requests.
- Admin → Summary: the same facts in plain sentences.

## Results (full scale, one laptop, rate limits on, live FCFS replay of the same actors)
Raw data: `reports/<experiment>/{results.json,results.csv,summary.md,charts/}`.

| experiment | FCFS | naive lottery | **Fair Drop** |
|---|---|---|---|
| **2 Proxy flood**: 20 operators × 10 identities, rotating IPs (bots = 0.4% of identities) | bots hold **20%** of seats, advantage **50×**; human win rate 0.8% | 14.1% of seats, **35×** | **0.4%** of seats, advantage **0.95×**; human win rate 1.0% |
| **4 One human vs ~50,000 bot requests** (10 seats, 21 identities) | human wins **0%** | 0% | human wins **46.5%** in expectation (ideal 47.6%) |
| **5 Tarpit**: API scrapers + UI mimics (10.6% of identities) | advantage 1.9× | 0.70× | **0.52×** |
| **1 Normal traffic**: 50,000 humans | 1.0% win | 1.0% | 1.0%, 0 errors, p99 register 44 ms |

**3 Sybil scaling** (what buying identities does): Fair Drop seats and cost per seat for a bot operator

| identities bought | FCFS seats / cost per seat | Fair Drop seats (expected) / cost per seat |
|---|---|---|
| 100 | 100 / $3 | **1.0 / $293** |
| 1,000 | 100 / $30 | 8.8 / $341 |
| 10,000 | 100 / $300 | **55.5 / $541** |

*Honest reading:* Fair Drop cannot stop a buyer who owns 10,000 verified identities from winning ≈11% of all seats. It makes each seat cost ~$300-$540 of identities (at an assumed $3/identity, configurable) instead of ~$3, and removes every speed/volume/IP lever. Identity cost is the control, not cryptography.

**6 Kill a replica mid-window** (20,000 humans, `api-2` exit 137): 20,000 client-acked receipts, **0 missing from the Merkle tree**, 0 client 5xx/connection errors, replica back healthy, all six integrity counters 0, audit chain valid, Python verifier passes.
**7 Malicious server drops one entry**: victim's proof returns 404 → verify page shows **red** "your receipt is NOT in the locked list"; independent audit log shows `missing_receipts = 1`; the reference verifier flags it; a control receipt still verifies.

## How it works (one paragraph)
Verified fans get **one blind-signed token per drop** (RFC 9474) and later register with it **with no session**, so the server can't link entry to person. Registration is atomic in Redis (spent set); at close the entry list is Merkle-locked and the root published; then the committed seed (and an optional drand beacon chosen after lock) is revealed and `score = H(final ‖ receipt)`; lowest scores win seats, the rest form the waitlist; unclaimed seats cascade down it. Every event goes into a hash-chained audit log. See [docs/CRYPTOGRAPHY.md](docs/CRYPTOGRAPHY.md).

## Docs
[SYSTEM_ANALYSIS](docs/SYSTEM_ANALYSIS.md) (incl. PRD deviations) · [ARCHITECTURE](docs/ARCHITECTURE.md) · [ARCHITECTURE_DECISIONS](docs/ARCHITECTURE_DECISIONS.md) · [RESEARCH](docs/RESEARCH.md) · [API_CONTRACT](docs/API_CONTRACT.md) · [CRYPTOGRAPHY](docs/CRYPTOGRAPHY.md) · [ATTACK_ENGINE](docs/ATTACK_ENGINE.md) · [FAIRNESS_METRICS](docs/FAIRNESS_METRICS.md) · [TESTS_EXPLAINED](docs/TESTS_EXPLAINED.md) · [RED_TEAM](docs/RED_TEAM.md) · [TESTING](docs/TESTING.md) · [DEMO_RUNBOOK](docs/DEMO_RUNBOOK.md) · [DEPENDENCIES](docs/DEPENDENCIES.md)

## Layout
`backend/` Go API + worker · `frontend/` Next.js fan + admin UI · `attack_engine/` Locust profiles, scenarios, reporting · `scoring/` fairness maths · `verifier/` stdlib Python verifier · `infra/` nginx, Prometheus, Grafana · `scripts/` · `tests/` e2e · `reports/` experiment output · `docs/`.
