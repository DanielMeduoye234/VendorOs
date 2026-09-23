// Package handler provides the Vercel Go Serverless Function entrypoint for VendorOS.
package handler

import (
	"log"
	"net/http"
	"os"
	"sync"

	"vendoros/backend/handlers"
	"vendoros/backend/store"
)

var (
	appHandler http.Handler
	initOnce   sync.Once
)

func initApp() {
	var dataStore store.DataStore
	dbURL := os.Getenv("DATABASE_URL")

	if dbURL != "" {
		pgStore, err := store.NewPostgresStore(dbURL)
		if err != nil {
			log.Printf("⚠️ Could not connect to Supabase PostgreSQL: %v\n", err)
			dataStore = store.NewStore()
		} else {
			dataStore = pgStore
		}
	} else {
		dataStore = store.NewStore()
	}

	api := handlers.NewHandler(dataStore)
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

	jwtSecret := os.Getenv("SUPABASE_JWT_SECRET")
	authLayer := handlers.AuthMiddleware(jwtSecret)

	cors := func(next http.Handler) http.Handler {
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

	appHandler = cors(authLayer(mux))
}

// Handler is exported for Vercel's Go Serverless runtime.
func Handler(w http.ResponseWriter, r *http.Request) {
	initOnce.Do(initApp)
	appHandler.ServeHTTP(w, r)
}
