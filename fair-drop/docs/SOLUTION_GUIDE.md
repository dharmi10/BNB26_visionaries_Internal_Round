# Fair Drop: solution guide

Read this before you present. Every number here comes from a file in the repo, and the file is named next to it. Where a result was seen only once, or is unverified, or is unexplained, it says so.

**Files this guide is built from:** `README.md`, `docs/ARCHITECTURE.md`, `docs/CRYPTOGRAPHY.md`, `docs/FAIRNESS_METRICS.md`, `DEMO_READINESS.md`, `TOUR.md`, `DEMO_SCRIPT.md`, and every `reports/*/summary.md` (plus the JSON in `reports/redteam/` and `reports/exp3_sybil_scaling/`).

**Working-tree caution:** `reports/custom_mix/summary.md` was overwritten by a 3,000-person Arena run after my last commit. It is not used here.

---

## 1. The problem in 5 lines

1. We sell **500 seats** to **50,000 people**. Demand is far bigger than supply.
2. **Bots** are programs that buy tickets faster than people can. Some run many fake or rented accounts.
3. In a **first-come-first-served (FCFS)** sale, whoever's request reaches the server first gets the seat.
4. Fast bots win that race. In our test, bots with **2%** of identities took **19.8%** of seats (`reports/exp2_proxy_flood/summary.md`).
5. We need a sale where speed, volume and IP addresses do not change your chances.

## 2. Our solution

Each verified person gets **one ticket**. The server cannot see whose ticket is whose, and it cannot quietly drop or favour a ticket. The full list of entries is **locked and fingerprinted** before the winners are chosen, and the winners are chosen with a **random seed** that is revealed only after the lock. Anyone can recompute the draw in their browser. Bots and rate limits protect the website from being overwhelmed, but they never decide who wins.

**One-line USP:** *Other systems try to catch bots and ask you to trust them. Fair Drop makes bots pointless and lets you verify it.*

---

## 3. How it works, step by step

Each step below says what happens, which page shows it, which backend piece does it, and why it is built that way. Terms are explained the first time they appear.

### Step 1: Enter

- **What happens:** you sign in with a simulated one-time code. Your browser makes a secret random token and **blinds** it. Blinding means hiding the token inside a sealed envelope before sending it to the server. The server signs the sealed envelope, so it never sees the token itself. Your browser opens the envelope, which leaves you with a signed token. You then send the signed token to the server (no login needed this time).
- **Page:** `/login`, then `/enter/[id]` (the "What your browser is doing" panel shows each step). Source: `TOUR.md`.
- **Backend:** the issuer (`entry.go`, `hToken`) signs at most one token per verified identity, using a Redis Lua script (one atomic step in Redis). Registration (`hRegister`) checks the signature and spends the token once. Source: `docs/ARCHITECTURE.md`.
- **Why:** the server can confirm "a valid, unused token entered" without learning "whose". That is the **blind signature** (`docs/CRYPTOGRAPHY.md`, section 1). The scheme is RSA-2048 blind signatures, RFC 9474. The scheme is a published standard; this implementation has not been independently audited.

### Step 2: Receipt

- **What happens:** the server returns a **receipt ID** and a signed proof that your entry was accepted. The receipt ID is a fingerprint of your secret token, so a retry gets the same receipt.
- **Page:** `/enter/[id]` ("You're in. Receipt accepted.") and `/status/[id]`.
- **Backend:** `receipt_id = SHA-256("fd:receipt:v1" ‖ token_secret)`, signed with ECDSA P-256 (`docs/CRYPTOGRAPHY.md`, section 2).
- **Why:** the fan keeps proof of entry, so the server cannot later claim you never entered. Retries are safe, so a dropped network request does not cost you a seat.

### Step 3: Lock

- **What happens:** when the sale closes, the server builds a **Merkle tree** over all receipts. A Merkle tree is a fingerprint of a whole list: change one entry and the fingerprint changes. The server publishes the **Merkle root** (the top fingerprint) **before** the seed is revealed.
- **Page:** `/events/[id]` ("Public verification information") and the Merkle root on `/status/[id]`.
- **Backend:** `draw.go` (`doLock`) and the Merkle code in `internal/fdcrypto/merkle.go`.
- **Why:** after the lock, the server cannot drop or add an entry without publishing a different root. Anyone with a receipt can check its inclusion in the list.

### Step 4: Draw

- **What happens:** the server reveals its random **seed**. Anyone can check it against the **seed hash** that was published when the sale was created. The **drand beacon** is a public random number from a service run by others, published at a moment nobody could predict when the list locked. The server mixes the seed, the Merkle root and the beacon into one final value. Each receipt gets a score from that value and its receipt ID. **Lowest score wins.** The next lowest form the waitlist.
- **Page:** `/status/[id]` ("Draw result"), `/verify` ("Checks" list).
- **Backend:** `draw.go` (`DRAWN`), `docs/CRYPTOGRAPHY.md` section 4.
- **Why:** the seed commit-reveal (publish a hash first, reveal the value later) and the beacon together stop the server from choosing the result. The score depends only on the receipt, not on when you arrived or how many requests you sent.

### Step 5: Claim

- **What happens:** winners have a time limit to claim their seat. If they miss it, the seat goes to the next person on the waitlist. Payment is a **mock**: the page says "NO REAL MONEY MOVES".
- **Page:** `/claim/[id]`, `/ticket/[id]`.
- **Backend:** `claim.go` (claim window, timeout, waitlist cascade).
- **Why:** a seat only goes to someone who proves they hold the token secret. The claim shows the cascade rule, so nobody is left waiting without a path forward.

### Step 6: Verify

- **What happens:** you can check your own receipt (is it in the list, and what did you get?) or recompute the whole draw in your browser. The page downloads the public bundle (seed, entry list, results), recomputes the Merkle root, the final value, every score and the full winner order, and shows PASS or FAIL for each check.
- **Page:** `/verify`, and "Recompute the whole draw in my browser" on `/status/[id]`.
- **Backend:** `draw.go` (verify bundle). Command-line checker: `verifier/verify.py`.
- **Why:** the server does not need to be trusted. The checks run on your machine.
- ⚠ **Not verified in this session:** the command-line verifier (`verifier/verify.py`) was not run. The browser verify page was read from source (`TOUR.md`) but not clicked through.

---

## 4. How bots are handled

Three mechanisms. Each protects **availability** (the site stays up). None of them decides **who wins**.

| mechanism | what it does, in one sentence | what it protects | source |
|---|---|---|---|
| **Rate limits** | Caps how many requests one IP address or one account can send per second, and returns "429 Too Many Requests" beyond that. | Keeps the site running under a flood. | `docs/ARCHITECTURE.md` (guard), `DEMO_READINESS.md` |
| **Reused-token rejection** | Refuses a token that was already spent, so one token cannot be used twice. | One entry per token. | `docs/ARCHITECTURE.md`, live tile "Rejected: reused token" |
| **Tarpit (decoy endpoint)** | A fake "fast lane" that looks like a success to bots that scrape the API; the receipt it returns is worthless. | Catches bots that take the bait. | `reports/exp5_tarpit/summary.md` |

**Key point:** the architecture says it directly: *"Defences are for availability only ... None of them is an input to allocation; turning them off (Test tools) must not change who wins."* (`docs/ARCHITECTURE.md`.)

**What the numbers show:**
- The tarpit caught **57.7%** of the naive scrapers (173 were fooled, from `reports/exp5_tarpit/results.json`). It does **not** catch UI-mimicking bots, which copy real browser behaviour (`reports/exp5_tarpit/summary.md`, `honest_limit`).
- Those UI-mimicking bots still get exactly one entry per identity. So the tarpit is not the protection; the one-entry-per-identity rule is.

---

## 5. What is novel

Each point says what is normally done, and what we do differently.

1. **The lottery is over the entry list, not the request stream.**
   - *Normally:* sites sell on arrival order (FCFS), or use a waiting queue that rewards fast clicks.
   - *Us:* each verified identity gets one ticket, and the draw uses only the locked list. Arrival, volume and IP never enter the score (`docs/ARCHITECTURE.md`, "Allocation is timing-independent").
2. **The server commits to the list before it knows the random seed.**
   - *Normally:* a company says "the draw was fair" and asks you to trust it.
   - *Us:* the Merkle root is published at lock, the seed is revealed after, and a drand beacon that did not exist at lock time is mixed in (`docs/CRYPTOGRAPHY.md`, sections 3 and 4).
3. **The fan's own browser checks the draw.**
   - *Normally:* the fan sees a result on a page.
   - *Us:* the browser recomputes the whole draw from the public data (`/verify`).
4. **The identity is blinded, so the server cannot link a ticket to a person.**
   - *Normally:* the ticketing system knows who holds which ticket.
   - *Us:* blind signatures (`docs/CRYPTOGRAPHY.md`, section 1). Caveat: the plain fallback mode (`BLIND_MODE=plain`) is linkable, as the doc says.
5. **We measure bots against counterfactuals on the same recorded attempts.**
   - *Normally:* sites rarely publish how a rival policy would have done with the same traffic.
   - *Us:* FCFS, a naive lottery and Fair Drop are computed on the same recorded attempts (`docs/FAIRNESS_METRICS.md`).

---

## 6. What we built

### Architecture in plain words

- **Fan site and admin site:** one web app (Next.js and React) served on `http://localhost:8088`. Fan pages are public; admin pages need a sign-in.
- **Nginx (the front door):** receives every browser request and routes `/api` to the API servers, `/attack` to the attack engine, and everything else to the web app.
- **API replicas (3 copies):** the Go server. Each copy holds no state of its own, so any copy can serve any request, and one can die mid-sale without losing data (`docs/ARCHITECTURE.md`).
- **Redis:** fast shared memory for the hot path (token checks, spending tokens, the live counters). Each decision is a single atomic script.
- **Postgres:** the permanent record (entries, allocations, and the tamper-evident audit log).
- **Worker:** runs timers (opening and closing the sale, claim timeouts) and copies events from Redis into Postgres.
- **Attack engine:** a Python and Locust tool that sends simulated people and bots. Used for the experiments and the live show. Test only.
- **Prometheus and Grafana:** metrics and a dashboard (`http://localhost:3001`).

### Tech stack and why

| piece | version (from repo) | why it was chosen |
|---|---|---|
| Go API | Go 1.25 (`go.mod`) | Fast, simple concurrency for many requests; compiles to one program per replica. |
| Next.js frontend | Next 16, React 19 (`frontend/package.json`) | One app for fan and admin pages, with live updates. |
| Redis | 7 (`docker-compose.yml`) | Atomic scripts make "one token per identity" safe under heavy traffic. |
| Postgres | 16 (`docker-compose.yml`) | Durable record with unique constraints as a second line of defence. |
| Nginx | 1.27 (`docker-compose.yml`) | Routes traffic and retries idempotent requests on another replica. |
| Locust (attack engine) | Python (`attack_engine/`) | Simulates large crowds and bot types for the experiments. |
| Prometheus, Grafana | (`docker-compose.yml`) | Metrics and dashboards. |
| Blind signatures | RSA-2048, RFC 9474 (`docs/CRYPTOGRAPHY.md`) | Standard scheme for "sign without seeing". |

Services in total: 3 API replicas, a worker, Redis, Postgres, Nginx, Prometheus, Grafana, the frontend and the attack engine (`README.md`).

---

## 7. Evidence

Every row is a result that is in a file. "Observed once" means the run was done one time. "Proves" and "Does NOT prove" are written so that you do not over-claim.

| # | What was run | Number | File | What it proves | What it does NOT prove |
|---|---|---|---|---|---|
| 1 | **FCFS vs Fair Drop**, 10,000 identities (9,800 humans, 200 bots across 20 operators), 2,000 IPs each (exp2) | FCFS (actual): bots hold **2.0%** of identities, take **19.8%** of seats, bot advantage ratio **9.900**. Fair Drop expected: ratio **0.924**. Fair Drop actual draw: ratio **0.600**. Human win rate: FCFS **4.1%**, Fair Drop expected **5.0%**. | `reports/exp2_proxy_flood/summary.md` | Under this flood, FCFS hands bots about 10× their identity share; Fair Drop brings the ratio to about 1. | That this holds for every attack. This was a single scenario. |
| 2 | **Live FCFS vs modelled** (same run, real requests against the classic sale) | Live FCFS ratio **9.200** against modelled **9.900** | `reports/exp2_proxy_flood/summary.md` | The model of FCFS matches a real run closely. | Real-world sales. The "live" sale is our own page. Observed once. |
| 3 | **One human among bots** (exp4): 1 human, 20 bot identities across 5 operators, 10 seats | FCFS: bots take **10 of 10** seats (ratio **1.050**). Fair Drop actual draw: ratio **0.945**, human **won** a seat. Fair Drop expected human win rate **46.5%**. | `reports/exp4_one_human/summary.md` | A single real person is not shut out by a large bot crowd under Fair Drop. | That the human wins reliably. The expected rate is 46.5%, so one draw is a lottery. Observed once. |
| 4 | **Normal traffic, no bots** (exp1): 50,000 humans, 500 seats | Human win rate **1.0%** (500 of 50,000), bot ratio not applicable, audit chain valid over **125,797** events | `reports/exp1_normal_traffic/summary.md` | The system works with no attack, and every seat is accounted for. | Performance at scale on real hardware. |
| 5 | **50,000-entry lock and draw timing** (unit test with Redis) | Lock **1.094 s**, draw **3.288 s**, total **4.382 s**, 50,000 entries ranked | `DEMO_READINESS.md` (run output, not saved as a report file) | Locking and drawing 50,000 entries takes about four seconds on this machine. | Timing on other hardware. **Observed once**, and the test log is not saved in `reports/`. |
| 6 | **Kill a replica mid-sale** (exp6): one API server stopped, 20,000 humans, 80,000 requests | **20,000** acknowledged receipts, **0** missing from the tree. Integrity **all zero**. | `reports/exp6_kill_replica/results.json` (`acked_receipts`, `acked_receipts_missing_from_tree`) and `summary.md` | No acknowledged receipt was lost when one replica died. | Client-side errors during the kill: not checked (`DEMO_READINESS.md`). The kill-replica command was not re-run this session. |
| 7 | **Malicious server** (exp7): the server silently drops one entry at lock. 300 humans. | Victim's proof: **404 `not_included`**. Control proof: **200**. Reference verifier flags the victim. Audit `missing_receipts`: **1**, `detected: true` (latest rerun). | `reports/exp7_malicious_server/summary.md`, `DEMO_READINESS.md` | The dropped fan can prove the drop with the receipt alone, without trusting the server. | That the server's own audit counter always catches it: see section 8. Observed in **three** runs: two reruns and an earlier one that read 0. |
| 8 | **Tarpit** (exp5): 4,000 humans, 600 bots across 2 operators | Scrapers caught **57.7%** (173 fooled). FCFS ratio **1.891**. Fair Drop actual draw **0.605**. | `reports/exp5_tarpit/summary.md`, `results.json` | The decoy catches the naive scrapers. | UI-mimicking bots are not caught; they still get one entry each (`honest_limit`). |
| 9 | **Show crowd with every bot kind** (show_bot_zoo): 5,000 identities (4,800 humans, 200 bots, 7 operators) | FCFS ratio **5.000**. Fair Drop expected **0.763**, actual draw **0.950**. | `reports/show_bot_zoo/summary.md` | Fair Drop keeps bot seat share near identity share across every bot type in the show. | Integrity: this run's check reads **VIOLATIONS**, see section 8. |
| 10 | **Sybil scaling** (exp3): one operator buys more identities | At 100, 1,000 and 1,250 identities, Fair Drop expected seats per identity fall from **0.095** to **0.050**, and FCFS cost per seat rises from **$3.0** to **$37.5**. | `reports/exp3_sybil_scaling/sybil_scaling.csv` | Buying more identities costs more per seat under Fair Drop. | The 10,000-identity folder exists, but no rows are in the CSV for it. Unverified at that size. |
| 11 | **Red team** (before and after fixes, `reports/redteam/`) | Before fixes: **6 of 14** probes held. After fixes: **14 of 17** held, **1 broken** (`idle_connections`), **1 demo-only** (`demo_secret`), **1 info** (`tier_switch`). | `reports/redteam/before_fix.json`, `reports/redteam/after_fix.json` | Several real attacks were found and fixed (phone spelling, OTP guessing, huge body, retry key hijack). | The one broken probe is not fixed. The probe list is not exhaustive. |
| 12 | **Bot visibility counters** on Server details (custom attack, two runs) | Run 2 added **+36** rate-limited, **+484** reused-token rejections, **+175** already-issued, **+2** tarpit hits. | `reports/bot_visibility/live_counters_2026-10-04.json`, `tile_samples.txt` | The live counters move during an attack. | That the Live Arena's own run moves them: see section 8. Observed in two custom runs. |

**Integrity** means these counts must all be zero: broken Merkle tree, duplicate entries, duplicate seats, invalid state changes, missing receipts, oversold seats. The integrity check is the same across all the reports.

---

## 8. Honest limits

### What we do not stop

- **Many real, verified accounts.** A bot owner who buys many real verified accounts still gets one entry per account. We make that cost real money (`README.md`, `docs/ARCHITECTURE.md`). The assumed cost is **$3** per identity, shown as a number in the reports, not a claim that bots are impossible.
- **Identity farms in general.** The README says it directly: "We do not stop identity farms."
- **Sophisticated browser-based bots.** UI-mimicking bots are not caught by the tarpit (exp5).

### Known bugs and gaps

1. **`show_bot_zoo` integrity reads VIOLATIONS.** Its `missing_receipts` is **51,378**, which is **more** than its own **16,977** recorded entries (`reports/show_bot_zoo/summary.md`). A missing-receipt count cannot be larger than the number of entries, so the check is probably counting something other than what it says. **Unexplained.** Do not say this run passed integrity.
2. **Exp7's server audit counter read 0 in one earlier run.** The victim's receipt had no `entry_registered` row in the audit log, so there was nothing to count. Reruns now read 1. The cause of the missing row in the earlier run is **not settled** (`DEMO_READINESS.md`).
3. **Red-team probe `idle_connections` is broken.** A normal request took **5,002 ms** while **1,500** connections hung (`reports/redteam/after_fix.json`). The gateway does not drop silent connections as designed.
4. **The Live Arena's own run did not move two bot counters early on.** Rate-limited and tarpit tiles stayed flat in the sampled window. Reused-token moved only at the end. The cause is unknown (`DEMO_READINESS.md`). The bot counters move in a custom attack.
5. **The admin "Rate limited" tile** read 0 during attacks until it was fixed. It now adds per-drop counts (`DEMO_READINESS.md`).
6. **Reruns can collide on the same sale ID.** Sales with the same spec share one ID. The runner clears its own sale first, so the second run replaces the first run's data (`DEMO_READINESS.md`, known constraints).

### Merkle odd-node duplication (a real limit)

When a tree level has an odd number of nodes, the last node is **duplicated** to pair it up (`docs/CRYPTOGRAPHY.md`, section 3). This is a standard simplification, but it means the Merkle root does not distinguish "one copy of the last receipt" from "two copies". The duplicate-entry check in integrity covers that case, and the leaves include the tier, but a judge who knows Merkle trees may ask about it. Say it plainly: it is a known simplification of the standard design.

### Unverified or observed once

- **The command-line verifier** (`verifier/verify.py`) was not run this session.
- **The kill-replica command** (`scripts/kill_replica.sh`) was not re-run this session. The evidence is the earlier exp6 report, with client-side errors not checked.
- **The fan's Enter flow** was read from source, not clicked through.
- **The 50,000-entry timing** was observed once.
- **The 1-human scenario** was observed once.
- **The 10,000-identity Fair Drop run** (exp2) was observed once.
- **The beacon signature check** is delegated to drand clients; this app does not check the beacon's signature itself (`docs/CRYPTOGRAPHY.md`, documented deviation).
- **The blind-signature scheme and the rest of the crypto** have not been independently audited.

---

## 9. Expected judge questions

Each answer is 2 to 4 sentences you can say out loud. Numbers come from section 7.

### Fairness

**Q: Why is FCFS unfair?**
FCFS gives the seat to whoever's request reaches the server first. In our flood test, bots with 2.0% of identities took 19.8% of seats (`reports/exp2_proxy_flood/summary.md`). Fast scripts beat people, and that is exactly what the classic page does.

**Q: Why a lottery instead of first come, first served?**
A lottery uses the list of verified people, not the speed of clicks. Arrival order, request volume and IP addresses never enter the score. Under the same flood, Fair Drop's expected bot advantage ratio is 0.924, against 9.900 for FCFS.

**Q: Why is the human win rate only 46.5%?**
The 46.5% figure is the expected chance for the single human in one 10-seat sale against 21 identities (`reports/exp4_one_human/summary.md`). It is a lottery, so one person does not win every time. The point is that the bots did not take every seat, and the human had a real chance.

**Q: What does "bot advantage ratio" mean?**
It is the bot share of seats divided by the bot share of identities. A ratio of 1 means a bot identity is exactly as likely to win as a person. Our target is 1 or less (`docs/FAIRNESS_METRICS.md`).

**Q: What stops the admin from cheating?**
The admin cannot pick winners. The seed hash is published when the sale is created, the Merkle root at lock, and the seed at reveal, so a change at any stage can be checked (`docs/CRYPTOGRAPHY.md`). The chain of audit events also makes an edit to an old record show up.

**Q: Could the server drop my entry?**
It could try, but you would see it. Your proof fails, and the malicious-server run shows the victim's proof returning 404 `not_included` while the control proof returns 200 (`reports/exp7_malicious_server/summary.md`).

### Bots and security

**Q: Can I just buy many accounts?**
Yes, but each account must be a real verified person, and each one gets one entry. Our assumed cost is $3 per identity, and the Sybil scaling run shows the cost per seat rising sharply as identities grow (`reports/exp3_sybil_scaling/sybil_scaling.csv`). We do not claim bots are impossible; we claim a bot gets nothing from speed, volume or IPs.

**Q: Why not detect bots with machine learning?**
Detection can be wrong, and a wrongly blocked real person has no way to appeal. Our design never lets detection decide the winner. Bots are handled by rate limits and the decoy trap, which only protect the site, and the draw ignores them. The research panel on the Live Arena says the PR-AUC measure does not apply to a fixed-rule gate with one operating point (`frontend/components/arena/ResearchMetrics.tsx`).

**Q: What do the rate limits and the tarpit do?**
Rate limits stop one IP or account from flooding the site, and the tarpit catches scrapers that take a fake fast lane. Neither one decides who wins. The tarpit caught 57.7% of naive scrapers and did not catch UI-mimicking bots (`reports/exp5_tarpit/summary.md`).

**Q: What did the red team find?**
Before the fixes, 6 of 14 probes held. After the fixes, 14 of 17 held. One probe, `idle_connections`, is still broken: a normal request took 5,002 ms while 1,500 connections hung (`reports/redteam/after_fix.json`). We would fix that next.

**Q: Can a bot reuse a token?**
No. A spent token is rejected, and the live tile "Rejected: reused token" counts those attempts. In our custom attack, 1,572 reused-token rejections were recorded in one run (`reports/bot_visibility/tile_samples.txt`).

### Scale and reliability

**Q: Is the 50,000 crowd real?**
No. The 50,000 people are synthetic: test identities seeded by `scripts/seed.sh` with no phones or SMS (`README.md`, `scripts/seed.sh`). The shape of the crowd is realistic, but it is a simulation, and we say so.

**Q: What if the server crashes?**
We killed one of the three API replicas during a 20,000-person sale, and all 20,000 acknowledged receipts were still in the tree (`reports/exp6_kill_replica/results.json`). The state lives in Redis and Postgres, so a replica can restart without losing it. Observed once, and the kill command was not re-run this session.

**Q: How long does the draw take?**
For 50,000 entries, the lock took 1.094 seconds and the draw 3.288 seconds in one unit-test run (`DEMO_READINESS.md`). That was observed once on one machine.

**Q: Does this scale to real traffic?**
We have not tested it against real traffic. Our tests ran on one computer with simulated load. Our tests do not show that 50,000 people can hit the site in the same second. The Live Arena's own text says that needs several load machines (`frontend/components/admin/ControlRoom.tsx`).

**Q: What happens when two people buy the same seat?**
Each seat is allocated by a single atomic step, and the integrity check counts duplicate seats. In the reports I checked (exp2, exp4, exp6, exp7 and show_bot_zoo), the duplicate-seat count is 0 (for example `reports/exp2_proxy_flood/summary.md`, `reports/exp4_one_human/summary.md`).

### Cryptography

**Q: What is a blind signature?**
It is a way for the server to sign something without seeing it. Your browser hides the token in an envelope, the server signs the envelope, and you open it to keep the signature. The server knows a valid token was used, but not whose it is.

**Q: What is a Merkle root?**
It is one fingerprint for a whole list. If one entry changes, the fingerprint changes. The server publishes it before the seed is revealed, so it cannot change the list afterwards without being caught.

**Q: What is the seed hash, and why publish it first?**
The seed hash is a fingerprint of a random number that the server picked at the start. Publishing the hash first means the server cannot change the seed later. When the seed is revealed, anyone can check it matches the hash.

**Q: What is the drand beacon?**
It is a public random number from a service run by others, published at a time that did not exist when the list locked. Mixing it in means even the server cannot choose the result alone. Our app does not check the beacon's signature itself; drand clients do that (`docs/CRYPTOGRAPHY.md`).

**Q: Is the cryptography audited?**
No. The scheme is standard (RFC 9474 blind signatures, RSA-2048, ECDSA P-256), and the formats are pinned by test vectors that Go, Python and the browser all check. But there has been no independent audit, and we would not say it is production-ready without one.

### Product and UX

**Q: Why do fans need to download a receipt?**
If the server drops your entry, the receipt and token file are your proof and your key to claim a seat. The enter page says so, and the claim page needs the token secret held in your browser.

**Q: Does arrival time matter in Fair Drop?**
No. The event page says "Timing within the window never matters." The classic page shows your arrival time, because that is the rule there.

**Q: Does the fan need an account?**
Fans sign in with a simulated one-time code, which is shown on screen for the demo. No phone or SMS is used.

### Why this approach

**Q: How is this different from Ticketmaster's verified fan?**
We have not studied how that product works internally, so we cannot compare the details. What we can show is our own design: the entry list is fingerprinted before the draw, and anyone can recompute the result in their browser. The live demo and the verifier are how a judge can check that claim.

**Q: Why publish the Merkle root and not just the winners?**
Publishing winners alone does not show that the list was not changed before the draw. The root ties the winners to a specific list, and a receipt holder can check their own entry.

### What if

**Q: What would you do with another week?**
Fix the `idle_connections` probe, explain and fix the `show_bot_zoo` integrity reading, and run the full set of experiments again so every number in this guide is seen more than once. We would also check the verifier command and the kill command from a clean start.

**Q: What if a bot owner buys a thousand real accounts?**
They pay for a thousand verified people, and each one gets one entry. The result is a bot advantage close to their identity share, not their request volume. We do not stop that; we make it expensive (`reports/exp3_sybil_scaling/sybil_scaling.csv`).

---

## 10. Glossary

- **Bot:** a program that acts like a person, usually to get an advantage. A **bot account** is a verified account run by a program.
- **Blind signature:** a signature made on a hidden message. The signer cannot see the message, but the signature is still valid.
- **Blinding:** hiding a message before the signer sees it.
- **Bot advantage ratio:** (bot share of seats) ÷ (bot share of identities). 1 means fair.
- **Audit chain (hash-chained log):** each event includes a fingerprint of the one before, so an edit breaks every later fingerprint.
- **Beacon (drand):** a public random number from a shared service that nobody controls.
- **Commit-reveal:** publish a fingerprint of a secret first, reveal the secret later, so it cannot be changed.
- **Counterfactual:** what a different allocation rule would have done with the same recorded attempts.
- **Draw:** choosing winners from the locked list using the seed and beacon.
- **ECDSA P-256:** a standard signature scheme used to sign receipts and tickets.
- **FCFS (first come, first served):** the classic sale; the fastest request wins.
- **Gateway / Nginx:** the front door that routes every request to the right service.
- **Idempotent:** safe to repeat. A repeated registration returns the same receipt.
- **Integrity counters:** counts that must be zero: broken Merkle tree, duplicate entries and seats, invalid state changes, missing receipts, oversold seats.
- **Lock:** the moment the entry list is frozen and its Merkle root is published.
- **Locust:** a load-testing tool used by the attack engine.
- **Merkle tree:** a tree of fingerprints over a list. The top fingerprint (the root) changes if any entry changes.
- **Merkle root:** the single top fingerprint of a Merkle tree.
- **Naive lottery:** every request is a ticket, so bots that send more requests get more tickets.
- **Nginx:** a web server used as the front door here.
- **Postgres:** the database used as the permanent record.
- **PR-AUC:** a score for classifiers that trade off precision and recall. Not applicable to our fixed-rule gate.
- **RFC 9474:** the standard for RSA blind signatures used for the tokens.
- **Rate limit:** a cap on requests per second from one IP or account. Returns "429" beyond the cap.
- **Receipt:** proof that an entry was accepted. Its ID is a fingerprint of the secret token.
- **Redis:** fast shared memory used for the hot path (token checks, counters).
- **Replica:** one copy of the API server. We run three.
- **Reused-token rejection:** refusing a token that was already spent.
- **Seed:** a random number chosen by the server at the start; revealed at the draw.
- **Seed hash:** the fingerprint of the seed, published first.
- **Sybil attack:** one actor creating many fake identities to gain more than their share.
- **Tarpit:** a decoy endpoint that looks like a success to scrapers, but the receipt is worthless.
- **Token:** a random secret you hold; the signed token proves you are one verified person.
- **Verified identity:** a person who passed the simulated one-time-code check.
- **Waitlist:** the ordered list of next people, who get a seat if a winner does not claim.

---

## 11. Demo script

### 6-minute version

1. **(0:00)** Open the fan site, `http://localhost:8088`. Say: "500 seats, 50,000 people, and bots. Our goal: bots get nothing from speed."
2. **(0:45)** Open the admin page and go to **More tools → Summary** or **Proof & checks → Detailed results**. Show the FCFS and Fair Drop bot advantage tiles. Source: `reports/exp2_proxy_flood/summary.md`. Say: "FCFS gave bots about ten times their share. Fair Drop brings it to about one."
3. **(1:45)** Show the one-human scenario in `reports/exp4_one_human/summary.md`. Say: "One real person against twenty bot accounts. FCFS gave the bots every seat. Fair Drop gave the human a seat, but it is a lottery: the expected chance is 46.5%."
4. **(2:45)** Run the custom bot attack (`DEMO_READINESS.md`, step 6), then open **More tools → Server details**. Say: "These are the servers' own counters: rate-limited requests, reused tokens, and tarpit hits. They protect the site and do not choose the winner."
5. **(3:45)** Run the 50,000-entry lock and draw test (`bash scripts/test.sh ./internal/app/ -run TestLockAndDrawAt50kEntries -v`). Say: "Fifty thousand entries are locked and drawn in about four seconds."
6. **(4:30)** Show the malicious-server run in `reports/exp7_malicious_server/summary.md`. Say: "The server dropped one entry. The dropped fan's proof returns 404, so they can prove it, without trusting us."
7. **(5:30)** Close: "Bots can buy accounts, and we do not claim otherwise. We make each account cost real money, and we make the draw something anyone can check."

### 2-minute version

1. **(0:00)** "500 seats, 50,000 people, and bots. In first-come-first-served, bots with 2% of identities took 19.8% of seats." (`reports/exp2_proxy_flood/summary.md`)
2. **(0:30)** "Fair Drop gives each verified person one ticket, locks the list with a fingerprint, and draws with a seed revealed after the lock. Anyone can recompute the draw in their browser."
3. **(1:00)** "Our defences stop floods and decoy scrapers, but never choose the winner. That is the key claim."
4. **(1:30)** "Verify it yourself: the malicious-server run shows a dropped entry is provable with the receipt alone. Ask us for the verify page." Close: "Other systems ask you to trust them. Fair Drop makes bots pointless and lets you verify it."
