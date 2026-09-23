// Package handlers defines the HTTP API controller endpoints for VendorOS.
//
// ============================================================================
// 🎓 GOLANG LEARNING NOTE: HTTP Handlers & Idiomatic Error Handling
// ============================================================================
// 1. The http.HandlerFunc Interface:
//    Every standard HTTP handler in Go matches this signature:
//        func(w http.ResponseWriter, r *http.Request)
//    - `w http.ResponseWriter`: An interface used to send the status code,
//      headers, and body back to the client.
//    - `r *http.Request`: A pointer to the incoming HTTP request (headers,
//      URL query params, body stream, method).
//
// 2. No Exceptions (try/catch):
//    Go intentionally does NOT have exceptions. Functions return errors as
//    regular return values.
//        if err := json.NewDecoder(r.Body).Decode(&item); err != nil {
//            respondError(w, http.StatusBadRequest, "Invalid JSON body")
//            return
//        }
//    This makes control flow explicit, predictable, and impossible to hide.
//
// 3. Streaming JSON (json.NewDecoder vs json.Unmarshal):
//    - `json.NewDecoder(r.Body).Decode(&v)` streams data directly from the
//      network connection without buffering the entire payload into RAM.
//    - `json.NewEncoder(w).Encode(data)` streams JSON directly to the HTTP
//      socket, which is extremely fast and memory-efficient!
// ============================================================================
package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"vendoros/backend/models"
	"vendoros/backend/store"
)

// Handler holds references to application dependencies (like the database store).
// This is the idiomatic way to do Dependency Injection in Go!
type Handler struct {
	store store.DataStore
}

// NewHandler constructs a Handler with any store that satisfies store.DataStore.
func NewHandler(s store.DataStore) *Handler {
	return &Handler{store: s}
}

// ----------------------------------------------------------------------------
// Response Helpers
// ----------------------------------------------------------------------------

func respondJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if payload != nil {
		if err := json.NewEncoder(w).Encode(payload); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	}
}

func respondError(w http.ResponseWriter, status int, message string) {
	respondJSON(w, status, map[string]string{"error": message})
}

// ----------------------------------------------------------------------------
// Health & System
// ----------------------------------------------------------------------------

// HealthCheck returns the server status.
func (h *Handler) HealthCheck(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "healthy",
		"service": "VendorOS Go Backend",
		"version": "1.0.0",
	})
}

// ----------------------------------------------------------------------------
// Vendor Endpoints
// ----------------------------------------------------------------------------

// HandleVendors routes GET /api/vendors and POST /api/vendors.
func (h *Handler) HandleVendors(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		vendors := h.store.GetAllVendors()
		respondJSON(w, http.StatusOK, vendors)

	case http.MethodPost:
		var v models.Vendor
		if err := json.NewDecoder(r.Body).Decode(&v); err != nil {
			respondError(w, http.StatusBadRequest, "Invalid request payload: "+err.Error())
			return
		}
		v.Name = strings.TrimSpace(v.Name)
		v.ContactPerson = strings.TrimSpace(v.ContactPerson)
		v.Email = strings.TrimSpace(v.Email)
		v.Phone = strings.TrimSpace(v.Phone)
		v.Category = strings.TrimSpace(v.Category)
		if v.Name == "" {
			respondError(w, http.StatusBadRequest, "Vendor name is required")
			return
		}
		created := h.store.CreateVendor(v)
		respondJSON(w, http.StatusCreated, created)

	default:
		respondError(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

// HandleVendorDetail routes GET, PUT, and DELETE for /api/vendors/{id}.
func (h *Handler) HandleVendorDetail(w http.ResponseWriter, r *http.Request) {
	// Extract ID from path: /api/vendors/vnd_acme -> "vnd_acme"
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 || strings.TrimSpace(parts[2]) == "" {
		respondError(w, http.StatusBadRequest, "Missing vendor ID")
		return
	}
	id := strings.TrimSpace(parts[2])

	switch r.Method {
	case http.MethodGet:
		v, found := h.store.GetVendorByID(id)
		if !found {
			respondError(w, http.StatusNotFound, "Vendor not found")
			return
		}
		respondJSON(w, http.StatusOK, v)

	case http.MethodPut:
		var v models.Vendor
		if err := json.NewDecoder(r.Body).Decode(&v); err != nil {
			respondError(w, http.StatusBadRequest, "Invalid JSON body: "+err.Error())
			return
		}
		v.ID = id
		v.Name = strings.TrimSpace(v.Name)
		v.ContactPerson = strings.TrimSpace(v.ContactPerson)
		v.Email = strings.TrimSpace(v.Email)
		v.Phone = strings.TrimSpace(v.Phone)
		v.Category = strings.TrimSpace(v.Category)
		if v.Name == "" {
			respondError(w, http.StatusBadRequest, "Vendor name cannot be empty")
			return
		}
		updated, found := h.store.UpdateVendor(v)
		if !found {
			respondError(w, http.StatusNotFound, "Vendor not found")
			return
		}
		respondJSON(w, http.StatusOK, updated)

	case http.MethodDelete:
		if err := h.store.DeleteVendor(id); err != nil {
			if errors.Is(err, models.ErrActiveOrdersExist) {
				respondError(w, http.StatusBadRequest, "Cannot delete vendor: active in-flight purchase orders exist. Please deliver or cancel them first.")
				return
			}
			if errors.Is(err, models.ErrVendorNotFound) {
				respondError(w, http.StatusNotFound, "Vendor not found")
				return
			}
			respondError(w, http.StatusInternalServerError, err.Error())
			return
		}
		respondJSON(w, http.StatusOK, map[string]string{"message": "Vendor deleted successfully"})

	default:
		respondError(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

// ----------------------------------------------------------------------------
// Catalog & Price Comparison Endpoints
// ----------------------------------------------------------------------------

// HandleCatalog routes GET /api/catalog and POST /api/catalog.
func (h *Handler) HandleCatalog(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		items := h.store.GetAllCatalog()
		vendorFilter := r.URL.Query().Get("vendorId")
		skuFilter := r.URL.Query().Get("sku")

		if vendorFilter != "" || skuFilter != "" {
			filtered := make([]models.CatalogItem, 0)
			for _, it := range items {
				matchesVendor := vendorFilter == "" || it.VendorID == vendorFilter
				matchesSKU := skuFilter == "" || strings.EqualFold(it.SKU, skuFilter)
				if matchesVendor && matchesSKU {
					filtered = append(filtered, it)
				}
			}
			respondJSON(w, http.StatusOK, filtered)
			return
		}
		respondJSON(w, http.StatusOK, items)

	case http.MethodPost:
		var item models.CatalogItem
		if err := json.NewDecoder(r.Body).Decode(&item); err != nil {
			respondError(w, http.StatusBadRequest, "Invalid item payload: "+err.Error())
			return
		}
		if strings.TrimSpace(item.SKU) == "" || strings.TrimSpace(item.ItemName) == "" || strings.TrimSpace(item.VendorID) == "" {
			respondError(w, http.StatusBadRequest, "sku, itemName, and vendorId are required fields")
			return
		}

		created, err := h.store.CreateCatalogItem(item)
		if err != nil {
			if errors.Is(err, models.ErrVendorNotFound) {
				respondError(w, http.StatusNotFound, "Supplier not found")
				return
			}
			if errors.Is(err, models.ErrVendorSuspended) {
				respondError(w, http.StatusBadRequest, "Cannot add product: Supplier is currently SUSPENDED")
				return
			}
			if errors.Is(err, models.ErrInvalidProductPrice) {
				respondError(w, http.StatusBadRequest, "Unit price must be greater than $0.00")
				return
			}
			respondError(w, http.StatusInternalServerError, err.Error())
			return
		}
		respondJSON(w, http.StatusCreated, created)

	default:
		respondError(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

// HandleProductOrderSummary routes GET /api/catalog/orders?sku=BOLT-M4-TI.
func (h *Handler) HandleProductOrderSummary(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		respondError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	sku := r.URL.Query().Get("sku")
	if sku == "" {
		respondError(w, http.StatusBadRequest, "Query parameter 'sku' is required")
		return
	}

	summary := h.store.GetProductOrderSummary(sku)
	respondJSON(w, http.StatusOK, summary)
}

// HandlePriceCompare routes GET /api/catalog/compare?sku=BOLT-M4-TI.
func (h *Handler) HandlePriceCompare(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		respondError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	sku := r.URL.Query().Get("sku")
	if sku == "" {
		respondError(w, http.StatusBadRequest, "Query parameter 'sku' is required")
		return
	}

	comparison, found := h.store.ComparePrices(sku)
	if !found {
		respondError(w, http.StatusNotFound, "No vendor quotes found for SKU: "+sku)
		return
	}

	respondJSON(w, http.StatusOK, comparison)
}

// ----------------------------------------------------------------------------
// Products & Inventory Endpoints
// ----------------------------------------------------------------------------

// HandleProducts routes GET /api/products and POST /api/products.
func (h *Handler) HandleProducts(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		products := h.store.GetAllProducts()
		respondJSON(w, http.StatusOK, products)

	case http.MethodPost:
		var p models.Product
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			respondError(w, http.StatusBadRequest, "Invalid JSON body: "+err.Error())
			return
		}
		if strings.TrimSpace(p.Name) == "" {
			respondError(w, http.StatusBadRequest, "Product name is required")
			return
		}
		if strings.TrimSpace(p.SKU) == "" {
			respondError(w, http.StatusBadRequest, "Product SKU is required")
			return
		}
		created, err := h.store.CreateProduct(p)
		if err != nil {
			respondError(w, http.StatusBadRequest, err.Error())
			return
		}
		respondJSON(w, http.StatusCreated, created)

	default:
		respondError(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

// HandleProductDetail routes GET, PUT, and DELETE for /api/products/{id}.
func (h *Handler) HandleProductDetail(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 || strings.TrimSpace(parts[2]) == "" {
		respondError(w, http.StatusBadRequest, "Missing product ID")
		return
	}
	id := strings.TrimSpace(parts[2])

	switch r.Method {
	case http.MethodGet:
		p, found := h.store.GetProductByID(id)
		if !found {
			respondError(w, http.StatusNotFound, "Product not found")
			return
		}
		respondJSON(w, http.StatusOK, p)

	case http.MethodPut:
		var p models.Product
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			respondError(w, http.StatusBadRequest, "Invalid JSON body: "+err.Error())
			return
		}
		p.ID = id
		p.Name = strings.TrimSpace(p.Name)
		p.SKU = strings.ToUpper(strings.TrimSpace(p.SKU))
		p.Category = strings.TrimSpace(p.Category)
		if p.Name == "" {
			respondError(w, http.StatusBadRequest, "Product name cannot be empty")
			return
		}
		if p.TargetStockLevel < 0 {
			p.TargetStockLevel = 0
		}
		updated, found := h.store.UpdateProduct(p)
		if !found {
			respondError(w, http.StatusNotFound, "Product not found")
			return
		}
		respondJSON(w, http.StatusOK, updated)

	case http.MethodDelete:
		if err := h.store.DeleteProduct(id); err != nil {
			if errors.Is(err, models.ErrProductNotFound) {
				respondError(w, http.StatusNotFound, "Product not found")
				return
			}
			respondError(w, http.StatusInternalServerError, err.Error())
			return
		}
		respondJSON(w, http.StatusOK, map[string]string{"message": "Product deleted successfully"})

	default:
		respondError(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

// HandleInventory routes GET, POST, PUT, DELETE for /api/inventory.
func (h *Handler) HandleInventory(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		productID := strings.TrimSpace(r.URL.Query().Get("productId"))
		if productID == "" {
			respondError(w, http.StatusBadRequest, "Query parameter 'productId' is required")
			return
		}
		inv := h.store.GetInventoryForProduct(productID)
		respondJSON(w, http.StatusOK, inv)

	case http.MethodPost, http.MethodPut:
		var rec models.InventoryRecord
		if err := json.NewDecoder(r.Body).Decode(&rec); err != nil {
			respondError(w, http.StatusBadRequest, "Invalid inventory payload: "+err.Error())
			return
		}
		rec.ProductID = strings.TrimSpace(rec.ProductID)
		rec.VendorID = strings.TrimSpace(rec.VendorID)
		if rec.ProductID == "" || rec.VendorID == "" {
			respondError(w, http.StatusBadRequest, "productId and vendorId are required")
			return
		}
		if rec.QuantityOnHand < 0 {
			respondError(w, http.StatusBadRequest, "quantityOnHand cannot be negative")
			return
		}
		if rec.ReorderPoint < 0 {
			rec.ReorderPoint = 0
		}
		saved, err := h.store.UpsertInventory(rec)
		if err != nil {
			if errors.Is(err, models.ErrProductNotFound) || errors.Is(err, models.ErrVendorNotFound) {
				respondError(w, http.StatusNotFound, err.Error())
				return
			}
			respondError(w, http.StatusBadRequest, err.Error())
			return
		}
		respondJSON(w, http.StatusOK, saved)

	case http.MethodDelete:
		productID := strings.TrimSpace(r.URL.Query().Get("productId"))
		vendorID := strings.TrimSpace(r.URL.Query().Get("vendorId"))
		if productID == "" || vendorID == "" {
			respondError(w, http.StatusBadRequest, "Both productId and vendorId query parameters are required")
			return
		}
		if err := h.store.DeleteInventoryRecord(productID, vendorID); err != nil {
			if errors.Is(err, models.ErrInventoryNotFound) {
				respondError(w, http.StatusNotFound, "Inventory record not found")
				return
			}
			respondError(w, http.StatusInternalServerError, err.Error())
			return
		}
		respondJSON(w, http.StatusOK, map[string]string{"message": "Inventory record unlinked successfully"})

	default:
		respondError(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

// ----------------------------------------------------------------------------
// Purchase Orders Endpoints
// ----------------------------------------------------------------------------

// HandleOrders routes GET /api/orders and POST /api/orders.
func (h *Handler) HandleOrders(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		if sku := strings.TrimSpace(r.URL.Query().Get("sku")); sku != "" {
			orders := h.store.GetOrdersBySKU(sku)
			respondJSON(w, http.StatusOK, orders)
			return
		}
		orders := h.store.GetAllOrders()
		respondJSON(w, http.StatusOK, orders)

	case http.MethodPost:
		var order models.PurchaseOrder
		if err := json.NewDecoder(r.Body).Decode(&order); err != nil {
			respondError(w, http.StatusBadRequest, "Invalid order payload: "+err.Error())
			return
		}
		order.VendorID = strings.TrimSpace(order.VendorID)
		if order.VendorID == "" {
			respondError(w, http.StatusBadRequest, "vendorId is required")
			return
		}
		if len(order.Items) == 0 {
			respondError(w, http.StatusBadRequest, "Order must contain at least one line item")
			return
		}
		for _, item := range order.Items {
			if strings.TrimSpace(item.SKU) == "" {
				respondError(w, http.StatusBadRequest, "Each line item must have a SKU")
				return
			}
			if item.Quantity <= 0 {
				respondError(w, http.StatusBadRequest, "Line item quantity must be strictly greater than 0")
				return
			}
			if item.UnitPrice <= 0 {
				respondError(w, http.StatusBadRequest, "Line item unit price must be strictly greater than 0")
				return
			}
		}

		created, err := h.store.CreateOrder(order)
		if err != nil {
			if errors.Is(err, models.ErrMOQViolation) {
				respondError(w, http.StatusBadRequest, err.Error())
				return
			}
			if errors.Is(err, models.ErrVendorSuspended) {
				respondError(w, http.StatusBadRequest, "Cannot place order: Supplier is currently SUSPENDED")
				return
			}
			if errors.Is(err, models.ErrVendorNotFound) {
				respondError(w, http.StatusNotFound, "Supplier not found")
				return
			}
			respondError(w, http.StatusInternalServerError, err.Error())
			return
		}
		respondJSON(w, http.StatusCreated, created)

	default:
		respondError(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

// HandleOrderStatus routes PUT /api/orders/{id}/status.
type OrderStatusUpdateReq struct {
	Status        models.OrderStatus `json:"status"`
	WasOnTime     *bool              `json:"wasOnTime"`
	QualityRating int                `json:"qualityRating"`
}

func (h *Handler) HandleOrderStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut && r.Method != http.MethodPatch {
		respondError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 || strings.TrimSpace(parts[2]) == "" {
		respondError(w, http.StatusBadRequest, "Missing order ID in path")
		return
	}
	orderID := strings.TrimSpace(parts[2])

	var req OrderStatusUpdateReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid status update payload: "+err.Error())
		return
	}
	if req.QualityRating < 0 || req.QualityRating > 5 {
		respondError(w, http.StatusBadRequest, "qualityRating must be between 1 and 5")
		return
	}

	updated, err := h.store.UpdateOrderStatus(orderID, req.Status, req.WasOnTime, req.QualityRating)
	if err != nil {
		respondError(w, http.StatusNotFound, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, updated)
}

// ----------------------------------------------------------------------------
// Company Settings Endpoints
// ----------------------------------------------------------------------------

// HandleSettings routes GET /api/settings and PUT /api/settings.
func (h *Handler) HandleSettings(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		settings := h.store.GetSettings()
		respondJSON(w, http.StatusOK, settings)

	case http.MethodPut:
		var s models.CompanySettings
		if err := json.NewDecoder(r.Body).Decode(&s); err != nil {
			respondError(w, http.StatusBadRequest, "Invalid settings payload: "+err.Error())
			return
		}
		if s.CompanyName == "" {
			respondError(w, http.StatusBadRequest, "companyName is required")
			return
		}
		updated := h.store.UpdateSettings(s)
		respondJSON(w, http.StatusOK, updated)

	default:
		respondError(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

// ----------------------------------------------------------------------------
// Analytics
// ----------------------------------------------------------------------------

// HandleAnalytics returns high-level supplier intelligence and KPI metrics.
func (h *Handler) HandleAnalytics(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		respondError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	analytics := h.store.GetAnalytics()
	respondJSON(w, http.StatusOK, analytics)
}

// ----------------------------------------------------------------------------
// Golang Learning Modules API
// ----------------------------------------------------------------------------

type GoLesson struct {
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	Concept     string   `json:"concept"`
	Explanation string   `json:"explanation"`
	GoCode      string   `json:"goCode"`
	KeyRules    []string `json:"keyRules"`
}

// HandleGoLessons delivers the interactive Golang mentorship modules to the UI.
func (h *Handler) HandleGoLessons(w http.ResponseWriter, r *http.Request) {
	lessons := []GoLesson{
		{
			ID:      "lesson_structs",
			Title:   "1. Go Types & Structs (No Classes!)",
			Concept: "Structs replace Classes and Object-Oriented inheritance in Go.",
			Explanation: "Go uses structs for state and standalone functions (or methods with pointer receivers) for behavior. Struct tags like `json:\"id\"` instruct the JSON encoder how to serialize data over HTTP.",
			GoCode: `type Vendor struct {
    ID               string  ` + "`json:\"id\"`" + `
    Name             string  ` + "`json:\"name\"`" + `
    ReliabilityScore float64 ` + "`json:\"reliabilityScore\"`" + `
}`,
			KeyRules: []string{
				"Capitalized fields (e.g. Name) are public/exported; lowercase fields are private.",
				"Go initializes unassigned fields to their 'zero value' (0, false, or \"\").",
				"No 'null pointer exception' crashes on basic value types.",
			},
		},
		{
			ID:      "lesson_pointers",
			Title:   "2. Value Semantics vs Pointers (*)",
			Concept: "Pointers allow memory sharing and mutation without cloning.",
			Explanation: "Passing a struct as a value creates a complete copy. Passing a pointer (*Vendor) shares memory. We use *time.Time for DeliveredDate because a pointer can be nil before the order arrives!",
			GoCode: `// DeliveredDate is *time.Time.
// When nil, it means the order is in-flight.
type PurchaseOrder struct {
    ID            string     ` + "`json:\"id\"`" + `
    DeliveredDate *time.Time ` + "`json:\"deliveredDate,omitempty\"`" + `
}`,
			KeyRules: []string{
				"Use `&` to take the address of a variable (create a pointer).",
				"Use `*` to dereference a pointer (read or modify underlying value).",
				"Pointer receiver methods `func (s *Store) Save()` can mutate struct state.",
			},
		},
		{
			ID:      "lesson_errors",
			Title:   "3. Explicit Errors vs Exceptions",
			Concept: "Errors are values in Go, not hidden exceptions or try/catch blocks.",
			Explanation: "Go code explicitly tests `if err != nil`. This guarantees you handle or pass along failures at the exact point of execution, making services rock-solid and crash-resistant.",
			GoCode: `if err := json.NewDecoder(r.Body).Decode(&vendor); err != nil {
    respondError(w, http.StatusBadRequest, "Invalid JSON payload")
    return
}`,
			KeyRules: []string{
				"Never ignore errors with `_ = doSomething()` in production code.",
				"Functions often return `(ResultType, error)`.",
				"The `errors.New(\"...\")` and `fmt.Errorf(\"...\")` helpers construct error values.",
			},
		},
		{
			ID:      "lesson_concurrency",
			Title:   "4. Thread Safety with sync.RWMutex",
			Concept: "Handling thousands of concurrent HTTP requests without race conditions.",
			Explanation: "Every HTTP request runs in its own Goroutine. If two requests access a Go map concurrently, Go panics. We protect our data with sync.RWMutex and defer unlocking.",
			GoCode: `func (s *Store) GetVendor(id string) (Vendor, bool) {
    s.mu.RLock()         // Allow multiple readers
    defer s.mu.RUnlock() // Guaranteed unlock when function exits
    v, exists := s.vendors[id]
    return v, exists
}`,
			KeyRules: []string{
				"RLock() allows infinite parallel readers.",
				"Lock() grants exclusive write access.",
				"`defer` executes right before return, preventing accidental deadlocks.",
			},
		},
		{
			ID:      "lesson_streaming",
			Title:   "5. High-Performance JSON Streaming",
			Concept: "Streaming encoders directly write to network buffers.",
			Explanation: "Rather than serializing an entire JSON string into RAM with json.Marshal, Go's json.NewEncoder(w).Encode(data) streams bytes straight to the client socket with zero memory overhead.",
			GoCode: `w.Header().Set("Content-Type", "application/json")
w.WriteHeader(http.StatusOK)
json.NewEncoder(w).Encode(vendors)`,
			KeyRules: []string{
				"Streaming avoids storing large JSON strings in memory.",
				"`json.NewDecoder(r.Body)` reads directly from incoming network stream.",
				"Standard library `net/http` is production-ready without external frameworks.",
			},
		},
	}

	respondJSON(w, http.StatusOK, lessons)
}

// HandleClearData routes POST /api/demo/clear to reset to a completely clean slate.
func (h *Handler) HandleClearData(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		respondError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	if err := h.store.ClearAllData(); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "All demo suppliers, orders, and quotes have been cleared. System is on a 100% clean slate.",
	})
}

// HandleSeedData routes POST /api/demo/seed to load sample testing data.
func (h *Handler) HandleSeedData(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		respondError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	if err := h.store.LoadSeedData(); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Sample demo suppliers and parts loaded successfully.",
	})
}
