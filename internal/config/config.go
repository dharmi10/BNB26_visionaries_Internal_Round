// Package config loads process configuration from the environment.
package config

import (
	"os"
	"runtime"
	"strconv"
	"time"
)

// Config holds every tunable the server needs. Defaults are chosen so that
// `go run ./cmd/server` works against a local Redis with no env set.
type Config struct {
	Addr      string
	RedisAddr string
	RedisDB   int
	JWTSecret []byte
	TokenTTL  time.Duration

	// RedisPoolSize bounds the connection pool. The buy path is a single
	// round trip, so the pool is the real concurrency limit on the hot path.
	RedisPoolSize int

	ReadHeaderTimeout time.Duration
	ReadTimeout       time.Duration
	WriteTimeout      time.Duration
	IdleTimeout       time.Duration
}

// Load reads the environment, applying defaults for anything unset.
func Load() Config {
	return Config{
		Addr:      env("ADDR", ":8080"),
		RedisAddr: env("REDIS_ADDR", "localhost:6379"),
		RedisDB:   envInt("REDIS_DB", 0),
		JWTSecret: []byte(env("JWT_SECRET", "dev-secret-change-me")),
		TokenTTL:  time.Duration(envInt("TOKEN_TTL_SEC", 3600)) * time.Second,

		RedisPoolSize: envInt("REDIS_POOL_SIZE", maxInt(64, runtime.NumCPU()*32)),

		// Deliberately short: a drop is a burst of tiny requests, so a slow
		// or stalled client should never hold a connection open for long.
		ReadHeaderTimeout: time.Duration(envInt("READ_HEADER_TIMEOUT_MS", 2000)) * time.Millisecond,
		ReadTimeout:       time.Duration(envInt("READ_TIMEOUT_MS", 5000)) * time.Millisecond,
		WriteTimeout:      time.Duration(envInt("WRITE_TIMEOUT_MS", 10000)) * time.Millisecond,
		IdleTimeout:       time.Duration(envInt("IDLE_TIMEOUT_MS", 60000)) * time.Millisecond,
	}
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func envInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
