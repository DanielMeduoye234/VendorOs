// Package handlers provides HTTP API endpoints and authentication middlewares.
//
// ============================================================================
// 🎓 GOLANG LEARNING NOTE: Context & JWT Verification
// ============================================================================
// 1. `context.Context`:
//    In Go, `context` is used to carry deadlines, cancellation signals, and
//    request-scoped values (like the currently authenticated User ID) across
//    API boundaries and down through multiple function calls.
//
// 2. Custom Type for Context Keys:
//    To prevent key collisions between different packages using context values,
//    Go best practice dictates defining an unexported type:
//        type contextKey string
//        const UserIDKey contextKey = "user_id"
//
// 3. JWT Parsing:
//    Supabase signs JWTs using HMAC-SHA256. In Go, we parse and validate the
//    token signature using `jwt.Parse()`, ensuring nobody can forge a session.
// ============================================================================
package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

type contextKey string

const (
	UserIDKey    contextKey = "user_id"
	UserEmailKey contextKey = "user_email"
)

// AuthMiddleware creates a middleware that validates Supabase JWT access tokens.
// If jwtSecret is empty (development mode), it passes requests through with demo identity.
func AuthMiddleware(jwtSecret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Skip auth check for public endpoints and CORS OPTIONS preflights
			if r.Method == http.MethodOptions || r.URL.Path == "/api/health" {
				next.ServeHTTP(w, r)
				return
			}

			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				// If no JWT secret is configured yet, allow demo access in dev mode
				if jwtSecret == "" {
					ctx := context.WithValue(r.Context(), UserIDKey, "demo-user")
					ctx = context.WithValue(ctx, UserEmailKey, "procurement@vendoros.local")
					next.ServeHTTP(w, r.WithContext(ctx))
					return
				}
				respondError(w, http.StatusUnauthorized, "Missing Authorization header")
				return
			}

			// Format: "Bearer <token>"
			parts := strings.Split(authHeader, " ")
			if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
				respondError(w, http.StatusUnauthorized, "Invalid Authorization format. Expected 'Bearer <token>'")
				return
			}
			tokenStr := parts[1]

			// If no JWT secret configured yet, accept any bearer token in development
			if jwtSecret == "" {
				ctx := context.WithValue(r.Context(), UserIDKey, "demo-user")
				ctx = context.WithValue(ctx, UserEmailKey, "procurement@vendoros.local")
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}

			// Parse and validate JWT signature against Supabase JWT secret
			token, err := jwt.Parse(tokenStr, func(token *jwt.Token) (interface{}, error) {
				if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
					return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
				}
				return []byte(jwtSecret), nil
			})

			if err != nil || !token.Valid {
				respondError(w, http.StatusUnauthorized, "Invalid or expired session token: "+err.Error())
				return
			}

			claims, ok := token.Claims.(jwt.MapClaims)
			if !ok {
				respondError(w, http.StatusUnauthorized, "Invalid token claims")
				return
			}

			userID, _ := claims["sub"].(string)
			email, _ := claims["email"].(string)

			// Store authenticated user identity inside request context
			ctx := context.WithValue(r.Context(), UserIDKey, userID)
			ctx = context.WithValue(ctx, UserEmailKey, email)

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
