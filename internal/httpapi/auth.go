package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Identity is the authenticated caller, carried on the request context.
//
// Phone and DeviceFP ride inside the token so the buy path needs no user
// lookup: one Redis round trip per buy, nothing else.
type Identity struct {
	UserID   string
	Phone    string
	DeviceFP string
}

type ctxKey struct{}

// claims is the JWT payload. There is no real OTP anywhere in this baseline --
// possession of a phone number is the whole login, which is precisely the
// weakness the bot lab is meant to exploit.
type claims struct {
	jwt.RegisteredClaims
	Phone    string `json:"phone"`
	DeviceFP string `json:"dfp"`
}

// issueToken signs an HS256 JWT for the given identity.
func (s *Server) issueToken(id Identity) (string, error) {
	now := time.Now()
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   id.UserID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(s.cfg.TokenTTL)),
		},
		Phone:    id.Phone,
		DeviceFP: id.DeviceFP,
	})
	return tok.SignedString(s.cfg.JWTSecret)
}

// parseToken verifies the signature and expiry and returns the identity.
func (s *Server) parseToken(raw string) (Identity, error) {
	var c claims
	_, err := jwt.ParseWithClaims(raw, &c, func(*jwt.Token) (any, error) {
		return s.cfg.JWTSecret, nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}))
	if err != nil {
		return Identity{}, err
	}
	if c.Subject == "" {
		return Identity{}, errors.New("token has no subject")
	}
	return Identity{UserID: c.Subject, Phone: c.Phone, DeviceFP: c.DeviceFP}, nil
}

// requireAuth rejects anything without a valid Bearer token.
func (s *Server) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw := bearer(r)
		if raw == "" {
			writeErr(w, http.StatusUnauthorized, "missing_token")
			return
		}
		id, err := s.parseToken(raw)
		if err != nil {
			writeErr(w, http.StatusUnauthorized, "invalid_token")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxKey{}, id)))
	})
}

func bearer(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if len(h) > 7 && strings.EqualFold(h[:7], "bearer ") {
		return strings.TrimSpace(h[7:])
	}
	return ""
}

func identityFrom(ctx context.Context) (Identity, bool) {
	id, ok := ctx.Value(ctxKey{}).(Identity)
	return id, ok
}
