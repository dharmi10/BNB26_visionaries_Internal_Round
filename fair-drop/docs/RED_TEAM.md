# Red team: playing the bot owner

Goal: find ways for a bot owner to win more than "one entry per verified person", then fix them. Run it: `python -m attack_engine redteam`, or Admin → Control Room → **Try to break it**. 17 tricks (two rounds), each with the attacker's aim, the move, and a verdict (`held` / `BROKEN`).

## What the first run found (before any fix): 6 real holes
Saved as `reports/redteam/before_fix.json`.

| Trick | What worked | Why it matters | Fix |
|---|---|---|---|
| One phone, many identities | The same number written 5 ways ("+1 555…", "1-(555)…", "00 1555…") made 5 separate verified identities | Breaks "one person, one entry": one SIM could be many people | Phone reduced to digits before it becomes an identity |
| Guess a login code | Unlimited guesses on a 6-digit code | A distributed guesser takes over a victim's account | 5 wrong guesses destroy the code |
| Spam login codes | 8 of 8 codes sent to one number | SMS cost / harassment | Max 3 codes per number per 10 min |
| Guess the admin password | No lockout | Brute force of the admin login | 5 wrong passwords per address = 5 min lockout |
| Enormous requests | 64 MB bodies accepted on public endpoints | Memory exhaustion by a flood of huge requests | 64 KB cap at the gateway and the server |
| Hijack a retry key | Reusing someone's `Idempotency-Key` with your own ticket broke their safe retry (they got "token used") | Targeted griefing | The retry key is scoped to its own ticket |

After the fixes the same 14 tricks: 12 held, 1 informational, 1 demo-only (`reports/redteam/after_fix.json`). Each fix has a permanent Go test.

## Round 2: one more hole, two more checks
Saved as `reports/redteam/round2_before_fix.json` (before) and `after_fix_in_network.json` (after, run from inside the Docker network: 17 tricks, 15 held, 0 broken, the rest informational / demo-only).

| Trick | What worked | Fix |
|---|---|---|
| **Flood from the same address as real people** | 24 flooders on one address used up the address's quota, so a real person on the same office/campus/mobile address was told "too many requests" | Only *useless* requests (forged or reused tickets, repeated ticket asks) count against an address; a valid first-time request is never throttled by neighbours' noise (Go test `TestFlooderCannotLockOutNeighboursOnTheSameAddress`) |
| Hammer the big public download | Held: the finished list never changes, so it is cached | none needed |
| Hold 1,500 connections open (Slowloris) | Held from inside the network: silent connections are dropped after 10 s. From the host laptop Docker Desktop's port forwarder stalls under 1,500 hung connections; that is a laptop artefact, not the product | none needed |

## What already held
Ticket from another sale (400) · a login card with no signature (401) · reading the secret seed early (only its fingerprint is public) · reading tier crowding to pick the emptiest tier (hidden until the list is sealed) · a second ticket in another tier (409) · lying about the address in headers (the gateway overwrites it; 48 of 80 throttled).

## Not holes, but you should know
- **Identity farm**: a bot owner who owns many *genuinely verified* accounts gets one entry per account. Nothing in the entry flow can tell them apart from many people. Defence = the cost per verified account (see experiment 3 and the cost-per-seat figures).
- **Tier switch**: a blind signature can't carry the tier, so a ticket asked for in Gold can be entered as General. Harmless because crowding is hidden during the sale.
- **Demo secret**: the demo runs with published passwords, so a token signed with the demo JWT secret is accepted *here*. The server now refuses to start outside `TEST_MODE` with the demo admin password, JWT secret or test key.
- **Phone formats**: "5551234567" vs "15551234567" (national vs international) still differ; closing that needs a phone library with a default country.
- **Admin lockout is per address**: a distributed guesser gets 5 tries per address. Use a strong `ADMIN_PASSWORD`.
- Dev ports for Redis, Postgres and the three web servers are bound to 127.0.0.1 only.
- After rebuilding web servers, reload the gateway (`docker exec fd-nginx nginx -s reload`; `scripts/start.*` does it). The gateway resolves the servers once at start-up; without a reload one server takes all the load. This showed up for real during testing: one server handled 50,499 requests while the other two handled about 80 each.
