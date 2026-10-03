package httpapi

import (
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/prometheus/client_golang/prometheus"
)

// metrics holds the Prometheus collectors, registered on a private registry so
// tests can spin up several Servers in one process without a duplicate
// registration panic.
type metrics struct {
	registry *prometheus.Registry
	requests *prometheus.CounterVec
	latency  *prometheus.HistogramVec
	inflight prometheus.Gauge
}

func newMetrics() *metrics {
	m := &metrics{
		registry: prometheus.NewRegistry(),
		requests: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "fairdrop_http_requests_total",
			Help: "HTTP requests by endpoint, method and status code.",
		}, []string{"endpoint", "method", "status"}),
		latency: prometheus.NewHistogramVec(prometheus.HistogramOpts{
			Name: "fairdrop_http_request_duration_seconds",
			Help: "HTTP request latency by endpoint and method.",
			// Buckets skewed low: a buy is one Redis round trip, so the
			// interesting range is sub-millisecond to a few milliseconds.
			Buckets: []float64{
				0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5,
			},
		}, []string{"endpoint", "method"}),
		inflight: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "fairdrop_http_inflight_requests",
			Help: "Requests currently being served.",
		}),
	}
	m.registry.MustRegister(m.requests, m.latency, m.inflight)
	return m
}

// instrument times every request and labels it with the chi route pattern
// rather than the raw path, so that /drops/d00001 and /drops/d00002 share one
// low-cardinality series.
func (m *metrics) instrument(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		m.inflight.Inc()

		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)

		m.inflight.Dec()
		endpoint := routePattern(r)
		m.latency.WithLabelValues(endpoint, r.Method).Observe(time.Since(start).Seconds())
		m.requests.WithLabelValues(endpoint, r.Method, strconv.Itoa(rec.status)).Inc()
	})
}

func routePattern(r *http.Request) string {
	if rc := chi.RouteContext(r.Context()); rc != nil {
		if p := rc.RoutePattern(); p != "" {
			return p
		}
	}
	return "unmatched"
}

// statusRecorder remembers the status code without buffering the body.
type statusRecorder struct {
	http.ResponseWriter
	status      int
	wroteHeader bool
}

func (s *statusRecorder) WriteHeader(code int) {
	if s.wroteHeader {
		return
	}
	s.wroteHeader = true
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

func (s *statusRecorder) Write(b []byte) (int, error) {
	s.wroteHeader = true
	return s.ResponseWriter.Write(b)
}
