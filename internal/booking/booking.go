// Package booking is the seat-map ticketing side of the platform: shows,
// seat layouts and bookings, kept in Postgres (Neon in production, a local
// container under compose).
//
// Unlike the baseline drop, a booking claims specific seats. The claim is a
// single conditional UPDATE inside a transaction, so two buyers racing for the
// same seat can never both win: the loser's UPDATE matches fewer rows than it
// asked for and the whole booking rolls back.
package booking

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// MaxSeatsPerBooking caps one booking, matching the seat-count picker.
const MaxSeatsPerBooking = 10

// FeePerSeatPaise is the flat convenience fee: ₹30 + 18% GST.
const FeePerSeatPaise = 3540

var (
	ErrNotFound         = errors.New("not found")
	ErrSeatsTaken       = errors.New("seats unavailable")
	ErrBadSeatSelection = errors.New("bad seat selection")
)

type Show struct {
	ID          string    `json:"id"`
	Kind        string    `json:"kind"` // "movie" | "concert"
	Title       string    `json:"title"`
	Tagline     string    `json:"tagline"`
	About       string    `json:"about"`
	Language    string    `json:"language"`
	Format      string    `json:"format"`
	Certificate string    `json:"certificate"`
	DurationMin int       `json:"duration_min"`
	Genres      string    `json:"genres"`
	Rating      float64   `json:"rating"`
	Votes       string    `json:"votes"`
	Venue       string    `json:"venue"`
	City        string    `json:"city"`
	StartsAt    time.Time `json:"starts_at"`
	PosterFrom  string    `json:"poster_from"`
	PosterTo    string    `json:"poster_to"`
	MinPrice    int       `json:"min_price_paise"`
	SeatsLeft   int       `json:"seats_left"`
}

type Category struct {
	Code       string `json:"code"`
	Name       string `json:"name"`
	PricePaise int    `json:"price_paise"`
}

type Seat struct {
	ID     string `json:"id"`
	Col    int    `json:"col"`
	Num    int    `json:"num"`
	Status string `json:"status"` // "available" | "sold"
}

type Row struct {
	Label    string `json:"label"`
	Category string `json:"category"`
	Seats    []Seat `json:"seats"`
}

type SeatMap struct {
	Show       Show       `json:"show"`
	Categories []Category `json:"categories"`
	Cols       int        `json:"cols"`
	Rows       []Row      `json:"rows"`
}

type Booking struct {
	ID          string    `json:"id"`
	ShowID      string    `json:"show_id"`
	UserID      string    `json:"user_id"`
	Phone       string    `json:"phone"`
	Seats       []string  `json:"seats"`
	TicketPaise int       `json:"ticket_paise"`
	FeePaise    int       `json:"fee_paise"`
	TotalPaise  int       `json:"total_paise"`
	CreatedAt   time.Time `json:"created_at"`
	Show        *Show     `json:"show,omitempty"`
}

type Store struct {
	db *pgxpool.Pool
}

// Open connects to Postgres, retrying for up to budget: a Neon compute may be
// waking from suspend, and the compose container may still be starting.
func Open(ctx context.Context, url string, budget time.Duration) (*Store, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, err
	}
	// NAT hops (Docker Desktop, the Neon pooler) silently drop idle TCP
	// connections; a query on one then waits forever for a reply. Recycle
	// idle connections and probe often so a dead one is discarded first.
	cfg.MaxConnIdleTime = 30 * time.Second
	cfg.HealthCheckPeriod = 15 * time.Second
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}
	deadline := time.Now().Add(budget)
	for {
		pctx, cancel := context.WithTimeout(ctx, 5*time.Second)
		err = pool.Ping(pctx)
		cancel()
		if err == nil {
			return &Store{db: pool}, nil
		}
		if time.Now().After(deadline) {
			pool.Close()
			return nil, err
		}
		time.Sleep(500 * time.Millisecond)
	}
}

func (s *Store) Close() { s.db.Close() }

func (s *Store) Ping(ctx context.Context) error { return s.db.Ping(ctx) }

// ------------------------------------------------------------------- reads

const showCols = `s.id, s.kind, s.title, s.tagline, s.about, s.language, s.format,
	s.certificate, s.duration_min, s.genres, s.rating::float8, s.votes, s.venue, s.city,
	s.starts_at, s.poster_from, s.poster_to,
	(SELECT COALESCE(MIN(price_paise), 0) FROM seat_categories c WHERE c.show_id = s.id),
	(SELECT COUNT(*) FROM seats t WHERE t.show_id = s.id AND t.status = 'available')`

func scanShow(row pgx.Row) (Show, error) {
	var sh Show
	err := row.Scan(&sh.ID, &sh.Kind, &sh.Title, &sh.Tagline, &sh.About, &sh.Language,
		&sh.Format, &sh.Certificate, &sh.DurationMin, &sh.Genres, &sh.Rating, &sh.Votes,
		&sh.Venue, &sh.City, &sh.StartsAt, &sh.PosterFrom, &sh.PosterTo, &sh.MinPrice, &sh.SeatsLeft)
	return sh, err
}

func (s *Store) ListShows(ctx context.Context) ([]Show, error) {
	rows, err := s.db.Query(ctx, `SELECT `+showCols+` FROM shows s ORDER BY s.starts_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Show{}
	for rows.Next() {
		sh, err := scanShow(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, sh)
	}
	return out, rows.Err()
}

func (s *Store) GetShow(ctx context.Context, id string) (Show, error) {
	sh, err := scanShow(s.db.QueryRow(ctx, `SELECT `+showCols+` FROM shows s WHERE s.id = $1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return Show{}, ErrNotFound
	}
	return sh, err
}

// SeatMap returns the show with its full layout, rows ordered as drawn
// (furthest from the screen first).
func (s *Store) SeatMap(ctx context.Context, id string) (SeatMap, error) {
	sh, err := s.GetShow(ctx, id)
	if err != nil {
		return SeatMap{}, err
	}
	m := SeatMap{Show: sh, Categories: []Category{}, Rows: []Row{}}

	crows, err := s.db.Query(ctx,
		`SELECT code, name, price_paise FROM seat_categories WHERE show_id = $1 ORDER BY sort`, id)
	if err != nil {
		return SeatMap{}, err
	}
	for crows.Next() {
		var c Category
		if err := crows.Scan(&c.Code, &c.Name, &c.PricePaise); err != nil {
			crows.Close()
			return SeatMap{}, err
		}
		m.Categories = append(m.Categories, c)
	}
	crows.Close()

	srows, err := s.db.Query(ctx, `
		SELECT t.row_label, t.category, t.seat_id, t.col, t.num, t.status
		FROM seats t JOIN seat_categories c ON c.show_id = t.show_id AND c.code = t.category
		WHERE t.show_id = $1
		ORDER BY c.sort, t.row_order, t.col`, id)
	if err != nil {
		return SeatMap{}, err
	}
	defer srows.Close()
	for srows.Next() {
		var label, cat string
		var st Seat
		if err := srows.Scan(&label, &cat, &st.ID, &st.Col, &st.Num, &st.Status); err != nil {
			return SeatMap{}, err
		}
		if n := len(m.Rows); n == 0 || m.Rows[n-1].Label != label {
			m.Rows = append(m.Rows, Row{Label: label, Category: cat})
		}
		r := &m.Rows[len(m.Rows)-1]
		r.Seats = append(r.Seats, st)
		if st.Col > m.Cols {
			m.Cols = st.Col
		}
	}
	return m, srows.Err()
}

// ------------------------------------------------------------------ writes

// Book claims every requested seat or none of them.
func (s *Store) Book(ctx context.Context, showID, userID, phone string, seatIDs []string) (Booking, error) {
	seatIDs = dedupe(seatIDs)
	if len(seatIDs) == 0 || len(seatIDs) > MaxSeatsPerBooking {
		return Booking{}, ErrBadSeatSelection
	}
	if _, err := s.GetShow(ctx, showID); err != nil {
		return Booking{}, err
	}

	b := Booking{ID: newBookingID(), ShowID: showID, UserID: userID, Phone: phone}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return Booking{}, err
	}
	defer tx.Rollback(ctx)

	// Rows are locked as they are matched; a concurrent booking of the same
	// seat blocks here, then re-checks status='available' and misses.
	rows, err := tx.Query(ctx, `
		UPDATE seats t SET status = 'sold', booking_id = $3
		FROM seat_categories c
		WHERE t.show_id = $1 AND t.seat_id = ANY($2) AND t.status = 'available'
		  AND c.show_id = t.show_id AND c.code = t.category
		RETURNING t.seat_id, c.price_paise`, showID, seatIDs, b.ID)
	if err != nil {
		return Booking{}, err
	}
	for rows.Next() {
		var id string
		var price int
		if err := rows.Scan(&id, &price); err != nil {
			rows.Close()
			return Booking{}, err
		}
		b.Seats = append(b.Seats, id)
		b.TicketPaise += price
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return Booking{}, err
	}
	if len(b.Seats) != len(seatIDs) {
		return Booking{}, ErrSeatsTaken
	}

	sortSeatIDs(b.Seats)
	b.FeePaise = FeePerSeatPaise * len(b.Seats)
	b.TotalPaise = b.TicketPaise + b.FeePaise
	err = tx.QueryRow(ctx, `
		INSERT INTO bookings (id, show_id, user_id, phone, seats, ticket_paise, fee_paise, total_paise)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING created_at`,
		b.ID, showID, userID, phone, b.Seats, b.TicketPaise, b.FeePaise, b.TotalPaise,
	).Scan(&b.CreatedAt)
	if err != nil {
		return Booking{}, err
	}
	return b, tx.Commit(ctx)
}

// GetBooking returns a booking only to the user who made it.
func (s *Store) GetBooking(ctx context.Context, id, userID string) (Booking, error) {
	var b Booking
	err := s.db.QueryRow(ctx, `
		SELECT id, show_id, user_id, phone, seats, ticket_paise, fee_paise, total_paise, created_at
		FROM bookings WHERE id = $1 AND user_id = $2`, id, userID,
	).Scan(&b.ID, &b.ShowID, &b.UserID, &b.Phone, &b.Seats, &b.TicketPaise, &b.FeePaise, &b.TotalPaise, &b.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Booking{}, ErrNotFound
	}
	if err != nil {
		return Booking{}, err
	}
	sh, err := s.GetShow(ctx, b.ShowID)
	if err != nil {
		return Booking{}, err
	}
	b.Show = &sh
	return b, nil
}

// ----------------------------------------------------------------- helpers

func newBookingID() string {
	var b [5]byte
	_, _ = rand.Read(b[:])
	return "BK" + strings.ToUpper(hex.EncodeToString(b[:]))
}

func dedupe(ids []string) []string {
	seen := make(map[string]bool, len(ids))
	out := ids[:0:0]
	for _, id := range ids {
		id = strings.ToUpper(strings.TrimSpace(id))
		if id != "" && !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	return out
}

// sortSeatIDs orders "A2" before "A10".
func sortSeatIDs(ids []string) {
	key := func(s string) (string, int) {
		i := strings.IndexFunc(s, func(r rune) bool { return r >= '0' && r <= '9' })
		if i < 0 {
			return s, 0
		}
		var n int
		fmt.Sscanf(s[i:], "%d", &n)
		return s[:i], n
	}
	sort.Slice(ids, func(i, j int) bool {
		ri, ni := key(ids[i])
		rj, nj := key(ids[j])
		if ri != rj {
			return ri < rj
		}
		return ni < nj
	})
}
