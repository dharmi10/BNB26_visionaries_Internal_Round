package httpapi

import (
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/fairdrop/fairdrop/internal/drop"
)

func (s *Server) handleHealthz(w http.ResponseWriter, r *http.Request) {
	if err := s.store.Ping(r.Context()); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{
			"ok": false, "redis": err.Error(),
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "redis": "up"})
}

// ------------------------------------------------------------ POST /admin/drops

type createDropReq struct {
	Seats     int64 `json:"seats"`
	WindowSec int64 `json:"window_sec"`
}

type createDropResp struct {
	DropID string `json:"drop_id"`
	// OpensAt is RFC3339 for humans; OpensAtMS is the same instant in Unix
	// milliseconds, which is what the bot lab schedules against.
	OpensAt   string `json:"opens_at"`
	OpensAtMS int64  `json:"opens_at_ms"`
	Seats     int64  `json:"seats"`
	WindowSec int64  `json:"window_sec"`
}

func (s *Server) handleCreateDrop(w http.ResponseWriter, r *http.Request) {
	var req createDropReq
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad_json")
		return
	}
	if req.Seats <= 0 {
		writeErr(w, http.StatusBadRequest, "seats_must_be_positive")
		return
	}
	if req.WindowSec <= 0 {
		writeErr(w, http.StatusBadRequest, "window_sec_must_be_positive")
		return
	}

	d, err := s.store.CreateDrop(r.Context(), req.Seats, req.WindowSec)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "store_error")
		return
	}
	writeJSON(w, http.StatusOK, createDropResp{
		DropID:    d.ID,
		OpensAt:   time.UnixMilli(d.OpensAtMS).UTC().Format(time.RFC3339),
		OpensAtMS: d.OpensAtMS,
		Seats:     d.Seats,
		WindowSec: d.WindowSec,
	})
}

// --------------------------------------------------------------- GET /drops/{id}

type dropResp struct {
	DropID    string     `json:"drop_id"`
	Seats     int64      `json:"seats"`
	SeatsLeft int64      `json:"seats_left"`
	State     drop.State `json:"state"`
}

func (s *Server) handleGetDrop(w http.ResponseWriter, r *http.Request) {
	d, sold, ok := s.loadDrop(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, dropResp{
		DropID:    d.ID,
		Seats:     d.Seats,
		SeatsLeft: d.SeatsLeft(sold),
		State:     d.StateAt(drop.NowMS(), sold),
	})
}

// ----------------------------------------------------------------- POST /auth/otp

type otpReq struct {
	Phone    string `json:"phone"`
	DeviceFP string `json:"device_fp"`
}

type otpResp struct {
	Token  string `json:"token"`
	UserID string `json:"user_id"`
}

// handleOTP is a simulated login: there is no OTP challenge at all. Whoever
// presents a phone number gets a token for it.
func (s *Server) handleOTP(w http.ResponseWriter, r *http.Request) {
	var req otpReq
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad_json")
		return
	}
	if req.Phone == "" {
		writeErr(w, http.StatusBadRequest, "phone_required")
		return
	}

	uid, err := s.store.UpsertUser(r.Context(), req.Phone, req.DeviceFP)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "store_error")
		return
	}
	token, err := s.issueToken(Identity{UserID: uid, Phone: req.Phone, DeviceFP: req.DeviceFP})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "token_error")
		return
	}
	writeJSON(w, http.StatusOK, otpResp{Token: token, UserID: uid})
}

// --------------------------------------------------------- POST /baseline/{id}/buy

type buyResp struct {
	SeatNo int64 `json:"seat_no"`
}

// handleBuy is the hot path: first come, first served, one Redis round trip.
//
// ?mode=naive swaps the atomic Lua script for a deliberately racy
// read-then-write so that overselling can be demonstrated.
func (s *Server) handleBuy(w http.ResponseWriter, r *http.Request) {
	id, ok := identityFrom(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "missing_token")
		return
	}

	d, sold, ok := s.loadDrop(w, r)
	if !ok {
		return
	}

	now := drop.NowMS()
	mode := "atomic"
	if r.URL.Query().Get("mode") == "naive" {
		mode = "naive"
	}

	// Window checks happen before the seat allocation so a late buyer never
	// consumes a seat number.
	if state := d.StateAt(now, sold); state == drop.StatePending || state == drop.StateClosed {
		s.logAttempt(r, d.ID, id, mode, string(state), 0, now)
		writeErr(w, http.StatusGone, string(state))
		return
	}

	buyer := drop.Buyer{
		UserID:     id.UserID,
		Phone:      id.Phone,
		DeviceFP:   id.DeviceFP,
		BoughtAtMS: now,
	}

	var (
		seat int64
		err  error
	)
	if mode == "naive" {
		seat, err = s.store.BuyNaive(r.Context(), d, buyer)
	} else {
		seat, err = s.store.Buy(r.Context(), d, buyer)
	}

	switch {
	case err == nil:
		s.logAttempt(r, d.ID, id, mode, "bought", seat, now)
		writeJSON(w, http.StatusOK, buyResp{SeatNo: seat})
	case errors.Is(err, drop.ErrAlreadyBought):
		s.logAttempt(r, d.ID, id, mode, "already_bought", seat, now)
		writeErr(w, http.StatusConflict, "already_bought")
	case errors.Is(err, drop.ErrSoldOut):
		s.logAttempt(r, d.ID, id, mode, "sold_out", 0, now)
		writeErr(w, http.StatusGone, "sold_out")
	default:
		s.logAttempt(r, d.ID, id, mode, "error", 0, now)
		writeErr(w, http.StatusInternalServerError, "store_error")
	}
}

// ------------------------------------------------------- GET /drops/{id}/results

type resultsResp struct {
	Seats    int64        `json:"seats"`
	Sold     int64        `json:"sold"`
	Oversold int64        `json:"oversold"`
	Buyers   []drop.Buyer `json:"buyers"`
}

func (s *Server) handleResults(w http.ResponseWriter, r *http.Request) {
	d, _, ok := s.loadDrop(w, r)
	if !ok {
		return
	}
	buyers, err := s.store.Buyers(r.Context(), d.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "store_error")
		return
	}

	// sold counts seats actually handed out, so a naive-mode oversell is
	// visible here rather than hidden behind a clamped counter.
	sold := int64(len(buyers))
	oversold := sold - d.Seats
	if oversold < 0 {
		oversold = 0
	}
	writeJSON(w, http.StatusOK, resultsResp{
		Seats:    d.Seats,
		Sold:     sold,
		Oversold: oversold,
		Buyers:   buyers,
	})
}

// ------------------------------------------------------ GET /drops/{id}/attempts

// handleAttempts replays the per-attempt log (IP and timestamp included) that
// the bot lab uses to characterise attack traffic.
func (s *Server) handleAttempts(w http.ResponseWriter, r *http.Request) {
	d, _, ok := s.loadDrop(w, r)
	if !ok {
		return
	}
	attempts, err := s.store.Attempts(r.Context(), d.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "store_error")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"drop_id":  d.ID,
		"attempts": attempts,
	})
}

// ------------------------------------------------------------------- helpers

// loadDrop resolves {id} and its sold count, writing the error response itself
// if the drop is unknown.
func (s *Server) loadDrop(w http.ResponseWriter, r *http.Request) (drop.Drop, int64, bool) {
	id := chi.URLParam(r, "id")
	d, err := s.store.GetDrop(r.Context(), id)
	if errors.Is(err, drop.ErrNotFound) {
		writeErr(w, http.StatusNotFound, "drop_not_found")
		return drop.Drop{}, 0, false
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "store_error")
		return drop.Drop{}, 0, false
	}
	sold, err := s.store.Sold(r.Context(), id)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "store_error")
		return drop.Drop{}, 0, false
	}
	return d, sold, true
}

func (s *Server) logAttempt(r *http.Request, dropID string, id Identity, mode, outcome string, seat, atMS int64) {
	_ = s.store.LogAttempt(r.Context(), dropID, drop.Attempt{
		AtMS:     atMS,
		UserID:   id.UserID,
		IP:       clientIP(r),
		Mode:     mode,
		Outcome:  outcome,
		SeatNo:   seat,
		DeviceFP: id.DeviceFP,
	})
}
