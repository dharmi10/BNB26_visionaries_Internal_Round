// Package drop holds the domain types and rules for a limited-seat drop.
//
// This is the *baseline* platform: seats go to whoever's request lands first.
// There is no queueing, no lottery and no bot defence by design -- it exists so
// the bot simulator has something to beat, and so the fair version has a
// comparison baseline.
package drop

import (
	"errors"
	"time"
)

// State describes what a buyer can currently do with a drop.
type State string

const (
	// StatePending means the drop exists but has not opened yet.
	StatePending State = "pending"
	// StateOpen means seats are available right now.
	StateOpen State = "open"
	// StateSoldOut means every seat is gone.
	StateSoldOut State = "sold_out"
	// StateClosed means the sale window elapsed with seats still unsold.
	StateClosed State = "closed"
)

// Drop is a sale of a fixed number of seats inside a time window.
type Drop struct {
	ID         string `json:"drop_id"`
	Seats      int64  `json:"seats"`
	WindowSec  int64  `json:"window_sec"`
	OpensAtMS  int64  `json:"opens_at_ms"`
	ClosesAtMS int64  `json:"closes_at_ms"`
}

// Buyer is one user who holds a seat.
type Buyer struct {
	UserID     string `json:"user_id"`
	Phone      string `json:"phone"`
	DeviceFP   string `json:"device_fp"`
	SeatNo     int64  `json:"seat_no"`
	BoughtAtMS int64  `json:"bought_at_ms"`
}

// Attempt is one logged buy attempt, atomic or naive, won or lost. The bot lab
// reads these back to reconstruct who hammered the endpoint and how hard.
type Attempt struct {
	AtMS     int64  `json:"at_ms"`
	UserID   string `json:"user_id"`
	IP       string `json:"ip"`
	Mode     string `json:"mode"`
	Outcome  string `json:"outcome"`
	SeatNo   int64  `json:"seat_no"`
	DeviceFP string `json:"device_fp"`
}

// Buy outcomes, as reported by the store and mapped to HTTP codes by the API.
var (
	// ErrAlreadyBought means this user already holds a seat in this drop.
	ErrAlreadyBought = errors.New("already_bought")
	// ErrSoldOut means no seats remain.
	ErrSoldOut = errors.New("sold_out")
	// ErrClosed means the sale window has elapsed.
	ErrClosed = errors.New("closed")
	// ErrNotFound means no such drop.
	ErrNotFound = errors.New("drop_not_found")
)

// StateAt derives the drop's state from the clock and the number sold.
func (d Drop) StateAt(nowMS, sold int64) State {
	switch {
	case sold >= d.Seats:
		return StateSoldOut
	case nowMS < d.OpensAtMS:
		return StatePending
	case nowMS >= d.ClosesAtMS:
		return StateClosed
	default:
		return StateOpen
	}
}

// SeatsLeft never reports a negative number, even if a naive-mode run oversold.
func (d Drop) SeatsLeft(sold int64) int64 {
	if left := d.Seats - sold; left > 0 {
		return left
	}
	return 0
}

// NowMS is the current wall clock in Unix milliseconds, the unit used on the
// wire and in Redis throughout the platform.
func NowMS() int64 { return time.Now().UnixMilli() }
