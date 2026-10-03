package httpapi_test

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"

	"github.com/fairdrop/fairdrop/internal/config"
	"github.com/fairdrop/fairdrop/internal/drop"
	"github.com/fairdrop/fairdrop/internal/httpapi"
	"github.com/fairdrop/fairdrop/internal/store"
)

const (
	seatCount    = 500
	shopperCount = 2000
)

// TestAtomicBuyNeverOversells fires 2,000 simultaneous buys at a 500-seat drop
// and checks the three invariants the baseline must hold even with no bot
// defence whatsoever: exactly 500 seats sold, nothing oversold, and no user
// holding two seats.
func TestAtomicBuyNeverOversells(t *testing.T) {
	lab := newLab(t)
	dropID := lab.createDrop(t, seatCount, 300)
	shoppers := lab.newShoppers(t, shopperCount)

	outcomes, burst := lab.burst(t, dropID, "", shoppers)

	var got200, got409, got410 int
	seatsByUser := make(map[string]int64, seatCount)
	for _, o := range outcomes {
		switch o.status {
		case http.StatusOK:
			got200++
			var r struct {
				SeatNo int64 `json:"seat_no"`
			}
			if err := json.Unmarshal(o.body, &r); err != nil {
				t.Fatalf("decoding 200 body %q: %v", o.body, err)
			}
			seatsByUser[o.userID] = r.SeatNo
		case http.StatusConflict:
			got409++
		case http.StatusGone:
			got410++
		default:
			t.Fatalf("unexpected status %d from %s: %s", o.status, o.userID, o.body)
		}
	}

	t.Logf("%d concurrent buys against %d seats in %s",
		shopperCount, seatCount, burst.Round(time.Millisecond))
	t.Logf("responses: 200=%d  409=%d  410=%d", got200, got409, got410)

	// --- invariant 1: exactly seatCount winners ----------------------------
	if got200 != seatCount {
		t.Errorf("sold %d seats, want exactly %d", got200, seatCount)
	}
	if want := shopperCount - seatCount; got410 != want {
		t.Errorf("got %d sold_out responses, want %d", got410, want)
	}
	if got409 != 0 {
		t.Errorf("got %d already_bought responses, want 0 (each user bought once)", got409)
	}

	// --- invariant 2: seat numbers are a clean 1..seatCount permutation ----
	seen := make(map[int64]string, seatCount)
	for uid, seat := range seatsByUser {
		if seat < 1 || seat > seatCount {
			t.Errorf("user %s got seat %d, outside 1..%d", uid, seat, seatCount)
		}
		if prev, dup := seen[seat]; dup {
			t.Errorf("seat %d handed to both %s and %s", seat, prev, uid)
		}
		seen[seat] = uid
	}
	if len(seen) != seatCount {
		t.Errorf("got %d distinct seat numbers, want %d", len(seen), seatCount)
	}

	// --- invariant 3: the server's own books agree -------------------------
	res := lab.results(t, dropID)
	if res.Seats != seatCount {
		t.Errorf("results.seats = %d, want %d", res.Seats, seatCount)
	}
	if res.Sold != seatCount {
		t.Errorf("results.sold = %d, want %d", res.Sold, seatCount)
	}
	if res.Oversold != 0 {
		t.Errorf("results.oversold = %d, want 0", res.Oversold)
	}
	if len(res.Buyers) != seatCount {
		t.Fatalf("results listed %d buyers, want %d", len(res.Buyers), seatCount)
	}

	uniqueUsers := make(map[string]struct{}, seatCount)
	for _, b := range res.Buyers {
		if _, dup := uniqueUsers[b.UserID]; dup {
			t.Errorf("user %s appears twice in results", b.UserID)
		}
		uniqueUsers[b.UserID] = struct{}{}
		if b.Phone == "" || b.DeviceFP == "" || b.BoughtAtMS == 0 {
			t.Errorf("buyer %s has an incomplete record: %+v", b.UserID, b)
		}
	}

	t.Logf("results: seats=%d sold=%d oversold=%d duplicate_users=%d",
		res.Seats, res.Sold, res.Oversold, len(res.Buyers)-len(uniqueUsers))

	// Every attempt, won or lost, must be in the log with an IP and a time.
	attempts := lab.attempts(t, dropID)
	if len(attempts) != shopperCount {
		t.Errorf("logged %d attempts, want %d", len(attempts), shopperCount)
	}
	for _, a := range attempts {
		if a.IP == "" || a.AtMS == 0 {
			t.Fatalf("attempt missing IP or timestamp: %+v", a)
		}
	}
	t.Logf("attempt log: %d entries, all with client IP and timestamp", len(attempts))
}

// TestNaiveModeOversells is the control case. The same burst through the
// deliberately non-atomic path blows straight past capacity, which is the
// failure the Lua script exists to prevent.
func TestNaiveModeOversells(t *testing.T) {
	lab := newLab(t)
	dropID := lab.createDrop(t, seatCount, 300)
	shoppers := lab.newShoppers(t, shopperCount)

	outcomes, _ := lab.burst(t, dropID, "naive", shoppers)

	var got200 int
	for _, o := range outcomes {
		if o.status == http.StatusOK {
			got200++
		}
	}

	res := lab.results(t, dropID)
	t.Logf("naive mode: 200s=%d  sold=%d  seats=%d  OVERSOLD=%d",
		got200, res.Sold, res.Seats, res.Oversold)

	if res.Oversold == 0 {
		t.Errorf("naive mode sold %d of %d seats without overselling; "+
			"the race demo is not reproducing", res.Sold, res.Seats)
	}
}

// TestOneSeatPerUser covers the 409 contract directly: a second buy from the
// same token is refused and hands out no new seat.
func TestOneSeatPerUser(t *testing.T) {
	lab := newLab(t)
	dropID := lab.createDrop(t, 10, 300)
	tk := lab.login(t, 1)[0]

	status, body := lab.buy(lab.client, dropID, tk.jwt, "")
	if status != http.StatusOK {
		t.Fatalf("first buy: status %d, body %s", status, body)
	}

	status, body = lab.buy(lab.client, dropID, tk.jwt, "")
	if status != http.StatusConflict {
		t.Fatalf("second buy: status %d, want 409; body %s", status, body)
	}
	if !strings.Contains(string(body), "already_bought") {
		t.Errorf("second buy body = %s, want already_bought", body)
	}

	if res := lab.results(t, dropID); res.Sold != 1 {
		t.Errorf("sold = %d after one user bought twice, want 1", res.Sold)
	}
}

// TestSoldOutAndState walks a tiny drop to exhaustion and checks the state the
// front page polls.
func TestSoldOutAndState(t *testing.T) {
	lab := newLab(t)
	dropID := lab.createDrop(t, 2, 300)
	tokens := lab.login(t, 3)

	for i, tk := range tokens[:2] {
		if status, body := lab.buy(lab.client, dropID, tk.jwt, ""); status != http.StatusOK {
			t.Fatalf("buy %d: status %d, body %s", i, status, body)
		}
	}

	status, body := lab.buy(lab.client, dropID, tokens[2].jwt, "")
	if status != http.StatusGone {
		t.Fatalf("third buy: status %d, want 410; body %s", status, body)
	}
	if !strings.Contains(string(body), "sold_out") {
		t.Errorf("third buy body = %s, want sold_out", body)
	}

	d := lab.dropState(t, dropID)
	if d.SeatsLeft != 0 || d.State != drop.StateSoldOut {
		t.Errorf("drop state = %+v, want seats_left 0 and state sold_out", d)
	}
}

// TestBuyRequiresToken confirms the endpoint is not open to anonymous callers.
func TestBuyRequiresToken(t *testing.T) {
	lab := newLab(t)
	dropID := lab.createDrop(t, 10, 300)

	if status, _ := lab.buy(lab.client, dropID, "", ""); status != http.StatusUnauthorized {
		t.Errorf("anonymous buy: status %d, want 401", status)
	}
	if status, _ := lab.buy(lab.client, dropID, "not-a-jwt", ""); status != http.StatusUnauthorized {
		t.Errorf("garbage token: status %d, want 401", status)
	}
}

// TestMetricsExposed checks the Prometheus endpoint reports per-endpoint
// counts and latencies.
func TestMetricsExposed(t *testing.T) {
	lab := newLab(t)
	lab.createDrop(t, 5, 300)

	status, body := lab.do(lab.client, http.MethodGet, "/metrics", "", "")
	if status != http.StatusOK {
		t.Fatalf("metrics: status %d", status)
	}
	for _, want := range []string{
		`fairdrop_http_requests_total{endpoint="/admin/drops"`,
		"fairdrop_http_request_duration_seconds_bucket",
	} {
		if !strings.Contains(string(body), want) {
			t.Errorf("/metrics output is missing %q", want)
		}
	}
}

// ---------------------------------------------------------------- test harness

// lab is a running baseline platform backed by an in-process Redis.
type lab struct {
	srv    *httptest.Server
	client *http.Client
}

type token struct {
	userID string
	jwt    string
}

// shopper is one buyer plus its own HTTP client. Each client keeps a single
// pre-established keep-alive connection, so the burst below needs no new TCP
// handshakes -- otherwise 2,000 simultaneous dials overrun the listener's
// accept backlog and the test measures the OS rather than the seat allocator.
type shopper struct {
	token
	client *http.Client
}

type outcome struct {
	userID string
	status int
	body   []byte
}

func newLab(t *testing.T) *lab {
	t.Helper()

	mr := miniredis.RunT(t)
	rdb := store.Dial(mr.Addr(), 0, 256)
	st := store.New(rdb)
	t.Cleanup(func() { _ = st.Close() })

	cfg := config.Load()
	cfg.RedisAddr = mr.Addr()
	cfg.JWTSecret = []byte("test-secret")
	cfg.TokenTTL = time.Hour

	srv := httptest.NewServer(httpapi.New(cfg, st, nil))
	t.Cleanup(srv.Close)

	return &lab{srv: srv, client: newClient(64)}
}

func newClient(conns int) *http.Client {
	return &http.Client{
		Timeout: 60 * time.Second,
		Transport: &http.Transport{
			MaxIdleConns:        conns,
			MaxIdleConnsPerHost: conns,
			IdleConnTimeout:     90 * time.Second,
		},
	}
}

// newShoppers mints n users and warms one connection per user.
func (l *lab) newShoppers(t *testing.T, n int) []shopper {
	t.Helper()

	tokens := l.login(t, n)
	shoppers := make([]shopper, n)

	// Warm up with bounded concurrency so the handshakes are spread out.
	var wg sync.WaitGroup
	sem := make(chan struct{}, 64)
	for i, tk := range tokens {
		c := newClient(1)
		shoppers[i] = shopper{token: tk, client: c}

		wg.Add(1)
		go func(c *http.Client) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			if status, body := l.do(c, http.MethodGet, "/healthz", "", ""); status != http.StatusOK {
				t.Errorf("warming connection: status %d, body %s", status, body)
			}
		}(c)
	}
	wg.Wait()

	if t.Failed() {
		t.Fatalf("connection warm-up failed")
	}
	return shoppers
}

// burst releases every shopper's buy at the same instant.
func (l *lab) burst(t *testing.T, dropID, mode string, shoppers []shopper) ([]outcome, time.Duration) {
	t.Helper()

	outcomes := make([]outcome, len(shoppers))
	start := make(chan struct{})
	var ready, done sync.WaitGroup
	ready.Add(len(shoppers))
	done.Add(len(shoppers))

	for i, sh := range shoppers {
		go func(i int, sh shopper) {
			defer done.Done()
			ready.Done()
			<-start

			status, body := l.buy(sh.client, dropID, sh.jwt, mode)
			outcomes[i] = outcome{userID: sh.userID, status: status, body: body}
		}(i, sh)
	}

	ready.Wait()
	begin := time.Now()
	close(start)
	done.Wait()
	return outcomes, time.Since(begin)
}

func (l *lab) do(c *http.Client, method, path, body, bearer string) (int, []byte) {
	var rdr io.Reader
	if body != "" {
		rdr = strings.NewReader(body)
	}
	req, err := http.NewRequest(method, l.srv.URL+path, rdr)
	if err != nil {
		return 0, []byte(err.Error())
	}
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	res, err := c.Do(req)
	if err != nil {
		return 0, []byte(err.Error())
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(res.Body)
	return res.StatusCode, b
}

func (l *lab) buy(c *http.Client, dropID, bearer, mode string) (int, []byte) {
	path := "/baseline/" + dropID + "/buy"
	if mode != "" {
		path += "?mode=" + mode
	}
	return l.do(c, http.MethodPost, path, "", bearer)
}

func (l *lab) createDrop(t *testing.T, seats, windowSec int) string {
	t.Helper()
	status, body := l.do(l.client, http.MethodPost, "/admin/drops",
		fmt.Sprintf(`{"seats":%d,"window_sec":%d}`, seats, windowSec), "")
	if status != http.StatusOK {
		t.Fatalf("create drop: status %d, body %s", status, body)
	}
	var r struct {
		DropID string `json:"drop_id"`
	}
	if err := json.Unmarshal(body, &r); err != nil {
		t.Fatalf("decoding create response %s: %v", body, err)
	}
	if r.DropID == "" {
		t.Fatalf("create drop returned no drop_id: %s", body)
	}
	return r.DropID
}

// login mints n distinct users, each with its own phone and fingerprint.
func (l *lab) login(t *testing.T, n int) []token {
	t.Helper()

	tokens := make([]token, n)
	var wg sync.WaitGroup
	var failed atomic.Int64
	sem := make(chan struct{}, 64)

	for i := range n {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			status, body := l.do(l.client, http.MethodPost, "/auth/otp", fmt.Sprintf(
				`{"phone":"+1555%06d","device_fp":"fp-%06d"}`, i, i), "")
			if status != http.StatusOK {
				failed.Add(1)
				t.Errorf("login %d: status %d, body %s", i, status, body)
				return
			}
			var r struct {
				Token  string `json:"token"`
				UserID string `json:"user_id"`
			}
			if err := json.Unmarshal(body, &r); err != nil {
				failed.Add(1)
				t.Errorf("login %d: decoding %s: %v", i, body, err)
				return
			}
			tokens[i] = token{userID: r.UserID, jwt: r.Token}
		}(i)
	}
	wg.Wait()

	if failed.Load() > 0 {
		t.Fatalf("%d of %d logins failed", failed.Load(), n)
	}

	// Distinct phones must map to distinct users, or the burst would be
	// measuring a login bug instead of the seat allocator.
	seen := make(map[string]struct{}, n)
	for _, tk := range tokens {
		if _, dup := seen[tk.userID]; dup {
			t.Fatalf("two logins shared user_id %s", tk.userID)
		}
		seen[tk.userID] = struct{}{}
	}
	return tokens
}

type resultsBody struct {
	Seats    int64        `json:"seats"`
	Sold     int64        `json:"sold"`
	Oversold int64        `json:"oversold"`
	Buyers   []drop.Buyer `json:"buyers"`
}

func (l *lab) results(t *testing.T, dropID string) resultsBody {
	t.Helper()
	status, body := l.do(l.client, http.MethodGet, "/drops/"+dropID+"/results", "", "")
	if status != http.StatusOK {
		t.Fatalf("results: status %d, body %s", status, body)
	}
	var r resultsBody
	if err := json.Unmarshal(body, &r); err != nil {
		t.Fatalf("decoding results %s: %v", body, err)
	}
	return r
}

func (l *lab) attempts(t *testing.T, dropID string) []drop.Attempt {
	t.Helper()
	status, body := l.do(l.client, http.MethodGet, "/drops/"+dropID+"/attempts", "", "")
	if status != http.StatusOK {
		t.Fatalf("attempts: status %d, body %s", status, body)
	}
	var r struct {
		Attempts []drop.Attempt `json:"attempts"`
	}
	if err := json.Unmarshal(body, &r); err != nil {
		t.Fatalf("decoding attempts: %v", err)
	}
	return r.Attempts
}

type dropStateBody struct {
	Seats     int64      `json:"seats"`
	SeatsLeft int64      `json:"seats_left"`
	State     drop.State `json:"state"`
}

func (l *lab) dropState(t *testing.T, dropID string) dropStateBody {
	t.Helper()
	status, body := l.do(l.client, http.MethodGet, "/drops/"+dropID, "", "")
	if status != http.StatusOK {
		t.Fatalf("get drop: status %d, body %s", status, body)
	}
	var r dropStateBody
	if err := json.Unmarshal(body, &r); err != nil {
		t.Fatalf("decoding drop %s: %v", body, err)
	}
	return r
}
