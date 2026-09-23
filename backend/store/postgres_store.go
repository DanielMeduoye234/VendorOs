// Package store provides persistence implementations for VendorOS.
//
// ============================================================================
// 🎓 GOLANG LEARNING NOTE: PostgreSQL & database/sql
// ============================================================================
// 1. The Abstract Driver Model:
//    Go's standard library `database/sql` is a vendor-neutral interface.
//    By importing `_ "github.com/jackc/pgx/v5/stdlib"`, the underscore `_`
//    executes the driver's `init()` function, registering the "pgx" driver
//    without exposing its internal symbols directly.
//
// 2. Connection Pooling Built-in:
//    `sql.Open` does NOT establish a single connection; it creates a thread-safe
//    connection pool managed automatically by Go!
//    - `SetMaxOpenConns`: Limits simultaneous active database connections.
//    - `SetMaxIdleConns`: Keeps idle connections ready in pool to avoid handshake latency.
//
// 3. Parameterized Queries (`$1`, `$2`):
//    Never concatenate SQL strings! Go's `db.Query("... WHERE id = $1", id)`
//    sends parameters out-of-band to the database, making SQL injection impossible.
//
// 4. Atomic Transactions (`db.BeginTx`):
//    When saving an order and its line items, we must ensure BOTH succeed or
//    neither does. Go handles this via `tx, err := db.BeginTx(...)`.
//    Using `defer tx.Rollback()` ensures safety: if `tx.Commit()` succeeds,
//    Rollback does nothing; if an error occurs early, Rollback runs automatically.
// ============================================================================
package store

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"

	"vendoros/backend/models"
)

// PostgresStore implements the DataStore interface using a Supabase PostgreSQL database.
type PostgresStore struct {
	db *sql.DB
}

// NewPostgresStore establishes a connection pool to Supabase PostgreSQL.
func NewPostgresStore(dbURL string) (*PostgresStore, error) {
	db, err := sql.Open("pgx", dbURL)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Configure connection pool
	db.SetMaxOpenConns(20)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(15 * time.Minute)

	// Verify connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("failed to connect to Supabase: %w", err)
	}

	return &PostgresStore{db: db}, nil
}

// ----------------------------------------------------------------------------
// Vendor Operations
// ----------------------------------------------------------------------------

func (s *PostgresStore) GetAllVendors() []models.Vendor {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	query := `
		SELECT id, name, contact_person, email, phone, category, tier, status, 
		       payment_terms, reliability_score, on_time_delivery_rate, quality_score, 
		       total_orders, total_spend, created_at
		FROM vendors
		ORDER BY created_at DESC`

	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return []models.Vendor{}
	}
	defer rows.Close()

	var list []models.Vendor
	for rows.Next() {
		var v models.Vendor
		if err := rows.Scan(
			&v.ID, &v.Name, &v.ContactPerson, &v.Email, &v.Phone, &v.Category,
			&v.Tier, &v.Status, &v.PaymentTerms, &v.ReliabilityScore,
			&v.OnTimeDeliveryRate, &v.QualityScore, &v.TotalOrders,
			&v.TotalSpend, &v.CreatedAt,
		); err == nil {
			list = append(list, v)
		}
	}
	return list
}

func (s *PostgresStore) GetVendorByID(id string) (models.Vendor, bool) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	query := `
		SELECT id, name, contact_person, email, phone, category, tier, status, 
		       payment_terms, reliability_score, on_time_delivery_rate, quality_score, 
		       total_orders, total_spend, created_at
		FROM vendors WHERE id = $1`

	var v models.Vendor
	err := s.db.QueryRowContext(ctx, query, id).Scan(
		&v.ID, &v.Name, &v.ContactPerson, &v.Email, &v.Phone, &v.Category,
		&v.Tier, &v.Status, &v.PaymentTerms, &v.ReliabilityScore,
		&v.OnTimeDeliveryRate, &v.QualityScore, &v.TotalOrders,
		&v.TotalSpend, &v.CreatedAt,
	)
	if err != nil {
		return models.Vendor{}, false
	}
	return v, true
}

func (s *PostgresStore) CreateVendor(v models.Vendor) models.Vendor {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

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
	if v.ReliabilityScore == 0 {
		v.ReliabilityScore = 85.0
		v.OnTimeDeliveryRate = 85.0
		v.QualityScore = 4.0
	}

	query := `
		INSERT INTO vendors (id, name, contact_person, email, phone, category, tier, status, payment_terms, reliability_score, on_time_delivery_rate, quality_score, total_orders, total_spend, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`

	_, _ = s.db.ExecContext(ctx, query,
		v.ID, v.Name, v.ContactPerson, v.Email, v.Phone, v.Category,
		v.Tier, v.Status, v.PaymentTerms, v.ReliabilityScore,
		v.OnTimeDeliveryRate, v.QualityScore, v.TotalOrders, v.TotalSpend, v.CreatedAt,
	)
	return v
}

func (s *PostgresStore) UpdateVendor(v models.Vendor) (models.Vendor, bool) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	query := `
		UPDATE vendors 
		SET name = $2, contact_person = $3, email = $4, phone = $5, category = $6, tier = $7, payment_terms = $8
		WHERE id = $1`

	res, err := s.db.ExecContext(ctx, query,
		v.ID, v.Name, v.ContactPerson, v.Email, v.Phone, v.Category, v.Tier, v.PaymentTerms,
	)
	if err != nil {
		return models.Vendor{}, false
	}
	rowsAffected, _ := res.RowsAffected()
	if rowsAffected == 0 {
		return models.Vendor{}, false
	}
	return s.GetVendorByID(v.ID)
}

func (s *PostgresStore) DeleteVendor(id string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Check if vendor has in-flight orders
	var activeCount int
	checkQuery := `SELECT COUNT(*) FROM purchase_orders WHERE vendor_id = $1 AND status IN ('SUBMITTED', 'CONFIRMED', 'SHIPPED')`
	_ = s.db.QueryRowContext(ctx, checkQuery, id).Scan(&activeCount)
	if activeCount > 0 {
		return models.ErrActiveOrdersExist
	}

	res, err := s.db.ExecContext(ctx, "DELETE FROM vendors WHERE id = $1", id)
	if err != nil {
		return err
	}
	rowsAffected, _ := res.RowsAffected()
	if rowsAffected == 0 {
		return models.ErrVendorNotFound
	}
	return nil
}

// ----------------------------------------------------------------------------
// Catalog & Price Comparison Operations
// ----------------------------------------------------------------------------

func (s *PostgresStore) GetAllCatalog() []models.CatalogItem {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	query := `
		SELECT id, vendor_id, vendor_name, sku, item_name, category, 
		       unit_price, currency, min_order_qty, lead_time_days, in_stock, updated_at
		FROM catalog_items ORDER BY item_name ASC`

	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return []models.CatalogItem{}
	}
	defer rows.Close()

	var list []models.CatalogItem
	for rows.Next() {
		var item models.CatalogItem
		if err := rows.Scan(
			&item.ID, &item.VendorID, &item.VendorName, &item.SKU, &item.ItemName,
			&item.Category, &item.UnitPrice, &item.Currency, &item.MinOrderQty,
			&item.LeadTimeDays, &item.InStock, &item.UpdatedAt,
		); err == nil {
			list = append(list, item)
		}
	}
	return list
}

func (s *PostgresStore) ComparePrices(sku string) (models.PriceComparison, bool) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	query := `
		SELECT id, vendor_id, vendor_name, sku, item_name, category, 
		       unit_price, currency, min_order_qty, lead_time_days, in_stock, updated_at
		FROM catalog_items 
		WHERE sku = $1
		ORDER BY unit_price ASC`

	rows, err := s.db.QueryContext(ctx, query, sku)
	if err != nil {
		return models.PriceComparison{}, false
	}
	defer rows.Close()

	var quotes []models.CatalogItem
	var itemName string

	for rows.Next() {
		var q models.CatalogItem
		if err := rows.Scan(
			&q.ID, &q.VendorID, &q.VendorName, &q.SKU, &q.ItemName,
			&q.Category, &q.UnitPrice, &q.Currency, &q.MinOrderQty,
			&q.LeadTimeDays, &q.InStock, &q.UpdatedAt,
		); err == nil {
			quotes = append(quotes, q)
			if itemName == "" {
				itemName = q.ItemName
			}
		}
	}

	if len(quotes) == 0 {
		return models.PriceComparison{}, false
	}

	lowestPrice := quotes[0].UnitPrice
	fastestLeadTime := quotes[0].LeadTimeDays
	cheapestVendor := quotes[0].VendorName

	for _, q := range quotes {
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
		Quotes:          quotes,
		LowestPrice:     lowestPrice,
		FastestLeadTime: fastestLeadTime,
		CheapestVendor:  cheapestVendor,
	}, true
}

func (s *PostgresStore) CreateCatalogItem(item models.CatalogItem) (models.CatalogItem, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	v, ok := s.GetVendorByID(item.VendorID)
	if !ok {
		return models.CatalogItem{}, models.ErrVendorNotFound
	}
	if v.Status == models.StatusSuspended {
		return models.CatalogItem{}, models.ErrVendorSuspended
	}
	if item.UnitPrice <= 0 {
		return models.CatalogItem{}, models.ErrInvalidProductPrice
	}
	if item.MinOrderQty < 1 {
		item.MinOrderQty = 1
	}

	item.SKU = strings.ToUpper(strings.TrimSpace(item.SKU))
	item.ItemName = strings.TrimSpace(item.ItemName)
	item.VendorName = v.Name
	item.UpdatedAt = time.Now()
	if item.Currency == "" {
		item.Currency = "USD"
	}
	if item.ID == "" {
		item.ID = fmt.Sprintf("cat_%d", time.Now().UnixNano()%1000000)
	}

	query := `
		INSERT INTO catalog_items (id, vendor_id, vendor_name, sku, item_name, category, unit_price, currency, min_order_qty, lead_time_days, in_stock, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`

	_, err := s.db.ExecContext(ctx, query,
		item.ID, item.VendorID, item.VendorName, item.SKU, item.ItemName,
		item.Category, item.UnitPrice, item.Currency, item.MinOrderQty,
		item.LeadTimeDays, item.InStock, item.UpdatedAt,
	)
	if err != nil {
		return models.CatalogItem{}, err
	}
	return item, nil
}

// ----------------------------------------------------------------------------
// Purchase Order Operations (Transactions)
// ----------------------------------------------------------------------------

func (s *PostgresStore) GetAllOrders() []models.PurchaseOrder {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	query := `
		SELECT id, po_number, vendor_id, vendor_name, order_date, expected_date, 
		       delivered_date, subtotal, tax_rate, total_amount, status, notes, 
		       was_on_time, quality_rating
		FROM purchase_orders 
		ORDER BY order_date DESC`

	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return []models.PurchaseOrder{}
	}
	defer rows.Close()

	var orders []models.PurchaseOrder
	for rows.Next() {
		var o models.PurchaseOrder
		if err := rows.Scan(
			&o.ID, &o.PONumber, &o.VendorID, &o.VendorName, &o.OrderDate,
			&o.ExpectedDate, &o.DeliveredDate, &o.Subtotal, &o.TaxRate,
			&o.TotalAmount, &o.Status, &o.Notes, &o.WasOnTime, &o.QualityRating,
		); err == nil {
			// Fetch line items for this order
			o.Items = s.getOrderItems(ctx, o.ID)
			orders = append(orders, o)
		}
	}
	return orders
}

func (s *PostgresStore) getOrderItems(ctx context.Context, orderID string) []models.POLineItem {
	query := `SELECT catalog_item_id, sku, name, quantity, unit_price, total_price FROM po_items WHERE order_id = $1`
	rows, err := s.db.QueryContext(ctx, query, orderID)
	if err != nil {
		return []models.POLineItem{}
	}
	defer rows.Close()

	var items []models.POLineItem
	for rows.Next() {
		var item models.POLineItem
		if err := rows.Scan(&item.CatalogItemID, &item.SKU, &item.Name, &item.Quantity, &item.UnitPrice, &item.TotalPrice); err == nil {
			items = append(items, item)
		}
	}
	return items
}

// GetOrdersBySKU finds all purchase orders containing line items for the given SKU.
func (s *PostgresStore) GetOrdersBySKU(sku string) []models.PurchaseOrder {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cleanSKU := strings.ToUpper(strings.TrimSpace(sku))
	query := `
		SELECT DISTINCT po.id, po.po_number, po.vendor_id, po.vendor_name, 
		       po.order_date, po.expected_date, po.delivered_date, po.subtotal, 
		       po.tax_rate, po.total_amount, po.status, po.notes, 
		       po.was_on_time, po.quality_rating
		FROM purchase_orders po
		JOIN po_items pi ON po.id = pi.order_id
		WHERE UPPER(pi.sku) = $1
		ORDER BY po.order_date DESC`

	rows, err := s.db.QueryContext(ctx, query, cleanSKU)
	if err != nil {
		return []models.PurchaseOrder{}
	}
	defer rows.Close()

	var orders []models.PurchaseOrder
	for rows.Next() {
		var o models.PurchaseOrder
		if err := rows.Scan(
			&o.ID, &o.PONumber, &o.VendorID, &o.VendorName,
			&o.OrderDate, &o.ExpectedDate, &o.DeliveredDate, &o.Subtotal,
			&o.TaxRate, &o.TotalAmount, &o.Status, &o.Notes,
			&o.WasOnTime, &o.QualityRating,
		); err == nil {
			o.Items = s.getOrderItems(ctx, o.ID)
			orders = append(orders, o)
		}
	}
	return orders
}

// GetProductOrderSummary aggregates volume, spend, and order history for a SKU.
func (s *PostgresStore) GetProductOrderSummary(sku string) models.ProductOrderSummary {
	orders := s.GetOrdersBySKU(sku)
	cleanSKU := strings.ToUpper(strings.TrimSpace(sku))
	summary := models.ProductOrderSummary{
		SKU:         cleanSKU,
		TotalOrders: len(orders),
		Orders:      orders,
	}

	for _, o := range orders {
		for _, item := range o.Items {
			if strings.EqualFold(item.SKU, cleanSKU) {
				if summary.ItemName == "" {
					summary.ItemName = item.Name
				}
				summary.TotalUnits += item.Quantity
				summary.TotalSpend += item.TotalPrice
			}
		}
	}
	return summary
}

func (s *PostgresStore) CreateOrder(order models.PurchaseOrder) (models.PurchaseOrder, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	v, ok := s.GetVendorByID(order.VendorID)
	if !ok {
		return models.PurchaseOrder{}, models.ErrVendorNotFound
	}
	if v.Status == models.StatusSuspended {
		return models.PurchaseOrder{}, models.ErrVendorSuspended
	}

	// Validate MOQ against catalog items
	for _, it := range order.Items {
		var minQty int
		_ = s.db.QueryRowContext(ctx, `SELECT min_order_qty FROM catalog_items WHERE vendor_id = $1 AND UPPER(sku) = $2 LIMIT 1`, order.VendorID, strings.ToUpper(it.SKU)).Scan(&minQty)
		if minQty > 0 && it.Quantity < minQty {
			return models.PurchaseOrder{}, fmt.Errorf("%w: SKU '%s' requires minimum %d units (ordered: %d)",
				models.ErrMOQViolation, it.SKU, minQty, it.Quantity)
		}
	}

	if order.ID == "" {
		order.ID = fmt.Sprintf("po_%d", time.Now().UnixNano()%1000000)
	}
	if order.PONumber == "" {
		order.PONumber = fmt.Sprintf("PO-%s-%03d", time.Now().Format("2006"), time.Now().Unix()%1000)
	}
	order.OrderDate = time.Now()
	if order.ExpectedDate.IsZero() {
		order.ExpectedDate = time.Now().Add(14 * 24 * time.Hour)
	}
	if order.Status == "" {
		order.Status = models.OrderSubmitted
	}

	var subtotal float64
	for i := range order.Items {
		order.Items[i].TotalPrice = float64(order.Items[i].Quantity) * order.Items[i].UnitPrice
		subtotal += order.Items[i].TotalPrice
	}
	order.Subtotal = subtotal
	if order.TaxRate == 0 {
		order.TaxRate = 0.08
	}
	order.TotalAmount = subtotal * (1 + order.TaxRate)
	order.VendorName = v.Name

	// Execute inside an atomic transaction
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return order, err
	}
	defer tx.Rollback()

	orderQuery := `
		INSERT INTO purchase_orders (id, po_number, vendor_id, vendor_name, order_date, expected_date, subtotal, tax_rate, total_amount, status, notes)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`

	_, err = tx.ExecContext(ctx, orderQuery,
		order.ID, order.PONumber, order.VendorID, order.VendorName, order.OrderDate,
		order.ExpectedDate, order.Subtotal, order.TaxRate, order.TotalAmount,
		order.Status, order.Notes,
	)
	if err != nil {
		return order, err
	}

	itemQuery := `INSERT INTO po_items (order_id, catalog_item_id, sku, name, quantity, unit_price, total_price) VALUES ($1, $2, $3, $4, $5, $6, $7)`
	for _, it := range order.Items {
		_, _ = tx.ExecContext(ctx, itemQuery, order.ID, it.CatalogItemID, it.SKU, it.Name, it.Quantity, it.UnitPrice, it.TotalPrice)
	}

	_ = tx.Commit()
	return order, nil
}

func (s *PostgresStore) UpdateOrderStatus(id string, newStatus models.OrderStatus, wasOnTime *bool, qualityRating int) (models.PurchaseOrder, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	now := time.Now()
	var deliveredDate *time.Time
	if newStatus == models.OrderDelivered {
		deliveredDate = &now
	}

	updateQuery := `
		UPDATE purchase_orders 
		SET status = $2, delivered_date = COALESCE($3, delivered_date), was_on_time = COALESCE($4, was_on_time), quality_rating = COALESCE($5, quality_rating)
		WHERE id = $1
		RETURNING vendor_id, total_amount`

	var vendorID string
	var totalAmount float64
	var qRatingVal sql.NullInt32
	if qualityRating > 0 {
		qRatingVal = sql.NullInt32{Int32: int32(qualityRating), Valid: true}
	}

	err := s.db.QueryRowContext(ctx, updateQuery, id, newStatus, deliveredDate, wasOnTime, qRatingVal).Scan(&vendorID, &totalAmount)
	if err != nil {
		return models.PurchaseOrder{}, fmt.Errorf("order not found: %w", err)
	}

	// If delivered, recalculate vendor reliability in Postgres
	if newStatus == models.OrderDelivered {
		s.recalculateVendorMetrics(ctx, vendorID, totalAmount)
	}

	return s.getOrderByID(ctx, id)
}

func (s *PostgresStore) getOrderByID(ctx context.Context, id string) (models.PurchaseOrder, error) {
	query := `
		SELECT id, po_number, vendor_id, vendor_name, order_date, expected_date, 
		       delivered_date, subtotal, tax_rate, total_amount, status, notes, 
		       was_on_time, quality_rating
		FROM purchase_orders WHERE id = $1`

	var o models.PurchaseOrder
	err := s.db.QueryRowContext(ctx, query, id).Scan(
		&o.ID, &o.PONumber, &o.VendorID, &o.VendorName, &o.OrderDate,
		&o.ExpectedDate, &o.DeliveredDate, &o.Subtotal, &o.TaxRate,
		&o.TotalAmount, &o.Status, &o.Notes, &o.WasOnTime, &o.QualityRating,
	)
	if err != nil {
		return models.PurchaseOrder{}, err
	}
	o.Items = s.getOrderItems(ctx, o.ID)
	return o, nil
}

func (s *PostgresStore) recalculateVendorMetrics(ctx context.Context, vendorID string, orderAmount float64) {
	statsQuery := `
		SELECT COUNT(*),
		       COUNT(*) FILTER (WHERE was_on_time = TRUE),
		       COALESCE(AVG(quality_rating), 4.0)
		FROM purchase_orders
		WHERE vendor_id = $1 AND status = 'DELIVERED'`

	var totalDelivered, onTimeCount int
	var avgQuality float64
	_ = s.db.QueryRowContext(ctx, statsQuery, vendorID).Scan(&totalDelivered, &onTimeCount, &avgQuality)

	if totalDelivered > 0 {
		onTimeRate := (float64(onTimeCount) / float64(totalDelivered)) * 100
		relScore := (onTimeRate * 0.40) + ((avgQuality / 5.0) * 100.0 * 0.40) + 20.0
		if relScore > 100.0 {
			relScore = 100.0
		}

		updateVendorQuery := `
			UPDATE vendors 
			SET total_orders = total_orders + 1,
			    total_spend = total_spend + $2,
			    on_time_delivery_rate = $3,
			    quality_score = $4,
			    reliability_score = $5
			WHERE id = $1`

		_, _ = s.db.ExecContext(ctx, updateVendorQuery, vendorID, orderAmount, onTimeRate, avgQuality, relScore)
	}
}

// ----------------------------------------------------------------------------
// Analytics
// ----------------------------------------------------------------------------

func (s *PostgresStore) GetAnalytics() models.DashboardAnalytics {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	summaryQuery := `
		SELECT COALESCE(SUM(total_spend), 0),
		       COUNT(*) FILTER (WHERE status = 'ACTIVE'),
		       COALESCE(AVG(reliability_score), 85.0)
		FROM vendors`

	var totalSpend, avgReliability float64
	var activeVendors int
	_ = s.db.QueryRowContext(ctx, summaryQuery).Scan(&totalSpend, &activeVendors, &avgReliability)

	ordersQuery := `
		SELECT status, COUNT(*) 
		FROM purchase_orders 
		GROUP BY status`

	ordersByStatus := make(map[string]int)
	activeOrders := 0
	rows, err := s.db.QueryContext(ctx, ordersQuery)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var st string
			var cnt int
			if rows.Scan(&st, &cnt) == nil {
				ordersByStatus[st] = cnt
				if st == "SUBMITTED" || st == "CONFIRMED" || st == "SHIPPED" {
					activeOrders += cnt
				}
			}
		}
	}

	return models.DashboardAnalytics{
		TotalSpend:         totalSpend,
		ActiveVendors:      activeVendors,
		AverageReliability: avgReliability,
		ActiveOrders:       activeOrders,
		OrdersByStatus:     ordersByStatus,
		TopSuppliers:       s.GetAllVendors(),
	}
}

// ----------------------------------------------------------------------------
// Company Settings Operations
// ----------------------------------------------------------------------------

func (s *PostgresStore) GetSettings() models.CompanySettings {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	query := `
		SELECT company_name, tax_id, operating_currency, default_tax_rate, 
		       shipping_address, billing_address, probation_threshold, 
		       high_value_approval_min, contact_email, contact_phone, updated_at
		FROM company_settings LIMIT 1`

	var cs models.CompanySettings
	err := s.db.QueryRowContext(ctx, query).Scan(
		&cs.CompanyName, &cs.TaxID, &cs.OperatingCurrency, &cs.DefaultTaxRate,
		&cs.ShippingAddress, &cs.BillingAddress, &cs.ProbationThreshold,
		&cs.HighValueApprovalMin, &cs.ContactEmail, &cs.ContactPhone, &cs.UpdatedAt,
	)
	if err != nil {
		// Return default settings if table is empty
		return models.CompanySettings{
			CompanyName:          "Nexus Aerospace & Robotics Ltd.",
			TaxID:                "US-EIN-98432109",
			OperatingCurrency:    "USD",
			DefaultTaxRate:       0.08,
			ShippingAddress:      "450 Innovation Parkway, Dock B, Austin, TX 78701",
			BillingAddress:       "450 Innovation Parkway, Suite 100, Austin, TX 78701",
			ProbationThreshold:   75.0,
			HighValueApprovalMin: 10000.0,
			ContactEmail:         "procurement@nexus-aerospace.com",
			ContactPhone:         "+1 (512) 890-4321",
			UpdatedAt:            time.Now(),
		}
	}
	return cs
}

func (s *PostgresStore) UpdateSettings(cs models.CompanySettings) models.CompanySettings {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cs.UpdatedAt = time.Now()

	query := `
		INSERT INTO company_settings (id, company_name, tax_id, operating_currency, default_tax_rate, 
		                              shipping_address, billing_address, probation_threshold, 
		                              high_value_approval_min, contact_email, contact_phone, updated_at)
		VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		ON CONFLICT (id) DO UPDATE SET
			company_name = EXCLUDED.company_name,
			tax_id = EXCLUDED.tax_id,
			operating_currency = EXCLUDED.operating_currency,
			default_tax_rate = EXCLUDED.default_tax_rate,
			shipping_address = EXCLUDED.shipping_address,
			billing_address = EXCLUDED.billing_address,
			probation_threshold = EXCLUDED.probation_threshold,
			high_value_approval_min = EXCLUDED.high_value_approval_min,
			contact_email = EXCLUDED.contact_email,
			contact_phone = EXCLUDED.contact_phone,
			updated_at = EXCLUDED.updated_at`

	_, _ = s.db.ExecContext(ctx, query,
		cs.CompanyName, cs.TaxID, cs.OperatingCurrency, cs.DefaultTaxRate,
		cs.ShippingAddress, cs.BillingAddress, cs.ProbationThreshold,
		cs.HighValueApprovalMin, cs.ContactEmail, cs.ContactPhone, cs.UpdatedAt,
	)

	return cs
}

// ClearAllData truncates all transactional tables in Supabase PostgreSQL.
func (s *PostgresStore) ClearAllData() error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := s.db.ExecContext(ctx, "TRUNCATE TABLE product_inventory, products, po_items, purchase_orders, catalog_items, vendors CASCADE")
	return err
}

// LoadSeedData populates initial seed data into Supabase tables for testing.
func (s *PostgresStore) LoadSeedData() error {
	v1 := models.Vendor{
		ID: "vnd_acme", Name: "Acme Precision Components", ContactPerson: "Sarah Jenkins",
		Email: "s.jenkins@acmeprecision.com", Phone: "+1 (555) 234-8901",
		Category: "Precision Hardware & CNC", Tier: "Strategic", Status: models.StatusActive,
		PaymentTerms: "Net 30", ReliabilityScore: 94.5, OnTimeDeliveryRate: 96.0,
		QualityScore: 4.8, TotalOrders: 18, TotalSpend: 142500.00,
	}
	s.CreateVendor(v1)

	p1 := models.Product{
		Name:             "Titanium Hex Bolt M4x20mm",
		Description:      "Aerospace-grade Grade 5 Titanium hex socket head cap screw",
		SKU:              "BOLT-M4-TI",
		Category:         "Hardware",
		UnitOfMeasure:    "units",
		TargetStockLevel: 500,
	}
	createdP1, _ := s.CreateProduct(p1)

	cat1 := models.CatalogItem{
		VendorID:     v1.ID,
		SKU:          "BOLT-M4-TI",
		ItemName:     "Titanium Hex Bolt M4x20mm",
		Category:     "Hardware",
		UnitPrice:    1.45,
		Currency:     "USD",
		MinOrderQty:  50,
		LeadTimeDays: 7,
		InStock:      true,
	}
	_, _ = s.CreateCatalogItem(cat1)

	if createdP1.ID != "" {
		_, _ = s.UpsertInventory(models.InventoryRecord{
			ProductID:      createdP1.ID,
			VendorID:       v1.ID,
			QuantityOnHand: 250,
			ReorderPoint:   100,
			Notes:          "Primary factory buffer",
		})
	}
	return nil
}

// ----------------------------------------------------------------------------
// Product Operations (PostgreSQL)
// ----------------------------------------------------------------------------

func (s *PostgresStore) GetAllProducts() []models.ProductWithInventory {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	rows, err := s.db.QueryContext(ctx, `
		SELECT id, name, description, sku, category, unit_of_measure, target_stock_level, created_at
		FROM products ORDER BY created_at DESC`)
	if err != nil {
		return []models.ProductWithInventory{}
	}
	defer rows.Close()

	var result []models.ProductWithInventory
	for rows.Next() {
		var p models.Product
		if err := rows.Scan(&p.ID, &p.Name, &p.Description, &p.SKU, &p.Category, &p.UnitOfMeasure, &p.TargetStockLevel, &p.CreatedAt); err != nil {
			continue
		}
		inv := s.getInventoryForProductNoLock(ctx, p.ID)
		totalStock := 0
		isLow := false
		for _, r := range inv {
			totalStock += r.QuantityOnHand
			if r.IsLowStock {
				isLow = true
			}
		}
		result = append(result, models.ProductWithInventory{
			Product:       p,
			TotalStock:    totalStock,
			SupplierCount: len(inv),
			IsLowStock:    isLow,
			Inventory:     inv,
		})
	}
	if result == nil {
		return []models.ProductWithInventory{}
	}
	return result
}

func (s *PostgresStore) GetProductByID(id string) (models.ProductWithInventory, bool) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var p models.Product
	err := s.db.QueryRowContext(ctx, `
		SELECT id, name, description, sku, category, unit_of_measure, target_stock_level, created_at
		FROM products WHERE id = $1`, id).
		Scan(&p.ID, &p.Name, &p.Description, &p.SKU, &p.Category, &p.UnitOfMeasure, &p.TargetStockLevel, &p.CreatedAt)
	if err != nil {
		return models.ProductWithInventory{}, false
	}
	inv := s.getInventoryForProductNoLock(ctx, id)
	totalStock := 0
	isLow := false
	for _, r := range inv {
		totalStock += r.QuantityOnHand
		if r.IsLowStock {
			isLow = true
		}
	}
	return models.ProductWithInventory{
		Product:       p,
		TotalStock:    totalStock,
		SupplierCount: len(inv),
		IsLowStock:    isLow,
		Inventory:     inv,
	}, true
}

func (s *PostgresStore) CreateProduct(p models.Product) (models.Product, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if p.UnitOfMeasure == "" {
		p.UnitOfMeasure = "units"
	}

	err := s.db.QueryRowContext(ctx, `
		INSERT INTO products (name, description, sku, category, unit_of_measure, target_stock_level)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, created_at`,
		p.Name, p.Description, strings.ToUpper(strings.TrimSpace(p.SKU)),
		p.Category, p.UnitOfMeasure, p.TargetStockLevel).
		Scan(&p.ID, &p.CreatedAt)
	if err != nil {
		if strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "duplicate") {
			return models.Product{}, fmt.Errorf("a product with SKU %q already exists", p.SKU)
		}
		return models.Product{}, fmt.Errorf("failed to create product: %w", err)
	}
	p.SKU = strings.ToUpper(strings.TrimSpace(p.SKU))
	return p, nil
}

func (s *PostgresStore) UpdateProduct(p models.Product) (models.Product, bool) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	res, err := s.db.ExecContext(ctx, `
		UPDATE products SET name=$1, description=$2, category=$3, unit_of_measure=$4, target_stock_level=$5
		WHERE id=$6`,
		p.Name, p.Description, p.Category, p.UnitOfMeasure, p.TargetStockLevel, p.ID)
	if err != nil {
		return models.Product{}, false
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		return models.Product{}, false
	}
	return p, true
}

func (s *PostgresStore) DeleteProduct(id string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	res, err := s.db.ExecContext(ctx, "DELETE FROM products WHERE id=$1", id)
	if err != nil {
		return fmt.Errorf("failed to delete product: %w", err)
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		return models.ErrProductNotFound
	}
	return nil
}

// ----------------------------------------------------------------------------
// Inventory Operations (PostgreSQL)
// ----------------------------------------------------------------------------

func (s *PostgresStore) getInventoryForProductNoLock(ctx context.Context, productID string) []models.InventoryWithVendor {
	rows, err := s.db.QueryContext(ctx, `
		SELECT pi.id, pi.product_id, pi.vendor_id, pi.quantity_on_hand, pi.reorder_point, pi.last_updated, pi.notes,
		       v.name, v.status, v.tier
		FROM product_inventory pi
		JOIN vendors v ON v.id = pi.vendor_id
		WHERE pi.product_id = $1
		ORDER BY v.name`, productID)
	if err != nil {
		return []models.InventoryWithVendor{}
	}
	defer rows.Close()

	var result []models.InventoryWithVendor
	for rows.Next() {
		var r models.InventoryWithVendor
		if err := rows.Scan(
			&r.ID, &r.ProductID, &r.VendorID, &r.QuantityOnHand, &r.ReorderPoint, &r.LastUpdated, &r.Notes,
			&r.VendorName, &r.VendorStatus, &r.VendorTier,
		); err != nil {
			continue
		}
		r.IsLowStock = r.ReorderPoint > 0 && r.QuantityOnHand <= r.ReorderPoint
		result = append(result, r)
	}
	if result == nil {
		return []models.InventoryWithVendor{}
	}
	return result
}

func (s *PostgresStore) GetInventoryForProduct(productID string) []models.InventoryWithVendor {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return s.getInventoryForProductNoLock(ctx, productID)
}

func (s *PostgresStore) UpsertInventory(rec models.InventoryRecord) (models.InventoryRecord, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if rec.QuantityOnHand < 0 {
		return models.InventoryRecord{}, models.ErrNegativeQuantity
	}

	err := s.db.QueryRowContext(ctx, `
		INSERT INTO product_inventory (product_id, vendor_id, quantity_on_hand, reorder_point, notes, last_updated)
		VALUES ($1, $2, $3, $4, $5, NOW())
		ON CONFLICT (product_id, vendor_id) DO UPDATE
		  SET quantity_on_hand = EXCLUDED.quantity_on_hand,
		      reorder_point    = EXCLUDED.reorder_point,
		      notes            = EXCLUDED.notes,
		      last_updated     = NOW()
		RETURNING id, last_updated`,
		rec.ProductID, rec.VendorID, rec.QuantityOnHand, rec.ReorderPoint, rec.Notes).
		Scan(&rec.ID, &rec.LastUpdated)
	if err != nil {
		return models.InventoryRecord{}, fmt.Errorf("failed to upsert inventory: %w", err)
	}
	return rec, nil
}

func (s *PostgresStore) DeleteInventoryRecord(productID string, vendorID string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	res, err := s.db.ExecContext(ctx,
		"DELETE FROM product_inventory WHERE product_id=$1 AND vendor_id=$2", productID, vendorID)
	if err != nil {
		return fmt.Errorf("failed to delete inventory record: %w", err)
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		return models.ErrInventoryNotFound
	}
	return nil
}
