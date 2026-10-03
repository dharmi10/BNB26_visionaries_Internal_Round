// Command server runs the baseline Fair Drop platform.
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"github.com/fairdrop/fairdrop/internal/booking"
	"github.com/fairdrop/fairdrop/internal/config"
	"github.com/fairdrop/fairdrop/internal/httpapi"
	"github.com/fairdrop/fairdrop/internal/store"
)

func main() {
	cfg := config.Load()

	rdb := store.Dial(cfg.RedisAddr, cfg.RedisDB, cfg.RedisPoolSize)
	st := store.New(rdb)
	defer st.Close()

	// Redis may still be starting up under compose, so wait rather than crash.
	if err := waitForRedis(st, 30*time.Second); err != nil {
		log.Fatalf("redis at %s unreachable: %v", cfg.RedisAddr, err)
	}
	if err := st.LoadScripts(context.Background()); err != nil {
		log.Fatalf("loading lua scripts: %v", err)
	}

	var bk *booking.Store
	if cfg.DatabaseURL != "" {
		var err error
		// A suspended Neon compute can take a few seconds to wake.
		bk, err = booking.Open(context.Background(), cfg.DatabaseURL, 60*time.Second)
		if err != nil {
			log.Fatalf("postgres unreachable: %v", err)
		}
		defer bk.Close()
		if err := migrate(bk, 5, 30*time.Second); err != nil {
			log.Fatalf("migrating postgres: %v", err)
		}
		log.Println("ticketing enabled: postgres schema ready, seed shows loaded")
	} else {
		log.Println("DATABASE_URL not set: ticketing disabled, baseline drop API only")
	}

	srv := &http.Server{
		Addr:    cfg.Addr,
		Handler: httpapi.New(cfg, st, bk),

		ReadHeaderTimeout: cfg.ReadHeaderTimeout,
		ReadTimeout:       cfg.ReadTimeout,
		WriteTimeout:      cfg.WriteTimeout,
		IdleTimeout:       cfg.IdleTimeout,
		MaxHeaderBytes:    16 << 10,
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		log.Printf("fair-drop baseline listening on %s (redis %s, pool %d)",
			cfg.Addr, cfg.RedisAddr, cfg.RedisPoolSize)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("http server: %v", err)
		}
	}()

	<-ctx.Done()
	log.Println("shutting down")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("graceful shutdown failed: %v", err)
	}
}

func waitForRedis(st *store.Store, budget time.Duration) error {
	deadline := time.Now().Add(budget)
	for {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		err := st.Ping(ctx)
		cancel()
		if err == nil {
			return nil
		}
		if time.Now().After(deadline) {
			return err
		}
		time.Sleep(250 * time.Millisecond)
	}
}

// migrate runs the idempotent schema+seed step with a per-attempt deadline.
// A connection that dies mid-query never answers, so without the deadline
// startup hangs forever; cancelling discards that connection and the next
// attempt dials a fresh one.
func migrate(bk *booking.Store, attempts int, perAttempt time.Duration) error {
	var err error
	for i := 1; i <= attempts; i++ {
		ctx, cancel := context.WithTimeout(context.Background(), perAttempt)
		err = bk.Migrate(ctx)
		cancel()
		if err == nil {
			return nil
		}
		log.Printf("migrate attempt %d/%d failed: %v", i, attempts, err)
	}
	return err
}
