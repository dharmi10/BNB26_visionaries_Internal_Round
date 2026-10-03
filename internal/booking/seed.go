package booking

import (
	"context"
	"fmt"
	"hash/fnv"
	"time"

	"github.com/jackc/pgx/v5"
)

const schema = `
CREATE TABLE IF NOT EXISTS shows (
	id           TEXT PRIMARY KEY,
	kind         TEXT NOT NULL,
	title        TEXT NOT NULL,
	tagline      TEXT NOT NULL DEFAULT '',
	about        TEXT NOT NULL DEFAULT '',
	language     TEXT NOT NULL DEFAULT '',
	format       TEXT NOT NULL DEFAULT '',
	certificate  TEXT NOT NULL DEFAULT '',
	duration_min INT  NOT NULL DEFAULT 0,
	genres       TEXT NOT NULL DEFAULT '',
	rating       NUMERIC(3,1) NOT NULL DEFAULT 0,
	votes        TEXT NOT NULL DEFAULT '',
	venue        TEXT NOT NULL,
	city         TEXT NOT NULL,
	starts_at    TIMESTAMPTZ NOT NULL,
	poster_from  TEXT NOT NULL DEFAULT '#333',
	poster_to    TEXT NOT NULL DEFAULT '#111'
);

CREATE TABLE IF NOT EXISTS seat_categories (
	show_id     TEXT NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
	code        TEXT NOT NULL,
	name        TEXT NOT NULL,
	price_paise INT  NOT NULL,
	sort        INT  NOT NULL,
	PRIMARY KEY (show_id, code)
);

CREATE TABLE IF NOT EXISTS seats (
	show_id    TEXT NOT NULL,
	seat_id    TEXT NOT NULL,
	row_label  TEXT NOT NULL,
	row_order  INT  NOT NULL,
	col        INT  NOT NULL,
	num        INT  NOT NULL,
	category   TEXT NOT NULL,
	status     TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'sold')),
	booking_id TEXT,
	PRIMARY KEY (show_id, seat_id),
	FOREIGN KEY (show_id, category) REFERENCES seat_categories(show_id, code) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bookings (
	id           TEXT PRIMARY KEY,
	show_id      TEXT NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
	user_id      TEXT NOT NULL,
	phone        TEXT NOT NULL,
	seats        TEXT[] NOT NULL,
	ticket_paise INT NOT NULL,
	fee_paise    INT NOT NULL,
	total_paise  INT NOT NULL,
	created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bookings_user_idx ON bookings (user_id, created_at DESC);
`

// segment is a run of adjacent seats starting at grid column Start.
type segment struct{ Start, Count int }

type rowBlock struct {
	Labels   string // drawn top to bottom
	Segments []segment
}

type seedCategory struct {
	Code, Name string
	PriceRs    int
	Rows       []rowBlock
	SoldPct    uint32 // share of seats pre-sold, for a lived-in map
}

type seedShow struct {
	Show
	Categories []seedCategory // furthest from the screen first
}

// ist avoids depending on tzdata, which the alpine runtime image lacks.
var ist = time.FixedZone("IST", 5*3600+1800)

func at(daysAhead, hour, min int) time.Time {
	n := time.Now().In(ist)
	return time.Date(n.Year(), n.Month(), n.Day()+daysAhead, hour, min, 0, 0, ist)
}

func seedShows() []seedShow {
	return []seedShow{
		{
			Show: Show{
				ID: "neon-horizon", Kind: "movie", Title: "Neon Horizon",
				Tagline:  "The last city on Earth never sleeps.",
				About:    "When a power-grid engineer uncovers a signal buried under the city's neon skyline, she has one night to decide whether to switch the lights off for good. A slow-burn sci-fi thriller shot entirely after dark.",
				Language: "English", Format: "2D", Certificate: "UA16+", DurationMin: 148,
				Genres: "Sci-Fi, Thriller", Rating: 8.7, Votes: "24.6K",
				Venue: "Galaxy Cinemas: Central Mall, Andheri", City: "Mumbai",
				StartsAt: at(1, 19, 30), PosterFrom: "#0f2027", PosterTo: "#2c8a9e",
			},
			Categories: []seedCategory{
				{Code: "RCL", Name: "Recliner", PriceRs: 450, SoldPct: 40, Rows: []rowBlock{
					{Labels: "NM", Segments: []segment{{3, 8}, {12, 8}}},
				}},
				{Code: "PRM", Name: "Prime", PriceRs: 250, SoldPct: 35, Rows: []rowBlock{
					{Labels: "LKJIHGF", Segments: []segment{{1, 4}, {6, 11}, {18, 4}}},
				}},
				{Code: "CLS", Name: "Classic", PriceRs: 180, SoldPct: 20, Rows: []rowBlock{
					{Labels: "EDCB", Segments: []segment{{1, 4}, {6, 11}, {18, 4}}},
					{Labels: "A", Segments: []segment{{6, 11}}},
				}},
			},
		},
		{
			Show: Show{
				ID: "midnight-echoes", Kind: "concert", Title: "The Lumen Collective: Midnight Echoes Tour",
				Tagline:  "One night. Every song. Live.",
				About:    "The Lumen Collective bring their Midnight Echoes tour home for a single seated show, with a full live band, a string section and the new record played front to back. Gates open 90 minutes before showtime.",
				Language: "English, Hindi", Format: "Live", Certificate: "16+", DurationMin: 180,
				Genres: "Indie Pop, Electronic", Rating: 9.2, Votes: "3.1K",
				Venue: "Skyline Arena, Whitefield", City: "Bengaluru",
				StartsAt: at(3, 18, 0), PosterFrom: "#41295a", PosterTo: "#f84464",
			},
			Categories: []seedCategory{
				{Code: "GLD", Name: "Gold", PriceRs: 1499, SoldPct: 30, Rows: []rowBlock{
					{Labels: "LKJIH", Segments: []segment{{1, 11}, {14, 11}}},
				}},
				{Code: "PLT", Name: "Platinum", PriceRs: 2999, SoldPct: 45, Rows: []rowBlock{
					{Labels: "GFED", Segments: []segment{{2, 10}, {14, 10}}},
				}},
				{Code: "VIP", Name: "VIP Lounge", PriceRs: 4999, SoldPct: 60, Rows: []rowBlock{
					{Labels: "CBA", Segments: []segment{{4, 8}, {14, 8}}},
				}},
			},
		},
	}
}

// Migrate creates the schema and inserts the seed shows if they are missing.
// It never touches a show that already exists, so bookings survive restarts.
func (s *Store) Migrate(ctx context.Context) error {
	if _, err := s.db.Exec(ctx, schema); err != nil {
		return fmt.Errorf("schema: %w", err)
	}
	for _, ss := range seedShows() {
		if err := s.seedShow(ctx, ss); err != nil {
			return fmt.Errorf("seed %s: %w", ss.ID, err)
		}
	}
	return nil
}

func (s *Store) seedShow(ctx context.Context, ss seedShow) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	sh := ss.Show
	tag, err := tx.Exec(ctx, `
		INSERT INTO shows (id, kind, title, tagline, about, language, format, certificate,
			duration_min, genres, rating, votes, venue, city, starts_at, poster_from, poster_to)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
		ON CONFLICT (id) DO NOTHING`,
		sh.ID, sh.Kind, sh.Title, sh.Tagline, sh.About, sh.Language, sh.Format, sh.Certificate,
		sh.DurationMin, sh.Genres, sh.Rating, sh.Votes, sh.Venue, sh.City, sh.StartsAt,
		sh.PosterFrom, sh.PosterTo)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return nil // already seeded
	}

	var seats [][]any
	rowOrder := 0
	for i, c := range ss.Categories {
		if _, err := tx.Exec(ctx,
			`INSERT INTO seat_categories (show_id, code, name, price_paise, sort) VALUES ($1,$2,$3,$4,$5)`,
			sh.ID, c.Code, c.Name, c.PriceRs*100, i); err != nil {
			return err
		}
		for _, rb := range c.Rows {
			for _, l := range rb.Labels {
				label := string(l)
				rowOrder++
				num := 0
				for _, seg := range rb.Segments {
					for k := 0; k < seg.Count; k++ {
						num++
						id := fmt.Sprintf("%s%d", label, num)
						status := "available"
						if presold(sh.ID+id, c.SoldPct) {
							status = "sold"
						}
						seats = append(seats, []any{sh.ID, id, label, rowOrder, seg.Start + k, num, c.Code, status})
					}
				}
			}
		}
	}
	if _, err := tx.CopyFrom(ctx, pgx.Identifier{"seats"},
		[]string{"show_id", "seat_id", "row_label", "row_order", "col", "num", "category", "status"},
		pgx.CopyFromRows(seats)); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// presold deterministically marks a share of seats as already sold.
func presold(key string, pct uint32) bool {
	h := fnv.New32a()
	h.Write([]byte(key))
	return h.Sum32()%100 < pct
}
