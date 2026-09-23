// Package models defines all the core domain types and data contracts for VendorOS.
//
// ============================================================================
// 🎓 GOLANG LEARNING NOTE: Packages and Types
// ============================================================================
// 1. "package models": In Go, code is organized in packages. Every file in the
//    same directory must share the exact same package name.
// 2. Structs: Go has no classes, inheritance, or "this/self". Instead, Go uses
//    "structs" to group related fields together.
// 3. Exported vs Unexported (Visibility):
//    - If an identifier starts with a CAPITAL letter (e.g. `Vendor`, `Name`),
//      it is EXPORTED (public) and visible to other packages.
//    - If it starts with a lowercase letter (e.g. `secretKey`), it is
//      UNEXPORTED (private to this package).
// 4. Struct Tags (`json:"..."`):
//    The backtick annotations tell Go's `encoding/json` package how to map
//    struct fields to JSON keys when sending/receiving HTTP payloads.
// 5. Value Types vs Pointers:
//    - `time.Time`: Stored directly as a value.
//    - `*time.Time`: A pointer. Can be `nil`, perfect for optional dates
//      (e.g., `DeliveredDate` before delivery occurs).
// ============================================================================
package models

import (
	"errors"
	"time"
)

// ============================================================================
// 🎓 GOLANG LEARNING NOTE: Sentinel Errors & Idiomatic Error Handling
// ============================================================================
// In Go, package-level error variables are called "Sentinel Errors" (e.g. `Err...`).
// They allow callers to inspect specific failure conditions using `errors.Is(err, ErrVendorSuspended)`:
//   if errors.Is(err, models.ErrMOQViolation) {
//       respondError(w, http.StatusBadRequest, err.Error())
//   }
// This provides type-safe, explicit, and composable error handling without exceptions!
// ============================================================================

var (
	ErrVendorNotFound      = errors.New("vendor not found")
	ErrVendorSuspended     = errors.New("cannot create products or orders for a suspended supplier")
	ErrMOQViolation        = errors.New("order quantity is less than supplier minimum order quantity (MOQ)")
	ErrActiveOrdersExist   = errors.New("cannot delete supplier with active in-flight purchase orders")
	ErrProductNotFound     = errors.New("product/catalog item not found")
	ErrInvalidProductPrice = errors.New("unit price must be strictly greater than 0")
	ErrInvalidMOQ          = errors.New("minimum order quantity (MOQ) must be at least 1")

	// Inventory management errors
	ErrInventoryNotFound     = errors.New("inventory record not found")
	ErrDuplicateInventory    = errors.New("inventory record for this supplier already exists — use update instead")
	ErrNegativeQuantity      = errors.New("quantity on hand cannot be negative")
)

// VendorTier classifies the importance and strategic value of a supplier.
type VendorTier string

const (
	TierStrategic   VendorTier = "Strategic"   // Critical partners, volume discounts
	TierPreferred   VendorTier = "Preferred"   // Go-to suppliers with proven track record
	TierStandard    VendorTier = "Standard"    // Routine suppliers
	TierUnderReview VendorTier = "Under Review"// New or flagged vendors
)

// VendorStatus tracks whether a vendor is eligible for new orders.
type VendorStatus string

const (
	StatusActive    VendorStatus = "ACTIVE"
	StatusProbation VendorStatus = "PROBATION"
	StatusSuspended VendorStatus = "SUSPENDED"
)

// Vendor represents a company or contractor supplying goods or services.
type Vendor struct {
	ID                 string       `json:"id"`
	Name               string       `json:"name"`
	ContactPerson      string       `json:"contactPerson"`
	Email              string       `json:"email"`
	Phone              string       `json:"phone"`
	Category           string       `json:"category"`
	Tier               VendorTier   `json:"tier"`
	Status             VendorStatus `json:"status"`
	PaymentTerms       string       `json:"paymentTerms"` // e.g. "Net 30", "Net 60", "Due on Receipt"
	ReliabilityScore   float64      `json:"reliabilityScore"` // 0.0 to 100.0%
	OnTimeDeliveryRate float64      `json:"onTimeDeliveryRate"` // 0.0 to 100.0%
	QualityScore       float64      `json:"qualityScore"` // 1.0 to 5.0
	TotalOrders        int          `json:"totalOrders"`
	TotalSpend         float64      `json:"totalSpend"`
	CreatedAt          time.Time    `json:"createdAt"`
}

// CatalogItem represents a product or part offered by a specific vendor.
// Businesses track these to compare unit pricing across suppliers.
type CatalogItem struct {
	ID           string    `json:"id"`
	VendorID     string    `json:"vendorId"`
	VendorName   string    `json:"vendorName"`
	SKU          string    `json:"sku"`
	ItemName     string    `json:"itemName"`
	Category     string    `json:"category"`
	UnitPrice    float64   `json:"unitPrice"`
	Currency     string    `json:"currency"`     // e.g. "USD", "EUR"
	MinOrderQty  int       `json:"minOrderQty"`  // Minimum Order Quantity (MOQ)
	LeadTimeDays int       `json:"leadTimeDays"` // Days between order and delivery
	InStock      bool      `json:"inStock"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

// OrderStatus defines the lifecycle state machine for a purchase order.
type OrderStatus string

const (
	OrderDraft     OrderStatus = "DRAFT"
	OrderSubmitted OrderStatus = "SUBMITTED"
	OrderConfirmed OrderStatus = "CONFIRMED"
	OrderShipped   OrderStatus = "SHIPPED"
	OrderDelivered OrderStatus = "DELIVERED"
	OrderCancelled OrderStatus = "CANCELLED"
)

// POLineItem represents an individual line item inside a Purchase Order.
type POLineItem struct {
	CatalogItemID string  `json:"catalogItemId"`
	SKU           string  `json:"sku"`
	Name          string  `json:"name"`
	Quantity      int     `json:"quantity"`
	UnitPrice     float64 `json:"unitPrice"`
	TotalPrice    float64 `json:"totalPrice"`
}

// PurchaseOrder records a formal order placed with a supplier.
type PurchaseOrder struct {
	ID             string       `json:"id"`
	PONumber       string       `json:"poNumber"` // e.g. "PO-2026-0042"
	VendorID       string       `json:"vendorId"`
	VendorName     string       `json:"vendorName"`
	OrderDate      time.Time    `json:"orderDate"`
	ExpectedDate   time.Time    `json:"expectedDate"`
	DeliveredDate  *time.Time   `json:"deliveredDate,omitempty"` // Pointer: nil if not delivered yet
	Items          []POLineItem `json:"items"`
	Subtotal       float64      `json:"subtotal"`
	TaxRate        float64      `json:"taxRate"`
	TotalAmount    float64      `json:"totalAmount"`
	Status         OrderStatus  `json:"status"`
	Notes          string       `json:"notes"`
	WasOnTime      *bool        `json:"wasOnTime,omitempty"`      // nil until delivered
	QualityRating  int          `json:"qualityRating,omitempty"` // 1-5 stars
}

// PriceComparison holds side-by-side vendor quotes for a specific SKU.
type PriceComparison struct {
	SKU            string        `json:"sku"`
	ItemName       string        `json:"itemName"`
	Quotes         []CatalogItem `json:"quotes"`
	LowestPrice    float64       `json:"lowestPrice"`
	FastestLeadTime int          `json:"fastestLeadTime"`
	CheapestVendor string        `json:"cheapestVendor"`
}

// DashboardAnalytics summarizes business KPIs across all suppliers.
type DashboardAnalytics struct {
	TotalSpend         float64        `json:"totalSpend"`
	ActiveVendors      int            `json:"activeVendors"`
	AverageReliability float64        `json:"averageReliability"`
	ActiveOrders       int            `json:"activeOrders"`
	OrdersByStatus     map[string]int `json:"ordersByStatus"`
	TopSuppliers       []Vendor       `json:"topSuppliers"`
}

// CompanySettings stores organization profile, tax rules, and procurement policies.
type CompanySettings struct {
	CompanyName          string    `json:"companyName"`
	TaxID                string    `json:"taxId"`
	OperatingCurrency    string    `json:"operatingCurrency"`
	DefaultTaxRate       float64   `json:"defaultTaxRate"`
	ShippingAddress      string    `json:"shippingAddress"`
	BillingAddress       string    `json:"billingAddress"`
	ProbationThreshold   float64   `json:"probationThreshold"`
	HighValueApprovalMin float64   `json:"highValueApprovalMin"`
	ContactEmail         string    `json:"contactEmail"`
	ContactPhone         string    `json:"contactPhone"`
	UpdatedAt            time.Time `json:"updatedAt"`
}

// ProductOrderSummary provides aggregated order analytics for a specific SKU.
type ProductOrderSummary struct {
	SKU         string          `json:"sku"`
	ItemName    string          `json:"itemName"`
	TotalUnits  int             `json:"totalUnits"`
	TotalSpend  float64         `json:"totalSpend"`
	TotalOrders int             `json:"totalOrders"`
	Orders      []PurchaseOrder `json:"orders"`
}

// Product is the canonical master record for a SKU-based item the company procures.
// Multiple suppliers may offer the same product at different prices — tracked via catalog_items.
// Inventory is tracked per supplier via InventoryRecord.
type Product struct {
	ID               string    `json:"id"`
	Name             string    `json:"name"`
	Description      string    `json:"description"`
	SKU              string    `json:"sku"`             // Canonical master SKU
	Category         string    `json:"category"`
	UnitOfMeasure    string    `json:"unitOfMeasure"`   // e.g. "units", "kg", "reels"
	TargetStockLevel int       `json:"targetStockLevel"` // Desired minimum total stock
	CreatedAt        time.Time `json:"createdAt"`
}

// InventoryRecord tracks how many units of a product a specific supplier currently holds.
type InventoryRecord struct {
	ID             int       `json:"id"`
	ProductID      string    `json:"productId"`
	VendorID       string    `json:"vendorId"`
	QuantityOnHand int       `json:"quantityOnHand"`
	ReorderPoint   int       `json:"reorderPoint"`   // Alert when stock falls at or below this
	LastUpdated    time.Time `json:"lastUpdated"`
	Notes          string    `json:"notes"`
}

// InventoryWithVendor is a joined view of InventoryRecord with vendor display info.
type InventoryWithVendor struct {
	InventoryRecord
	VendorName   string `json:"vendorName"`
	VendorStatus string `json:"vendorStatus"`
	VendorTier   string `json:"vendorTier"`
	IsLowStock   bool   `json:"isLowStock"` // true when QuantityOnHand <= ReorderPoint
}

// ProductWithInventory is a product with all its supplier inventory records.
type ProductWithInventory struct {
	Product
	TotalStock   int                   `json:"totalStock"`   // Sum across all suppliers
	SupplierCount int                  `json:"supplierCount"`
	IsLowStock   bool                  `json:"isLowStock"`   // Any supplier below reorder point
	Inventory    []InventoryWithVendor `json:"inventory"`
}
