// Package main is the entry point for the VendorOS Go server.
//
// ============================================================================
// 🎓 GOLANG LEARNING NOTE: The main() Function & Middleware Architecture
// ============================================================================
// 1. Dependency Injection with Interfaces:
//    Notice `var dataStore store.DataStore`.
//    Because both `store.Store` (in-memory) and `store.PostgresStore` (Supabase)
//    implement the exact same `store.DataStore` interface, we can switch
//    databases dynamically at startup with zero changes to our HTTP handlers!
//
// 2. Chaining Middlewares:
//    Middlewares in Go wrap handlers in layers:
//    Request ➔ Logging ➔ CORS ➔ Authentication ➔ Routing Mux ➔ Handler
// ============================================================================
package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/joho/godotenv"

	"vendoros/backend/handlers"
	"vendoros/backend/store"
)

// corsMiddleware injects necessary headers so our Next.js frontend can make API calls.
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, X-Requested-With, Origin, Cache-Control, Pragma")
		w.Header().Set("Access-Control-Max-Age", "86400")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// loggingMiddleware prints every HTTP request and its duration to the console.
func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("[%s] %s (duration: %v)\n", r.Method, r.URL.Path, time.Since(start))
	})
}

func main() {
	// Load .env configuration file if present
	_ = godotenv.Load()

	// 1. Determine Data Persistence (Supabase PostgreSQL vs In-Memory Fallback)
	var dataStore store.DataStore
	dbURL := os.Getenv("DATABASE_URL")

	if dbURL != "" {
		pgStore, err := store.NewPostgresStore(dbURL)
		if err != nil {
			log.Printf("⚠️ Could not connect to Supabase PostgreSQL: %v\n", err)
			log.Println("Falling back to thread-safe in-memory store...")
			dataStore = store.NewStore()
		} else {
			log.Println("✅ Successfully connected to Supabase PostgreSQL database pool!")
			dataStore = pgStore
		}
	} else {
		log.Println("ℹ️ No DATABASE_URL provided. Running with thread-safe in-memory store.")
		dataStore = store.NewStore()
	}

	// 2. Initialize HTTP handlers with dependency injection
	api := handlers.NewHandler(dataStore)

	// 3. Create the HTTP request router
	mux := http.NewServeMux()

	// Public routes
	mux.HandleFunc("/api/health", api.HealthCheck)
	mux.HandleFunc("/api/analytics", api.HandleAnalytics)

	// Vendors routes
	mux.HandleFunc("/api/vendors/", api.HandleVendorDetail)
	mux.HandleFunc("/api/vendors", api.HandleVendors)

	// Catalog & Price Comparison routes
	mux.HandleFunc("/api/catalog/compare", api.HandlePriceCompare)
	mux.HandleFunc("/api/catalog/orders", api.HandleProductOrderSummary)
	mux.HandleFunc("/api/catalog", api.HandleCatalog)

	// Products & Inventory routes
	mux.HandleFunc("/api/products/", api.HandleProductDetail)
	mux.HandleFunc("/api/products", api.HandleProducts)
	mux.HandleFunc("/api/inventory", api.HandleInventory)

	// Purchase Orders routes
	mux.HandleFunc("/api/orders/", api.HandleOrderStatus)
	mux.HandleFunc("/api/orders", api.HandleOrders)

	// Company Settings & Profile routes
	mux.HandleFunc("/api/settings", api.HandleSettings)

	// Demo Data & Sandbox Environment Management
	mux.HandleFunc("/api/demo/clear", api.HandleClearData)
	mux.HandleFunc("/api/demo/seed", api.HandleSeedData)

	// 4. Wrap with Middleware: Logging ➔ CORS ➔ Authentication
	jwtSecret := os.Getenv("SUPABASE_JWT_SECRET")
	authLayer := handlers.AuthMiddleware(jwtSecret)

	pipeline := loggingMiddleware(corsMiddleware(authLayer(mux)))

	// 5. Start Server
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	fmt.Println("==================================================")
	fmt.Println("🚀 VendorOS Golang Backend is running!")
	fmt.Printf("📡 REST API listening on http://localhost:%s\n", port)
	if jwtSecret != "" {
		fmt.Println("🔒 Supabase JWT Authentication: ENFORCED")
	} else {
		fmt.Println("🔓 Supabase JWT Authentication: DEV PASS-THROUGH (Set SUPABASE_JWT_SECRET to enforce)")
	}
	fmt.Println("==================================================")

	if err := http.ListenAndServe(":"+port, pipeline); err != nil {
		log.Fatalf("Server failed to start: %v\n", err)
	}
}
