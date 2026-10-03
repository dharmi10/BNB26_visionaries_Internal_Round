// Package store is the only place that talks to Redis.
package store

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/fairdrop/fairdrop/internal/drop"
)

// Store wraps a Redis client with the drop platform's key schema.
type Store struct {
	rdb *redis.Client
}

// New builds a Store over an existing client.
func New(rdb *redis.Client) *Store { return &Store{rdb: rdb} }

// Dial connects to Redis with a pool sized for a burst of concurrent buys.
func Dial(addr string, db, poolSize int) *redis.Client {
	return redis.NewClient(&redis.Options{
		Addr:     addr,
		DB:       db,
		PoolSize: poolSize,
		// A drop is thousands of tiny requests at once: queue them on the pool
		// rather than erroring out, but never block a buyer indefinitely.
		PoolTimeout:  3 * time.Second,
		DialTimeout:  3 * time.Second,
		ReadTimeout:  3 * time.Second,
		WriteTimeout: 3 * time.Second,
		MinIdleConns: poolSize / 4,
	})
}

// Ping checks connectivity, for /healthz.
func (s *Store) Ping(ctx context.Context) error { return s.rdb.Ping(ctx).Err() }

// Close releases the connection pool.
func (s *Store) Close() error { return s.rdb.Close() }

// ---------------------------------------------------------------- key schema

func kDrop(id string) string       { return "drop:" + id }
func kSold(id string) string       { return "drop:" + id + ":sold" }
func kSeats(id string) string      { return "drop:" + id + ":seats" }
func kMeta(id string) string       { return "drop:" + id + ":meta" }
func kAttempts(id string) string   { return "drop:" + id + ":attempts" }
func kUserByPhone(p string) string { return "user:phone:" + p }
func kUser(id string) string       { return "user:" + id }

const (
	seqDrop = "seq:drop"
	seqUser = "seq:user"
)

// ------------------------------------------------------------------- the Lua

// buyScript allocates at most one seat per user and never oversells.
//
// Redis runs a script to completion with nothing interleaved, so the
// read-check-write sequence below is a single atomic step. That is the whole
// point: the naive path in BuyNaive does the same three operations as three
// separate round trips and loses the race.
//
//	KEYS[1] seats hash (user_id -> seat_no)
//	KEYS[2] sold counter (the seat allocator)
//	KEYS[3] meta hash  (user_id -> "bought_at_ms|phone|device_fp")
//	ARGV[1] capacity  ARGV[2] user_id  ARGV[3] now_ms
//	ARGV[4] phone     ARGV[5] device_fp
//
// Returns {code, seat_no}: 0 = bought, 1 = already_bought, 2 = sold_out.
var buyScript = redis.NewScript(`
local capacity = tonumber(ARGV[1])
local user_id  = ARGV[2]

local existing = redis.call('HGET', KEYS[1], user_id)
if existing then
  return {1, tonumber(existing)}
end

local seat = redis.call('INCR', KEYS[2])
if seat > capacity then
  -- Roll the allocator back so the counter settles at exactly capacity
  -- instead of drifting up once with every losing attempt.
  redis.call('DECR', KEYS[2])
  return {2, 0}
end

redis.call('HSET', KEYS[1], user_id, seat)
redis.call('HSET', KEYS[3], user_id, ARGV[3] .. '|' .. ARGV[4] .. '|' .. ARGV[5])
return {0, seat}
`)

// LoadScripts primes the script cache so the first buy of a drop is not slower
// than the rest.
func (s *Store) LoadScripts(ctx context.Context) error {
	return buyScript.Load(ctx, s.rdb).Err()
}

// ------------------------------------------------------------------- drops

// CreateDrop stores a drop that opens immediately and closes windowSec later.
func (s *Store) CreateDrop(ctx context.Context, seats, windowSec int64) (drop.Drop, error) {
	n, err := s.rdb.Incr(ctx, seqDrop).Result()
	if err != nil {
		return drop.Drop{}, err
	}
	now := drop.NowMS()
	d := drop.Drop{
		ID:         fmt.Sprintf("d%05d", n),
		Seats:      seats,
		WindowSec:  windowSec,
		OpensAtMS:  now,
		ClosesAtMS: now + windowSec*1000,
	}
	err = s.rdb.HSet(ctx, kDrop(d.ID), map[string]any{
		"seats":        d.Seats,
		"window_sec":   d.WindowSec,
		"opens_at_ms":  d.OpensAtMS,
		"closes_at_ms": d.ClosesAtMS,
	}).Err()
	if err != nil {
		return drop.Drop{}, err
	}
	return d, nil
}

// GetDrop loads a drop by id, returning drop.ErrNotFound if it is unknown.
func (s *Store) GetDrop(ctx context.Context, id string) (drop.Drop, error) {
	h, err := s.rdb.HGetAll(ctx, kDrop(id)).Result()
	if err != nil {
		return drop.Drop{}, err
	}
	if len(h) == 0 {
		return drop.Drop{}, drop.ErrNotFound
	}
	return drop.Drop{
		ID:         id,
		Seats:      atoi64(h["seats"]),
		WindowSec:  atoi64(h["window_sec"]),
		OpensAtMS:  atoi64(h["opens_at_ms"]),
		ClosesAtMS: atoi64(h["closes_at_ms"]),
	}, nil
}

// Sold reports how many seats have actually been handed out. It counts buyer
// records rather than reading the allocator, so a naive-mode oversell shows up
// here as a number larger than capacity.
func (s *Store) Sold(ctx context.Context, id string) (int64, error) {
	return s.rdb.HLen(ctx, kSeats(id)).Result()
}

// ------------------------------------------------------------------- buying

// Buy atomically grants userID one seat in the drop.
func (s *Store) Buy(ctx context.Context, d drop.Drop, b drop.Buyer) (int64, error) {
	res, err := buyScript.Run(ctx, s.rdb,
		[]string{kSeats(d.ID), kSold(d.ID), kMeta(d.ID)},
		d.Seats, b.UserID, b.BoughtAtMS, sanitize(b.Phone), sanitize(b.DeviceFP),
	).Result()
	if err != nil {
		return 0, err
	}
	code, seat, err := parseBuyResult(res)
	if err != nil {
		return 0, err
	}
	switch code {
	case 0:
		return seat, nil
	case 1:
		return seat, drop.ErrAlreadyBought
	default:
		return 0, drop.ErrSoldOut
	}
}

// BuyNaive is deliberately broken. It performs the same read-check-write as the
// Lua script, but as separate round trips, so concurrent buyers all read the
// same stale count and oversell the drop. It exists only to demonstrate the
// failure the atomic path prevents -- never use it for a real sale.
func (s *Store) BuyNaive(ctx context.Context, d drop.Drop, b drop.Buyer) (int64, error) {
	sold, err := s.rdb.Get(ctx, kSold(d.ID)).Int64()
	if err != nil && !errors.Is(err, redis.Nil) {
		return 0, err
	}
	if sold >= d.Seats {
		return 0, drop.ErrSoldOut
	}

	existing, err := s.rdb.HGet(ctx, kSeats(d.ID), b.UserID).Int64()
	if err == nil {
		return existing, drop.ErrAlreadyBought
	}
	if !errors.Is(err, redis.Nil) {
		return 0, err
	}

	// The race: every concurrent caller that read the same `sold` above now
	// claims the same seat number and clobbers the counter with the same value.
	seat := sold + 1
	pipe := s.rdb.Pipeline()
	pipe.Set(ctx, kSold(d.ID), seat, 0)
	pipe.HSet(ctx, kSeats(d.ID), b.UserID, seat)
	pipe.HSet(ctx, kMeta(d.ID), b.UserID,
		fmt.Sprintf("%d|%s|%s", b.BoughtAtMS, sanitize(b.Phone), sanitize(b.DeviceFP)))
	if _, err := pipe.Exec(ctx); err != nil {
		return 0, err
	}
	return seat, nil
}

// LogAttempt records one buy attempt for the bot lab to analyse later.
func (s *Store) LogAttempt(ctx context.Context, dropID string, a drop.Attempt) error {
	rec := strings.Join([]string{
		strconv.FormatInt(a.AtMS, 10),
		sanitize(a.UserID),
		sanitize(a.IP),
		sanitize(a.Mode),
		sanitize(a.Outcome),
		strconv.FormatInt(a.SeatNo, 10),
		sanitize(a.DeviceFP),
	}, "|")
	return s.rdb.RPush(ctx, kAttempts(dropID), rec).Err()
}

// Attempts reads back the attempt log in the order it was written.
func (s *Store) Attempts(ctx context.Context, dropID string) ([]drop.Attempt, error) {
	raw, err := s.rdb.LRange(ctx, kAttempts(dropID), 0, -1).Result()
	if err != nil {
		return nil, err
	}
	out := make([]drop.Attempt, 0, len(raw))
	for _, r := range raw {
		p := strings.Split(r, "|")
		if len(p) != 7 {
			continue
		}
		out = append(out, drop.Attempt{
			AtMS:     atoi64(p[0]),
			UserID:   p[1],
			IP:       p[2],
			Mode:     p[3],
			Outcome:  p[4],
			SeatNo:   atoi64(p[5]),
			DeviceFP: p[6],
		})
	}
	return out, nil
}

// Buyers returns everyone holding a seat, ordered by seat number.
func (s *Store) Buyers(ctx context.Context, dropID string) ([]drop.Buyer, error) {
	pipe := s.rdb.Pipeline()
	seatsCmd := pipe.HGetAll(ctx, kSeats(dropID))
	metaCmd := pipe.HGetAll(ctx, kMeta(dropID))
	if _, err := pipe.Exec(ctx); err != nil {
		return nil, err
	}

	seats := seatsCmd.Val()
	meta := metaCmd.Val()
	out := make([]drop.Buyer, 0, len(seats))
	for uid, seatStr := range seats {
		b := drop.Buyer{UserID: uid, SeatNo: atoi64(seatStr)}
		if p := strings.SplitN(meta[uid], "|", 3); len(p) == 3 {
			b.BoughtAtMS = atoi64(p[0])
			b.Phone = p[1]
			b.DeviceFP = p[2]
		}
		out = append(out, b)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].SeatNo != out[j].SeatNo {
			return out[i].SeatNo < out[j].SeatNo
		}
		return out[i].UserID < out[j].UserID
	})
	return out, nil
}

// ------------------------------------------------------------------- users

// UpsertUser returns the existing user for a phone number or creates one.
// Concurrent first-time logins for the same phone converge on one user_id.
func (s *Store) UpsertUser(ctx context.Context, phone, deviceFP string) (string, error) {
	if uid, err := s.rdb.Get(ctx, kUserByPhone(phone)).Result(); err == nil {
		return uid, s.touchUser(ctx, uid, phone, deviceFP)
	} else if !errors.Is(err, redis.Nil) {
		return "", err
	}

	n, err := s.rdb.Incr(ctx, seqUser).Result()
	if err != nil {
		return "", err
	}
	uid := fmt.Sprintf("u%06d", n)

	won, err := s.rdb.SetNX(ctx, kUserByPhone(phone), uid, 0).Result()
	if err != nil {
		return "", err
	}
	if !won {
		// Another login for the same phone got there first; adopt its id and
		// let the id we minted go unused.
		uid, err = s.rdb.Get(ctx, kUserByPhone(phone)).Result()
		if err != nil {
			return "", err
		}
	}
	return uid, s.touchUser(ctx, uid, phone, deviceFP)
}

func (s *Store) touchUser(ctx context.Context, uid, phone, deviceFP string) error {
	return s.rdb.HSet(ctx, kUser(uid), map[string]any{
		"phone":        phone,
		"device_fp":    deviceFP,
		"last_seen_ms": drop.NowMS(),
	}).Err()
}

// ------------------------------------------------------------------- helpers

func parseBuyResult(res any) (code, seat int64, err error) {
	vals, ok := res.([]any)
	if !ok || len(vals) != 2 {
		return 0, 0, fmt.Errorf("store: unexpected buy script result %#v", res)
	}
	code, err = toInt64(vals[0])
	if err != nil {
		return 0, 0, err
	}
	seat, err = toInt64(vals[1])
	return code, seat, err
}

func toInt64(v any) (int64, error) {
	switch n := v.(type) {
	case int64:
		return n, nil
	case int:
		return int64(n), nil
	case string:
		return atoi64(n), nil
	default:
		return 0, fmt.Errorf("store: cannot read %#v as int", v)
	}
}

func atoi64(s string) int64 {
	n, _ := strconv.ParseInt(s, 10, 64)
	return n
}

// sanitize keeps the pipe-delimited Redis encodings unambiguous.
func sanitize(s string) string { return strings.ReplaceAll(s, "|", "_") }
