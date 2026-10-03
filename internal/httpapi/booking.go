package httpapi

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/fairdrop/fairdrop/internal/booking"
)

// ------------------------------------------------------------ GET /api/shows

func (s *Server) handleListShows(w http.ResponseWriter, r *http.Request) {
	shows, err := s.book.ListShows(r.Context())
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db_error")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"shows": shows})
}

// ------------------------------------------------------- GET /api/shows/{id}

// handleSeatMap returns the show plus its full seat layout and live status.
func (s *Server) handleSeatMap(w http.ResponseWriter, r *http.Request) {
	m, err := s.book.SeatMap(r.Context(), chi.URLParam(r, "id"))
	if errors.Is(err, booking.ErrNotFound) {
		writeErr(w, http.StatusNotFound, "show_not_found")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db_error")
		return
	}
	writeJSON(w, http.StatusOK, m)
}

// -------------------------------------------------- POST /api/shows/{id}/book

type bookReq struct {
	Seats []string `json:"seats"`
}

func (s *Server) handleBook(w http.ResponseWriter, r *http.Request) {
	id, ok := identityFrom(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "missing_token")
		return
	}
	var req bookReq
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad_json")
		return
	}

	b, err := s.book.Book(r.Context(), chi.URLParam(r, "id"), id.UserID, id.Phone, req.Seats)
	switch {
	case err == nil:
		writeJSON(w, http.StatusOK, b)
	case errors.Is(err, booking.ErrNotFound):
		writeErr(w, http.StatusNotFound, "show_not_found")
	case errors.Is(err, booking.ErrBadSeatSelection):
		writeErr(w, http.StatusBadRequest, "bad_seat_selection")
	case errors.Is(err, booking.ErrSeatsTaken):
		writeErr(w, http.StatusConflict, "seats_unavailable")
	default:
		writeErr(w, http.StatusInternalServerError, "db_error")
	}
}

// --------------------------------------------------- GET /api/bookings/{id}

func (s *Server) handleGetBooking(w http.ResponseWriter, r *http.Request) {
	id, ok := identityFrom(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "missing_token")
		return
	}
	b, err := s.book.GetBooking(r.Context(), chi.URLParam(r, "id"), id.UserID)
	if errors.Is(err, booking.ErrNotFound) {
		writeErr(w, http.StatusNotFound, "booking_not_found")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db_error")
		return
	}
	writeJSON(w, http.StatusOK, b)
}
