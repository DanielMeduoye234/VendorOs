// Package store provides thread-safe data persistence for VendorOS.
//
// ============================================================================
// 🎓 GOLANG LEARNING NOTE: Concurrency & The sync.RWMutex
// ============================================================================
// 1. Goroutines:
//    Go's HTTP server (`net/http`) handles EVERY incoming HTTP request inside
//    its own independent lightweight thread called a "goroutine".
//    This allows Go servers to handle tens of thousands of concurrent users!
//
// 2. The Danger: Race Conditions:
//    Because multiple goroutines run at the exact same time, if request A
//    writes to a standard Go map while request B reads from it, the program
//    will crash with a fatal runtime error: "fatal error: concurrent map writes".
//
// 3. The Solution: `sync.RWMutex`:
//    - `s.mu.RLock()`: Read-Lock. Multiple goroutines can read at the same time.
//    - `s.mu.Lock()`: Write-Lock. Only ONE goroutine can write; all others wait.
//    - `defer s.mu.RUnlock()`: The `defer` keyword schedules a function call
//      to execute right before the surrounding function returns. This guarantees
//      locks are ALWAYS released, even if an early return happens!
//
// 4. Constructors & Comma-OK Idiom:
//    Go doesn't have class constructors like `__init__` or `constructor()`.
//    The convention is a factory function named `NewStore()` or `New...()`.
//    Also notice: `v, exists := s.vendors[id]`. This is Go's "comma-ok" idiom
//    to check if a key is present in a map.
// ============================================================================
package store

import (
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"vendoros/backend/models"
)

// DataStore defines the interface for persistence operations in VendorOS.
// Any backend (In-Memory, PostgreSQL/Supabase, SQLite) that implements these
// methods can be plugged directly into the HTTP handlers!
type DataStore interface {
	GetAllVendors() []models.Vendor
	GetVendorByID(id string) (models.Vendor, bool)
	CreateVendor(v models.Vendor) models.Vendor
	UpdateVendor(v models.Vendor) (models.Vendor, bool)
	DeleteVendor(id string) error

	GetAllCatalog() []models.CatalogItem
	ComparePrices(sku string) (models.PriceComparison, bool)
	CreateCatalogItem(item models.CatalogItem) (models.CatalogItem, error)

	GetAllOrders() []models.PurchaseOrder
	GetOrdersBySKU(sku string) []models.PurchaseOrder
	GetProductOrderSummary(sku string) models.ProductOrderSummary
	CreateOrder(order models.PurchaseOrder) (models.PurchaseOrder, error)
	UpdateOrderStatus(id string, newStatus models.OrderStatus, wasOnTime *bool, qualityRating int) (models.PurchaseOrder, error)

	GetAnalytics() models.DashboardAnalytics

	GetSettings() models.CompanySettings
	UpdateSettings(settings models.CompanySettings) models.CompanySettings

	// Products & Inventory
	GetAllProducts() []models.ProductWithInventory
	GetProductByID(id string) (models.ProductWithInventory, bool)
	CreateProduct(p models.Product) (models.Product, error)
	UpdateProduct(p models.Product) (models.Product, bool)
	DeleteProduct(id string) error

	GetInventoryForProduct(productID string) []models.InventoryWithVendor
	UpsertInventory(rec models.InventoryRecord) (models.InventoryRecord, error)
	DeleteInventoryRecord(productID string, vendorID string) error

	ClearAllData() error
	LoadSeedData() error
}

// Store provides an in-memory thread-safe implementation of DataStore.
type Store struct {
	mu        sync.RWMutex
	vendors   map[string]models.Vendor
	catalog   map[string]models.CatalogItem
	orders    map[string]models.PurchaseOrder
	settings  models.CompanySettings
	products  map[string]models.Product
	inventory map[string]models.InventoryRecord // key: productID+":"+vendorID
	invNextID int
}

// NewStore creates and initializes a clean, empty DataStore.
func NewStore() *Store {
	return &Store{
		vendors:   make(map[string]models.Vendor),
		catalog:   make(map[string]models.CatalogItem),
		orders:    make(map[string]models.PurchaseOrder),
		products:  make(map[string]models.Product),
		inventory: make(map[string]models.InventoryRecord),
		invNextID: 1,
		settings: models.CompanySettings{
			CompanyName:          "My Organization",
			TaxID:                "",
			OperatingCurrency:    "USD",
			DefaultTaxRate:       0.08,
			ShippingAddress:      "",
			BillingAddress:       "",
			ProbationThreshold:   75.0,
			HighValueApprovalMin: 10000.0,
			ContactEmail:         "",
			ContactPhone:         "",
			UpdatedAt:            time.Now(),
		},
	}
}

// GetSettings retrieves the active business settings.
func (s *Store) GetSettings() models.CompanySettings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.settings
}

// UpdateSettings updates organization profile and procurement rules.
func (s *Store) UpdateSettings(newSettings models.CompanySettings) models.CompanySettings {
	s.mu.Lock()
	defer s.mu.Unlock()
	newSettings.UpdatedAt = time.Now()
	s.settings = newSettings
	return s.settings
}

// ----------------------------------------------------------------------------
// Vendor Operations
// ----------------------------------------------------------------------------

// GetAllVendors returns a slice containing all vendors in the system.
func (s *Store) GetAllVendors() []models.Vendor {
	s.mu.RLock()
	defer s.mu.RUnlock()

	list := make([]models.Vendor, 0, len(s.vendors))
	for _, v := range s.vendors {
		list = append(list, v)
	}
	return list
}

// GetVendorByID retrieves a single vendor by ID.
func (s *Store) GetVendorByID(id string) (models.Vendor, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	v, exists := s.vendors[id]
	return v, exists
}

// CreateVendor adds a new vendor with initialized metrics.
func (s *Store) CreateVendor(v models.Vendor) models.Vendor {
	s.mu.Lock()
	defer s.mu.Unlock()

	if v.ID == "" {
		v.ID = fmt.Sprintf("vnd_%d", time.Now().UnixNano()%1000000)
	}
	v.CreatedAt = time.Now()
	if v.Status == "" {
		v.Status = models.StatusActive
	}
	if v.Tier == "" {
		v.Tier = models.TierStandard
	}
	// Initial default scores for new vendors
	if v.ReliabilityScore == 0 {
		v.ReliabilityScore = 85.0
		v.OnTimeDeliveryRate = 85.0
		v.QualityScore = 4.0
	}

	s.vendors[v.ID] = v
	return v
}

// UpdateVendor updates an existing vendor.
func (s *Store) UpdateVendor(v models.Vendor) (models.Vendor, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	existing, exists := s.vendors[v.ID]
	if !exists {
		return models.Vendor{}, false
	}

	// Preserve created timestamp and calculated metrics if not supplied
	v.CreatedAt = existing.CreatedAt
	if v.ReliabilityScore == 0 {
		v.ReliabilityScore = existing.ReliabilityScore
		v.OnTimeDeliveryRate = existing.OnTimeDeliveryRate
		v.QualityScore = existing.QualityScore
	}
	v.TotalOrders = existing.TotalOrders
	v.TotalSpend = existing.TotalSpend

	s.vendors[v.ID] = v
	return v, true
}

// DeleteVendor removes a vendor and their catalog items, guarding against active orders.
func (s *Store) DeleteVendor(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.vendors[id]; !exists {
		return models.ErrVendorNotFound
	}

	// EDGE CASE GUARD: Block deletion if vendor has active in-flight orders
	for _, o := range s.orders {
		if o.VendorID == id {
			if o.Status == models.OrderSubmitted || o.Status == models.OrderConfirmed || o.Status == models.OrderShipped {
				return models.ErrActiveOrdersExist
			}
		}
	}

	delete(s.vendors, id)

	// Clean up catalog items for this vendor
	for k, item := range s.catalog {
		if item.VendorID == id {
			delete(s.catalog, k)
		}
	}
	return nil
}

// ----------------------------------------------------------------------------
// Catalog & Price Comparison Operations
// ----------------------------------------------------------------------------

// GetAllCatalog returns all catalog items.
func (s *Store) GetAllCatalog() []models.CatalogItem {
	s.mu.RLock()
	defer s.mu.RUnlock()

	list := make([]models.CatalogItem, 0, len(s.catalog))
	for _, item := range s.catalog {
		list = append(list, item)
	}
	return list
}

// ComparePrices returns quotes from all vendors offering products with the given SKU.
func (s *Store) ComparePrices(sku string) (models.PriceComparison, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var matchingQuotes []models.CatalogItem
	var itemName string

	for _, item := range s.catalog {
		if item.SKU == sku {
			matchingQuotes = append(matchingQuotes, item)
			if itemName == "" {
				itemName = item.ItemName
			}
		}
	}

	if len(matchingQuotes) == 0 {
		return models.PriceComparison{}, false
	}

	// Find the cheapest vendor and fastest lead time
	lowestPrice := matchingQuotes[0].UnitPrice
	fastestLeadTime := matchingQuotes[0].LeadTimeDays
	cheapestVendor := matchingQuotes[0].VendorName

	for _, q := range matchingQuotes {
		if q.UnitPrice < lowestPrice {
			lowestPrice = q.UnitPrice
			cheapestVendor = q.VendorName
		}
		if q.LeadTimeDays < fastestLeadTime {
			fastestLeadTime = q.LeadTimeDays
		}
	}

	return models.PriceComparison{
		SKU:             sku,
		ItemName:        itemName,
		Quotes:          matchingQuotes,
		LowestPrice:     lowestPrice,
		FastestLeadTime: fastestLeadTime,
		CheapestVendor:  cheapestVendor,
	}, true
}

// CreateCatalogItem adds or updates an item in a vendor's catalog with edge case validation.
func (s *Store) CreateCatalogItem(item models.CatalogItem) (models.CatalogItem, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// EDGE CASE 1: Verify vendor exists
	v, ok := s.vendors[item.VendorID]
	if !ok {
		return models.CatalogItem{}, models.ErrVendorNotFound
	}

	// EDGE CASE 2: Check if vendor is SUSPENDED
	if v.Status == models.StatusSuspended {
		return models.CatalogItem{}, models.ErrVendorSuspended
	}

	// EDGE CASE 3: Unit price must be strictly positive
	if item.UnitPrice <= 0 {
		return models.CatalogItem{}, models.ErrInvalidProductPrice
	}

	// EDGE CASE 4: MOQ must be at least 1
	if item.MinOrderQty < 1 {
		item.MinOrderQty = 1
	}

	// Normalize SKU (trimmed, uppercase)
	item.SKU = strings.ToUpper(strings.TrimSpace(item.SKU))
	item.ItemName = strings.TrimSpace(item.ItemName)
	item.VendorName = v.Name
	item.UpdatedAt = time.Now()
	if item.Currency == "" {
		item.Currency = s.settings.OperatingCurrency
		if item.Currency == "" {
			item.Currency = "USD"
		}
	}

	// EDGE CASE 5: Duplicate SKU per Supplier -> Update existing catalog quote instead of duplicate
	for id, existing := range s.catalog {
		if existing.VendorID == item.VendorID && strings.EqualFold(existing.SKU, item.SKU) {
			item.ID = id
			s.catalog[id] = item
			return item, nil
		}
	}

	if item.ID == "" {
		item.ID = fmt.Sprintf("cat_%d", time.Now().UnixNano()%1000000)
	}

	s.catalog[item.ID] = item
	return item, nil
}

// ----------------------------------------------------------------------------
// Purchase Order Operations & State Machine
// ----------------------------------------------------------------------------

// GetAllOrders returns all purchase orders.
func (s *Store) GetAllOrders() []models.PurchaseOrder {
	s.mu.RLock()
	defer s.mu.RUnlock()

	list := make([]models.PurchaseOrder, 0, len(s.orders))
	for _, o := range s.orders {
		list = append(list, o)
	}
	return list
}

// GetOrdersBySKU finds all purchase orders containing line items for the given SKU.
func (s *Store) GetOrdersBySKU(sku string) []models.PurchaseOrder {
	s.mu.RLock()
	defer s.mu.RUnlock()

	cleanSKU := strings.ToUpper(strings.TrimSpace(sku))
	var matching []models.PurchaseOrder
	for _, o := range s.orders {
		for _, item := range o.Items {
			if strings.EqualFold(item.SKU, cleanSKU) {
				matching = append(matching, o)
				break
			}
		}
	}
	return matching
}

// GetProductOrderSummary aggregates volume, spend, and order history for a SKU.
func (s *Store) GetProductOrderSummary(sku string) models.ProductOrderSummary {
	s.mu.RLock()
	defer s.mu.RUnlock()

	cleanSKU := strings.ToUpper(strings.TrimSpace(sku))
	summary := models.ProductOrderSummary{
		SKU:    cleanSKU,
		Orders: make([]models.PurchaseOrder, 0),
	}

	// Find product item name if known
	for _, item := range s.catalog {
		if strings.EqualFold(item.SKU, cleanSKU) {
			summary.ItemName = item.ItemName
			break
		}
	}

	for _, o := range s.orders {
		var matched bool
		for _, item := range o.Items {
			if strings.EqualFold(item.SKU, cleanSKU) {
				summary.TotalUnits += item.Quantity
				summary.TotalSpend += item.TotalPrice
				matched = true
			}
		}
		if matched {
			summary.Orders = append(summary.Orders, o)
		}
	}
	summary.TotalOrders = len(summary.Orders)
	return summary
}

// CreateOrder records a new purchase order with edge case guards (MOQ, Suspended Vendor).
func (s *Store) CreateOrder(order models.PurchaseOrder) (models.PurchaseOrder, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// EDGE CASE 1: Check vendor existence
	v, exists := s.vendors[order.VendorID]
	if !exists {
		return models.PurchaseOrder{}, models.ErrVendorNotFound
	}

	// EDGE CASE 2: Check if vendor is SUSPENDED
	if v.Status == models.StatusSuspended {
		return models.PurchaseOrder{}, models.ErrVendorSuspended
	}

	// EDGE CASE 3: Validate MOQ for each line item against catalog
	for _, lineItem := range order.Items {
		cleanSKU := strings.ToUpper(strings.TrimSpace(lineItem.SKU))
		for _, catItem := range s.catalog {
			if catItem.VendorID == order.VendorID && strings.EqualFold(catItem.SKU, cleanSKU) {
				if catItem.MinOrderQty > 0 && lineItem.Quantity < catItem.MinOrderQty {
					return models.PurchaseOrder{}, fmt.Errorf("%w: SKU '%s' requires minimum %d units (ordered: %d)",
						models.ErrMOQViolation, cleanSKU, catItem.MinOrderQty, lineItem.Quantity)
				}
				break
			}
		}
	}

	if order.ID == "" {
		order.ID = fmt.Sprintf("po_%d", time.Now().UnixNano()%1000000)
	}
	if order.PONumber == "" {
		order.PONumber = fmt.Sprintf("PO-%s-%03d", time.Now().Format("2006"), len(s.orders)+101)
	}
	order.OrderDate = time.Now()
	if order.ExpectedDate.IsZero() {
		order.ExpectedDate = time.Now().Add(14 * 24 * time.Hour)
	}
	if order.Status == "" {
		order.Status = models.OrderSubmitted
	}

	// Calculate subtotal from line items
	var subtotal float64
	for i := range order.Items {
		itemTotal := float64(order.Items[i].Quantity) * order.Items[i].UnitPrice
		order.Items[i].TotalPrice = itemTotal
		subtotal += itemTotal
	}
	order.Subtotal = subtotal
	if order.TaxRate == 0 {
		order.TaxRate = s.settings.DefaultTaxRate
		if order.TaxRate == 0 {
			order.TaxRate = 0.08
		}
	}
	order.TotalAmount = subtotal * (1 + order.TaxRate)
	order.VendorName = v.Name

	s.orders[order.ID] = order
	return order, nil
}

// UpdateOrderStatus transitions an order to a new state and triggers reliability updates.
func (s *Store) UpdateOrderStatus(id string, newStatus models.OrderStatus, wasOnTime *bool, qualityRating int) (models.PurchaseOrder, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	order, exists := s.orders[id]
	if !exists {
		return models.PurchaseOrder{}, errors.New("purchase order not found")
	}

	order.Status = newStatus

	// If delivered, update delivery metadata and recalculate supplier reliability!
	if newStatus == models.OrderDelivered {
		now := time.Now()
		order.DeliveredDate = &now
		if wasOnTime != nil {
			order.WasOnTime = wasOnTime
		}
		if qualityRating > 0 {
			order.QualityRating = qualityRating
		}

		// Update vendor metrics
		if v, ok := s.vendors[order.VendorID]; ok {
			v.TotalOrders++
			v.TotalSpend += order.TotalAmount

			// Recalculate OnTimeDeliveryRate and QualityScore
			var totalDeliveredOrders int
			var onTimeCount int
			var totalQualityScore float64

			for _, po := range s.orders {
				if po.VendorID == order.VendorID && (po.Status == models.OrderDelivered || po.ID == order.ID) {
					totalDeliveredOrders++
					if po.WasOnTime != nil && *po.WasOnTime {
						onTimeCount++
					} else if po.ID == order.ID && wasOnTime != nil && *wasOnTime {
						onTimeCount++
					}
					if po.QualityRating > 0 {
						totalQualityScore += float64(po.QualityRating)
					} else if po.ID == order.ID && qualityRating > 0 {
						totalQualityScore += float64(qualityRating)
					}
				}
			}

			if totalDeliveredOrders > 0 {
				v.OnTimeDeliveryRate = (float64(onTimeCount) / float64(totalDeliveredOrders)) * 100
				v.QualityScore = totalQualityScore / float64(totalDeliveredOrders)
				// Reliability algorithm: 40% On-Time, 40% Quality (normalized to 100), 20% Baseline activity
				v.ReliabilityScore = (v.OnTimeDeliveryRate * 0.40) + ((v.QualityScore / 5.0) * 100.0 * 0.40) + 20.0
				if v.ReliabilityScore > 100.0 {
					v.ReliabilityScore = 100.0
				}
			}

			s.vendors[order.VendorID] = v
		}
	}

	s.orders[id] = order
	return order, nil
}

// ----------------------------------------------------------------------------
// Analytics & Dashboard Summary
// ----------------------------------------------------------------------------

// GetAnalytics calculates real-time summary statistics across the whole organization.
func (s *Store) GetAnalytics() models.DashboardAnalytics {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var totalSpend float64
	var activeVendors int
	var totalReliability float64
	var vendorCount int

	for _, v := range s.vendors {
		if v.Status == models.StatusActive {
			activeVendors++
		}
		totalReliability += v.ReliabilityScore
		vendorCount++
		totalSpend += v.TotalSpend
	}

	avgReliability := 0.0
	if vendorCount > 0 {
		avgReliability = totalReliability / float64(vendorCount)
	}

	ordersByStatus := make(map[string]int)
	activeOrders := 0
	for _, o := range s.orders {
		ordersByStatus[string(o.Status)]++
		if o.Status == models.OrderSubmitted || o.Status == models.OrderConfirmed || o.Status == models.OrderShipped {
			activeOrders++
		}
	}

	// Get top suppliers by reliability
	top := make([]models.Vendor, 0, len(s.vendors))
	for _, v := range s.vendors {
		top = append(top, v)
	}

	return models.DashboardAnalytics{
		TotalSpend:         totalSpend,
		ActiveVendors:      activeVendors,
		AverageReliability: avgReliability,
		ActiveOrders:       activeOrders,
		OrdersByStatus:     ordersByStatus,
		TopSuppliers:       top,
	}
}

// ClearAllData resets the in-memory store to an empty clean slate.
func (s *Store) ClearAllData() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.vendors = make(map[string]models.Vendor)
	s.catalog = make(map[string]models.CatalogItem)
	s.orders = make(map[string]models.PurchaseOrder)
	s.products = make(map[string]models.Product)
	s.inventory = make(map[string]models.InventoryRecord)
	return nil
}

// LoadSeedData populates sample data on explicit user request.
func (s *Store) LoadSeedData() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.vendors = make(map[string]models.Vendor)
	s.catalog = make(map[string]models.CatalogItem)
	s.orders = make(map[string]models.PurchaseOrder)
	s.products = make(map[string]models.Product)
	s.inventory = make(map[string]models.InventoryRecord)
	s.invNextID = 1

	v1 := models.Vendor{
		ID: "vnd_acme", Name: "Acme Precision Components", ContactPerson: "Sarah Jenkins",
		Email: "s.jenkins@acmeprecision.com", Phone: "+1 (555) 234-8901",
		Category: "Precision Hardware & CNC", Tier: "Strategic", Status: models.StatusActive,
		PaymentTerms: "Net 30", ReliabilityScore: 94.5, OnTimeDeliveryRate: 96.0,
		QualityScore: 4.8, TotalOrders: 18, TotalSpend: 142500.00, CreatedAt: time.Now(),
	}
	s.vendors[v1.ID] = v1

	p1 := models.Product{
		ID: "prd_bolt", Name: "Titanium Hex Bolt M4x20mm", Description: "Grade 5 Titanium hex socket screw",
		SKU: "BOLT-M4-TI", Category: "Hardware", UnitOfMeasure: "units", TargetStockLevel: 500, CreatedAt: time.Now(),
	}
	s.products[p1.ID] = p1

	c1 := models.CatalogItem{
		ID: "cat_1", VendorID: v1.ID, VendorName: v1.Name, SKU: "BOLT-M4-TI",
		ItemName: "Titanium Hex Bolt M4x20mm", Category: "Hardware", UnitPrice: 1.45,
		Currency: "USD", MinOrderQty: 50, LeadTimeDays: 7, InStock: true, UpdatedAt: time.Now(),
	}
	s.catalog[c1.ID] = c1

	rec1 := models.InventoryRecord{
		ID: 1, ProductID: p1.ID, VendorID: v1.ID, QuantityOnHand: 250,
		ReorderPoint: 100, LastUpdated: time.Now(), Notes: "Primary warehouse stock",
	}
	s.inventory[p1.ID+":"+v1.ID] = rec1
	s.invNextID = 2

	return nil
}

// ----------------------------------------------------------------------------
// Product Operations (In-Memory)
// ----------------------------------------------------------------------------

func (s *Store) CreateProduct(p models.Product) (models.Product, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	// Check SKU uniqueness
	for _, existing := range s.products {
		if strings.EqualFold(existing.SKU, p.SKU) {
			return models.Product{}, errors.New("a product with this SKU already exists")
		}
	}
	if p.ID == "" {
		p.ID = fmt.Sprintf("prd_%d", time.Now().UnixNano()%10000000)
	}
	if p.UnitOfMeasure == "" {
		p.UnitOfMeasure = "units"
	}
	p.CreatedAt = time.Now()
	s.products[p.ID] = p
	return p, nil
}

func (s *Store) GetAllProducts() []models.ProductWithInventory {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]models.ProductWithInventory, 0, len(s.products))
	for _, p := range s.products {
		result = append(result, s.buildProductWithInventory(p))
	}
	return result
}

func (s *Store) GetProductByID(id string) (models.ProductWithInventory, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	p, exists := s.products[id]
	if !exists {
		return models.ProductWithInventory{}, false
	}
	return s.buildProductWithInventory(p), true
}

func (s *Store) UpdateProduct(p models.Product) (models.Product, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	existing, exists := s.products[p.ID]
	if !exists {
		return models.Product{}, false
	}
	p.CreatedAt = existing.CreatedAt
	s.products[p.ID] = p
	return p, true
}

func (s *Store) DeleteProduct(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.products[id]; !exists {
		return models.ErrProductNotFound
	}
	delete(s.products, id)
	// Cascade delete inventory records
	for k, rec := range s.inventory {
		if rec.ProductID == id {
			delete(s.inventory, k)
		}
	}
	return nil
}

// buildProductWithInventory assembles a ProductWithInventory without acquiring a new lock.
// Must be called while holding at least a read lock.
func (s *Store) buildProductWithInventory(p models.Product) models.ProductWithInventory {
	var invList []models.InventoryWithVendor
	totalStock := 0
	isLowStock := false
	for _, rec := range s.inventory {
		if rec.ProductID != p.ID {
			continue
		}
		v, vendorExists := s.vendors[rec.VendorID]
		vendorName := rec.VendorID
		vendorStatus := ""
		vendorTier := ""
		if vendorExists {
			vendorName = v.Name
			vendorStatus = string(v.Status)
			vendorTier = string(v.Tier)
		}
		low := rec.ReorderPoint > 0 && rec.QuantityOnHand <= rec.ReorderPoint
		if low {
			isLowStock = true
		}
		totalStock += rec.QuantityOnHand
		invList = append(invList, models.InventoryWithVendor{
			InventoryRecord: rec,
			VendorName:      vendorName,
			VendorStatus:    vendorStatus,
			VendorTier:      vendorTier,
			IsLowStock:      low,
		})
	}
	if invList == nil {
		invList = []models.InventoryWithVendor{}
	}
	return models.ProductWithInventory{
		Product:       p,
		TotalStock:    totalStock,
		SupplierCount: len(invList),
		IsLowStock:    isLowStock,
		Inventory:     invList,
	}
}

// ----------------------------------------------------------------------------
// Inventory Operations (In-Memory)
// ----------------------------------------------------------------------------

func (s *Store) GetInventoryForProduct(productID string) []models.InventoryWithVendor {
	s.mu.RLock()
	defer s.mu.RUnlock()
	p, exists := s.products[productID]
	if !exists {
		return []models.InventoryWithVendor{}
	}
	pwi := s.buildProductWithInventory(p)
	return pwi.Inventory
}

func (s *Store) UpsertInventory(rec models.InventoryRecord) (models.InventoryRecord, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if rec.QuantityOnHand < 0 {
		return models.InventoryRecord{}, models.ErrNegativeQuantity
	}
	if _, exists := s.products[rec.ProductID]; !exists {
		return models.InventoryRecord{}, models.ErrProductNotFound
	}
	if _, exists := s.vendors[rec.VendorID]; !exists {
		return models.InventoryRecord{}, models.ErrVendorNotFound
	}
	key := rec.ProductID + ":" + rec.VendorID
	existing, alreadyExists := s.inventory[key]
	if alreadyExists {
		rec.ID = existing.ID
	} else {
		rec.ID = s.invNextID
		s.invNextID++
	}
	rec.LastUpdated = time.Now()
	s.inventory[key] = rec
	return rec, nil
}

func (s *Store) DeleteInventoryRecord(productID string, vendorID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	key := productID + ":" + vendorID
	if _, exists := s.inventory[key]; !exists {
		return models.ErrInventoryNotFound
	}
	delete(s.inventory, key)
	return nil
}
