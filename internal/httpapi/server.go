// Package httpapi exposes the baseline drop platform over HTTP.
package httpapi

import (
	"encoding/json"
	"net"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/fairdrop/fairdrop/internal/booking"
	"github.com/fairdrop/fairdrop/internal/config"
	"github.com/fairdrop/fairdrop/internal/store"
	"github.com/fairdrop/fairdrop/web"
)

// Server wires the store and config into an http.Handler.
//
// It holds no mutable shared state, so nothing on the buy path contends on a
// process-level lock: every request goes straight to Redis.
type Server struct {
	cfg     config.Config
	store   *store.Store
	book    *booking.Store // nil disables the ticketing routes
	metrics *metrics
	router  chi.Router
}

// New builds the Server and its routes. bk may be nil, in which case only the
// baseline drop API and operator console are served.
func New(cfg config.Config, st *store.Store, bk *booking.Store) *Server {
	s := &Server{cfg: cfg, store: st, book: bk, metrics: newMetrics()}
	s.routes()
	return s
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.router.ServeHTTP(w, r)
}

func (s *Server) routes() {
	r := chi.NewRouter()
	r.Use(middleware.Recoverer)
	// Instrument inside chi so the route pattern is available as a label.
	r.Use(s.metrics.instrument)

	r.Get("/healthz", s.handleHealthz)
	r.Method(http.MethodGet, "/metrics", promhttp.HandlerFor(
		s.metrics.registry, promhttp.HandlerOpts{},
	))

	r.Post("/admin/drops", s.handleCreateDrop)
	r.Post("/auth/otp", s.handleOTP)

	r.Get("/drops/{id}", s.handleGetDrop)
	r.Get("/drops/{id}/results", s.handleResults)
	r.Get("/drops/{id}/attempts", s.handleAttempts)

	r.Group(func(pr chi.Router) {
		pr.Use(s.requireAuth)
		pr.Post("/baseline/{id}/buy", s.handleBuy)
	})

	if s.book != nil {
		r.Get("/api/shows", s.handleListShows)
		r.Get("/api/shows/{id}", s.handleSeatMap)
		r.Group(func(pr chi.Router) {
			pr.Use(s.requireAuth)
			pr.Post("/api/shows/{id}/book", s.handleBook)
			pr.Get("/api/bookings/{id}", s.handleGetBooking)
		})
	}

	// The ticketing site is a single page; the operator console for the
	// baseline drop lives at /console.
	r.Get("/", serveFile("index.html"))
	r.Get("/console", serveFile("console.html"))

	s.router = r
}

func serveFile(name string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		http.ServeFileFS(w, r, web.Files, name)
	}
}

// ------------------------------------------------------------------ plumbing

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}

// decodeJSON reads a small JSON body, rejecting unknown fields so a typo in a
// bot script surfaces as a 400 instead of a silently ignored parameter.
func decodeJSON(r *http.Request, dst any) error {
	dec := json.NewDecoder(http.MaxBytesReader(nil, r.Body, 16<<10))
	dec.DisallowUnknownFields()
	return dec.Decode(dst)
}

// clientIP resolves the caller's address, trusting proxy headers. There is no
// load balancer in the baseline, so this is almost always RemoteAddr -- the
// headers are honoured because the bot simulator uses them to fake source IPs.
func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if first, _, ok := strings.Cut(xff, ","); ok {
			return strings.TrimSpace(first)
		}
		return strings.TrimSpace(xff)
	}
	if xr := r.Header.Get("X-Real-IP"); xr != "" {
		return strings.TrimSpace(xr)
	}
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}
