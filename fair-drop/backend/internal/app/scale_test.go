package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"testing"
	"time"
)

// TestLockAndDrawAt50kEntries times the two heavy lifecycle steps at the size
// the brief cares about: 50,000 entries in one drop.
//
// Entries are written straight into the Redis hash that doLock reads, rather
// than through 50,000 HTTP registrations. The registration path has its own
// tests (concurrency, idempotency, token reuse); what is being measured here is
// the cost of building the Merkle tree, committing the root, deriving the
// randomness and ranking every entry — which is what runs while a real crowd is
// waiting for a result.
//
// Skips cleanly without a stack, exactly like the other integration tests.
func TestLockAndDrawAt50kEntries(t *testing.T) {
	const (
		entries  = 50_000
		goldSeat = 200
		genSeat  = 300
	)

	e := newEnv(t, true)
	ctx := context.Background()

	dropID := e.mkDrop(map[string]int{"gold": goldSeat, "general": genSeat}, 60, 60_000)

	// Build the entry hash directly: receipt -> "tier|arrival|replica", the
	// shape registerLua writes (see lua.go).
	tiers := []string{"gold", "general"}
	pipe := e.a.rdb.Pipeline()
	for i := 0; i < entries; i++ {
		sum := sha256.Sum256([]byte(fmt.Sprintf("scale-%s-%d", dropID, i)))
		rid := hex.EncodeToString(sum[:])
		tier := tiers[i%len(tiers)]
		pipe.HSet(ctx, dk(dropID, "entries"), rid, tier+"|"+fmt.Sprint(nowMS())+"|api-1")
		pipe.SAdd(ctx, dk(dropID, "spent"), rid)
		if i%5000 == 4999 {
			if _, err := pipe.Exec(ctx); err != nil {
				t.Fatalf("seeding entries at %d: %v", i, err)
			}
			pipe = e.a.rdb.Pipeline()
		}
	}
	if _, err := pipe.Exec(ctx); err != nil {
		t.Fatalf("seeding entries: %v", err)
	}

	n, err := e.a.rdb.HLen(ctx, dk(dropID, "entries")).Result()
	if err != nil || n != entries {
		t.Fatalf("entry hash holds %d entries (err %v), want %d", n, err, entries)
	}

	d, err := e.a.loadDrop(ctx, dropID)
	if err != nil {
		t.Fatalf("loadDrop: %v", err)
	}

	// ---- lock -----------------------------------------------------------
	lockExtra, lockPayload := map[string]any{}, map[string]any{}
	startLock := time.Now()
	if err := e.a.doLock(ctx, d, lockExtra, lockPayload); err != nil {
		t.Fatalf("doLock: %v", err)
	}
	lockTook := time.Since(startLock)

	root, _ := lockExtra["merkle_root"].(string)
	if len(root) != 64 {
		t.Fatalf("merkle_root is %q, want 32 bytes of hex", root)
	}
	if got := lockExtra["entry_count"]; got != entries {
		t.Fatalf("entry_count = %v, want %d", got, entries)
	}

	// doLock writes the commitment into `extra`; the real advance path persists
	// it. Persist it here so doDraw sees a locked drop, as it would in
	// production.
	if err := e.a.rdb.HSet(ctx, "drop:"+dropID, lockExtra).Err(); err != nil {
		t.Fatalf("persisting lock: %v", err)
	}
	if d, err = e.a.loadDrop(ctx, dropID); err != nil {
		t.Fatalf("reloading locked drop: %v", err)
	}

	// ---- draw -----------------------------------------------------------
	drawExtra, drawPayload := map[string]any{}, map[string]any{}
	startDraw := time.Now()
	if err := e.a.doDraw(ctx, d, drawExtra, drawPayload); err != nil {
		t.Fatalf("doDraw: %v", err)
	}
	drawTook := time.Since(startDraw)

	total := lockTook + drawTook

	// ---- correctness at scale -------------------------------------------
	// Exactly the advertised number of seats per tier, and no more.
	for tier, seats := range map[string]int{"gold": goldSeat, "general": genSeat} {
		won, err := e.a.rdb.LLen(ctx, dk(dropID, "result:"+tier)).Result()
		if err != nil {
			t.Fatalf("reading %s results: %v", tier, err)
		}
		if won < int64(seats) {
			t.Errorf("tier %s produced only %d ranked entries, want at least %d seats", tier, won, seats)
		}
	}
	ranked, err := e.a.rdb.HLen(ctx, dk(dropID, "rank")).Result()
	if err != nil {
		t.Fatalf("reading rank hash: %v", err)
	}
	if ranked != entries {
		t.Errorf("ranked %d entries, want all %d", ranked, entries)
	}

	seed, _ := drawExtra["seed"].(string)
	final, _ := drawExtra["final"].(string)
	if len(seed) != 64 || len(final) != 64 {
		t.Errorf("seed/final not published as 32-byte hex: seed=%q final=%q", seed, final)
	}

	t.Logf("50,000 entries | doLock %v | doDraw %v | total %v | root %s… | %d ranked",
		lockTook.Round(time.Millisecond),
		drawTook.Round(time.Millisecond),
		total.Round(time.Millisecond),
		root[:16], ranked)

	// Generous ceilings: this catches an accidental quadratic, not a slow
	// machine.
	if lockTook > 60*time.Second {
		t.Errorf("doLock took %v at 50k entries, which does not look linear", lockTook)
	}
	if drawTook > 60*time.Second {
		t.Errorf("doDraw took %v at 50k entries, which does not look linear", drawTook)
	}
}
