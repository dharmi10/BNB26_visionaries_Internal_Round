# The tests, in plain English

**Plain names used on the admin Control Room page** (technical name in brackets):
Quick safety check (self-test) · Try to break it (red team) · Bot attack (load test) · Old way vs new way (before/after) · Full walkthrough (smoke test) · Code checks (unit tests) · The 7 big experiments.
The same list is on the Control Room page under "What each test means", together with the sale's stages in plain words.

There are four kinds of checks. Each answers a different question.

| Kind | Question it answers | When it runs |
|---|---|---|
| **A. Unit tests** | "Is each small piece of code correct on its own?" | Before you ship, no website needed |
| **B. Smoke test** | "Does the whole thing work once, start to finish?" | Needs the stack running |
| **C. Quick safety check = protection self-test (18 cases)** | "Does the gate let the right people in and keep the wrong ones out?" | Button in Admin → Control Room |
| **D. The 7 big experiments** | "Is it actually fairer than first-come-first-served, under attack?" | Needs the stack running; takes minutes |

Everything below is a real check that exists in the repo.

---

## A. Unit tests (small pieces, fast, no website needed)

### Go backend: `backend/internal/fdcrypto/fdcrypto_test.go` (the maths)
| Test | In plain words |
|---|---|
| `TestMerkleSizes` | The "sealed list fingerprint" is computed correctly for lists of awkward sizes (0, 1, 2, 3, 5, 7, 8, 1000, 4097 and 50,000 entries). Every entry's proof must check out, and changing an entry's tier must break it. |
| `TestMerkleOrderIndependentAndDuplicates` | Shuffling the list gives the same fingerprint, and a duplicate entry is rejected. |
| `TestDrawDeterministic` | Same inputs always give the same winners. Nothing random at draw time. |
| `TestBlindFlowAndPlainFallback` | The "ticket the server signed without seeing" works, and the simpler fallback works too. |
| `TestWriteVectors` | Writes the answer key (`docs/test-vectors.json`) that the Python and browser checks are compared against. |

### Go backend: `backend/internal/app/app_test.go` (the rules, run against a real Redis and Postgres)
| Test | In plain words |
|---|---|
| `TestAuthAndTestkitHidden` | In production mode the test backdoors (`/test/...`) don't exist (404). Admin pages refuse no login, a normal fan's login and a garbage login. A wrong one-time code is refused and the right one logs you in. |
| `TestEligibilityCutoff` | Someone verified after the cutoff can't get a ticket token (403), someone verified before it can, and the late person can still browse the page. |
| `TestConcurrentDuplicateIssuance` | 200 simultaneous requests from one person (each with a different ticket) produce exactly ONE token; the other 199 are refused. A harmless retry of the same request returns the same signature. |
| `TestEntryValidReusedBadSigIdempotent` | A good token enters; 300 simultaneous retries all get the same receipt and still only ONE entry exists; reusing it without the retry key is refused; a forged one is refused; an invalid tier is refused. |
| `TestTarpitBurnsToken` | The decoy "fast lane" fools bots but never puts them in the real list. |
| `TestIllegalTransitionsAndWindowClosed` | The sale can't skip steps (e.g. draw before lock), and nothing is accepted after close. |
| `TestFullDrawIsReproducibleFromBundle` | Download the public data, recompute the draw yourself, get the same winners. |
| `TestClaimsRaceExpiryCascadeNoOversell` | 20 winners each hammer "claim" 5 times at once for 5 seats: exactly 5 seats are given out, never the same seat twice. Second half: if nobody claims, seats pass down the waitlist, exactly the right number stay reserved, and a claim that arrives too late is refused (410). |
| `TestMaliciousServerDetected` | We make the server secretly drop one person's entry. That person's proof request says "not included", the sealed count is 9 not 10, and the safety check reports one missing receipt. |
| `TestBaselineFCFSNoOversell` | The old first-come-first-served sale: 200 buyers × 3 tries for 10 seats sells exactly 10, never more. (So the comparison is fair: the old way is unfair to people, not buggy.) |
| `TestAllocateCapAndOrder` | The "plain lottery with a per-person cap" used in comparisons: one bot sends 3 requests for 3 seats with a cap of 2, so it gets 2 and a real person gets the third. |

### Python: `scoring/test_scoring.py` (the fairness numbers)
| Test | In plain words |
|---|---|
| `test_bot_advantage_ratio` | "Bot advantage" = share of seats ÷ share of crowd. 1.0 is fair, 50 is terrible. |
| `test_naive_vs_fairdrop_monte_carlo` | Simulated 1000s of times: a plain lottery can be gamed by extra tickets; Fair Drop can't. |
| `test_percentile` | The "slowest 1%" style numbers are calculated correctly. |

### Python: `verifier/test_verify.py`
The stand-alone verifier script must reproduce the Go answer key exactly (fingerprint, seed mix, ordering, proof paths). It also confirms a proof fails for a wrong tier. Two independent programs agreeing = trust.

### Python: `attack_engine/test_attack_engine.py` (the bot simulator itself)
| Test | In plain words |
|---|---|
| `test_all_eight_profiles_have_both_flows` | All 8 bot types exist and know both sale types. |
| `test_plan_is_reproducible_and_identities_are_unique` | Same settings give the same crowd; no two people share an identity. |
| `test_operator_to_identity_and_ip_mapping` | Each bot operator controls the identities and IPs we say it does. |
| `test_labels_match_plan` | The "this one is a bot / this one is a person" answer key matches what was sent. This is the key the protection scorecard relies on. |
| `test_sybil_scaling_has_three_sizes_and_exp4_has_one_human` | The "bot buys more identities" experiment has the right crowd shapes. |
| `test_pool_overflow_is_rejected` | Asking for more bots than identities exist gives a clear error, not silent wrong results. |

### Browser code: `frontend/lib/fdcrypto.test.ts`
| Test | In plain words |
|---|---|
| receipt id | The browser computes the same receipt ID as the server. |
| merkle root, proof, ordering | The browser gets the same fingerprint, proof and winner order as the Go answer key. |
| `verifyBundle` | The "Verify a draw" page accepts an honest draw and flags one with a dropped entry. |
| blinds in JS, Go signs… | End to end: the browser blinds a ticket, the server signs it blind, the browser unblinds, the server accepts it, the receipt checks out. (Skipped unless you set `FD_E2E=1` and the stack is running.) |

---

## B. Full walkthrough (the "smoke test"): `tests/smoke.py`
One quick story against the running site, with 30 people and 7 seats: create a sale → open → each person gets one ticket token (a second request is refused) → enters (a retry gets the same receipt, a reuse is refused) → a forged ticket is refused → an illegal jump to "draw" is refused → close → lock (30 entries sealed, a person's proof matches the root) → draw → winners claim, except two who stay silent → their seats pass to the next people on the waitlist → check the safety counters are zero and the audit log is unbroken. It prints `SMOKE OK` if everything held.

## C. Quick safety check (the "protection self-test", 18 cases)
Button: **Admin → Control Room → Quick safety check**. Code: `attack_engine/selftest.py`.
Each case has its expected answer written down BEFORE the request is sent, so a wrong accept (**false negative**) or wrong reject (**false positive**) shows as a red row.

| Group | Cases | Expected |
|---|---|---|
| Real people | honest entry, retry after glitch, honest entry after someone else's forgery, flooded person from a clean IP, normal person during a flood | accepted |
| Cheating | reuse a token, forged signature, tampered token, second token request, no sign-in, signed up after cutoff | rejected |
| Decoy | bot uses the hidden "fast" endpoint | looks accepted, never in the real list |
| Overload | 150 requests from one IP | some throttled, site stays up |
| Timing | entry after close, token after close | rejected |
| After the lock | list contains the honest entry; list has exactly the legitimate entries; safety counters zero | as stated |

## D. The 7 experiments (`attack_engine`, results in `reports/`)
Run with `scripts/run_all_experiments.sh`. Each uses real bot traffic at scale and compares first-come-first-served, a plain lottery and Fair Drop on the same attempts.
They answer "does it hold under attack?", not "is the code correct?".

## E. Try to break it (the "red team", 14 tricks): `attack_engine/redteam.py`
We play the bot owner and try 14 real tricks against the live system (see [RED_TEAM.md](RED_TEAM.md)). Button: **Admin → Control Room → Try to break it**. Each hole it finds became a permanent code check (`TestOnePhoneIsOneIdentityAndCodesAreCapped`, `TestWrongGuessesKillTheCodeAndAdminIsLockedOut`, `TestRetryKeyBelongsToItsOwnTicketAndBigBodiesAreRefused`).

---

## How to run each kind

```bash
bash scripts/gotest.sh                        # A: Go tests
python scoring/test_scoring.py                # A: fairness maths
python verifier/test_verify.py                # A: Python vs Go
cd frontend && npx vitest run                 # A: browser maths (add FD_E2E=1 for the live blind-signature test)
python tests/smoke.py                         # B: smoke (defaults to http://localhost:8088)
# C: Admin → Control Room → Quick safety check
bash scripts/run_all_experiments.sh           # D
python -m attack_engine redteam               # E: try to break it
```

## What none of these prove
- They don't prove 50,000 people at the same instant (one laptop peaked around 2,000 connections). That needs several load machines.
- The scorecard checks that the server is consistent with the facts it can verify. It can't read a bot's "intent". A bot holding a genuine verified identity still gets one entry, like everyone else.
