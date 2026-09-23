"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthModal from "@/components/AuthModal";
import { AuthUser, supabase, isSupabaseConfigured } from "@/lib/supabase";

// Types matching the Go backend models
interface Vendor {
  id: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  category: string;
  tier: "Strategic" | "Preferred" | "Standard" | "Under Review";
  status: "ACTIVE" | "PROBATION" | "SUSPENDED";
  paymentTerms: string;
  reliabilityScore: number;
  onTimeDeliveryRate: number;
  qualityScore: number;
  totalOrders: number;
  totalSpend: number;
  createdAt: string;
}

interface CatalogItem {
  id: string;
  vendorId: string;
  vendorName: string;
  sku: string;
  itemName: string;
  category: string;
  unitPrice: number;
  currency: string;
  minOrderQty: number;
  leadTimeDays: number;
  inStock: boolean;
  updatedAt: string;
}

interface PriceComparison {
  sku: string;
  itemName: string;
  quotes: CatalogItem[];
  lowestPrice: number;
  fastestLeadTime: number;
  cheapestVendor: string;
}

interface POLineItem {
  catalogItemId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface PurchaseOrder {
  id: string;
  poNumber: string;
  vendorId: string;
  vendorName: string;
  orderDate: string;
  expectedDate: string;
  deliveredDate?: string;
  items: POLineItem[];
  subtotal: number;
  taxRate: number;
  totalAmount: number;
  status: "DRAFT" | "SUBMITTED" | "CONFIRMED" | "SHIPPED" | "DELIVERED" | "CANCELLED";
  notes: string;
  wasOnTime?: boolean;
  qualityRating?: number;
}

interface DashboardAnalytics {
  totalSpend: number;
  activeVendors: number;
  averageReliability: number;
  activeOrders: number;
  ordersByStatus: Record<string, number>;
  topSuppliers: Vendor[];
}

interface CompanySettings {
  companyName: string;
  taxId: string;
  operatingCurrency: string;
  defaultTaxRate: number;
  shippingAddress: string;
  billingAddress: string;
  probationThreshold: number;
  highValueApprovalMin: number;
  contactEmail: string;
  contactPhone: string;
  updatedAt?: string;
}

interface ProductOrderSummary {
  sku: string;
  itemName: string;
  totalUnits: number;
  totalSpend: number;
  totalOrders: number;
  orders: PurchaseOrder[];
}

interface ProductInventory {
  id: number;
  productId: string;
  vendorId: string;
  quantityOnHand: number;
  reorderPoint: number;
  lastUpdated: string;
  notes: string;
  vendorName: string;
  vendorStatus: string;
  vendorTier: string;
  isLowStock: boolean;
}

interface ProductWithInventory {
  id: string;
  name: string;
  description: string;
  sku: string;
  category: string;
  unitOfMeasure: string;
  targetStockLevel: number;
  createdAt: string;
  totalStock: number;
  supplierCount: number;
  isLowStock: boolean;
  inventory: ProductInventory[];
}

function getApiBase(): string {
  if (process.env.NEXT_PUBLIC_API_URL && process.env.NEXT_PUBLIC_API_URL.trim() !== "") {
    const raw = process.env.NEXT_PUBLIC_API_URL.trim().replace(/\/+$/, "");
    return raw.endsWith("/api") ? raw : `${raw}/api`;
  }
  if (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
    return "/api";
  }
  return "http://localhost:8080/api";
}

const API_BASE = getApiBase();

export default function VendorOSPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"vendors" | "products" | "pricing" | "orders" | "analytics" | "settings">("vendors");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Auth state
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authToken, setAuthToken] = useState<string>("");
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Data states
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [products, setProducts] = useState<ProductWithInventory[]>([]);
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [settings, setSettings] = useState<CompanySettings>({
    companyName: "Nexus Aerospace & Robotics Ltd.",
    taxId: "US-EIN-98432109",
    operatingCurrency: "USD",
    defaultTaxRate: 0.08,
    shippingAddress: "450 Innovation Parkway, Dock B, Austin, TX 78701",
    billingAddress: "450 Innovation Parkway, Suite 100, Austin, TX 78701",
    probationThreshold: 75.0,
    highValueApprovalMin: 10000.0,
    contactEmail: "procurement@nexus-aerospace.com",
    contactPhone: "+1 (512) 890-4321",
  });
  const [settingsSavedToast, setSettingsSavedToast] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  const [loading, setLoading] = useState(true);
  const [serverOnline, setServerOnline] = useState(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTier, setSelectedTier] = useState<string>("ALL");
  const [selectedSKU, setSelectedSKU] = useState<string>("BOLT-M4-TI");
  const [comparison, setComparison] = useState<PriceComparison | null>(null);

  // Modals
  const [isAddVendorOpen, setIsAddVendorOpen] = useState(false);
  const [newVendor, setNewVendor] = useState({
    name: "",
    contactPerson: "",
    email: "",
    phone: "",
    category: "Precision Hardware & CNC",
    tier: "Strategic" as const,
    paymentTerms: "Net 30",
  });

  // Product Creation Modal
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [newProduct, setNewProduct] = useState({
    vendorId: "",
    sku: "",
    itemName: "",
    category: "Precision Hardware & CNC",
    unitPrice: 35.0,
    minOrderQty: 10,
    leadTimeDays: 7,
    inStock: true,
  });
  const [productModalError, setProductModalError] = useState("");

  // Master Product & Multi-Supplier Inventory State
  const [productSearchQuery, setProductSearchQuery] = useState("");
  const [selectedStockFilter, setSelectedStockFilter] = useState<"ALL" | "LOW" | "HEALTHY" | "DEPLETED">("ALL");
  const [isAddMasterProductOpen, setIsAddMasterProductOpen] = useState(false);
  const [newMasterProduct, setNewMasterProduct] = useState({
    name: "",
    sku: "",
    category: "Precision Hardware & CNC",
    description: "",
    unitOfMeasure: "units",
    targetStockLevel: 250,
  });
  const [masterProductError, setMasterProductError] = useState("");

  const [selectedProductForInventory, setSelectedProductForInventory] = useState<ProductWithInventory | null>(null);
  const [isLinkSupplierOpen, setIsLinkSupplierOpen] = useState(false);
  const [linkSupplierForm, setLinkSupplierForm] = useState({
    vendorId: "",
    quantityOnHand: 100,
    reorderPoint: 50,
    notes: "",
  });
  const [linkSupplierError, setLinkSupplierError] = useState("");

  const [editingStockModal, setEditingStockModal] = useState<{
    productId: string;
    productName: string;
    vendorId: string;
    vendorName: string;
    quantityOnHand: number;
    reorderPoint: number;
    notes: string;
  } | null>(null);

  // Product Order Tracking Modal
  const [isTrackingModalOpen, setIsTrackingModalOpen] = useState(false);
  const [trackingSKU, setTrackingSKU] = useState("");
  const [trackingSummary, setTrackingSummary] = useState<ProductOrderSummary | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);

  const [deliveryModalOrder, setDeliveryModalOrder] = useState<PurchaseOrder | null>(null);
  const [deliveryWasOnTime, setDeliveryWasOnTime] = useState(true);
  const [deliveryQualityRating, setDeliveryQualityRating] = useState(5);

  // Purchase Order Generation Modal
  const [isNewOrderOpen, setIsNewOrderOpen] = useState(false);
  const [newOrderVendorId, setNewOrderVendorId] = useState("");
  const [newOrderItemName, setNewOrderItemName] = useState("");
  const [newOrderSKU, setNewOrderSKU] = useState("");
  const [newOrderQty, setNewOrderQty] = useState(10);
  const [newOrderPrice, setNewOrderPrice] = useState(25.0);
  const [selectedCatalogItem, setSelectedCatalogItem] = useState<CatalogItem | null>(null);
  const [orderError, setOrderError] = useState("");

  // Load session on startup with Supabase Auth integration
  useEffect(() => {
    if (isSupabaseConfigured && supabase) {
      // 1. Check existing live Supabase session
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          const user: AuthUser = {
            id: session.user.id,
            email: session.user.email || "",
            name: session.user.user_metadata?.name || session.user.email?.split("@")[0] || "User",
            role: session.user.user_metadata?.role || "Procurement Manager",
          };
          setCurrentUser(user);
          setAuthToken(session.access_token);
          localStorage.setItem("vendoros_user", JSON.stringify(user));
          localStorage.setItem("vendoros_token", session.access_token);
        } else {
          // No live session yet - clean state for real account testing
          setCurrentUser(null);
          setAuthToken("");
          localStorage.removeItem("vendoros_user");
          localStorage.removeItem("vendoros_token");
        }
      });

      // 2. Subscribe to auth events (SIGN_IN, SIGN_OUT, TOKEN_REFRESHED)
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          const user: AuthUser = {
            id: session.user.id,
            email: session.user.email || "",
            name: session.user.user_metadata?.name || session.user.email?.split("@")[0] || "User",
            role: session.user.user_metadata?.role || "Procurement Manager",
          };
          setCurrentUser(user);
          setAuthToken(session.access_token);
          localStorage.setItem("vendoros_user", JSON.stringify(user));
          localStorage.setItem("vendoros_token", session.access_token);
        } else {
          setCurrentUser(null);
          setAuthToken("");
          localStorage.removeItem("vendoros_user");
          localStorage.removeItem("vendoros_token");
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    } else {
      // Offline / Local dev fallback
      const savedUser = localStorage.getItem("vendoros_user");
      const savedToken = localStorage.getItem("vendoros_token");
      if (savedUser && savedToken) {
        try {
          setCurrentUser(JSON.parse(savedUser));
          setAuthToken(savedToken);
        } catch (e) {
          console.error(e);
        }
      }
    }
  }, []);

  // Helper for authenticated requests to Go backend
  const authHeaders = () => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    }
    return headers;
  };

  // Fetch initial data
  const fetchData = async () => {
    try {
      const [vRes, oRes, aRes, sRes, cRes, pRes] = await Promise.all([
        fetch(`${API_BASE}/vendors`, { headers: authHeaders() }).then((r) => (r.ok ? r.json() : [])),
        fetch(`${API_BASE}/orders`, { headers: authHeaders() }).then((r) => (r.ok ? r.json() : [])),
        fetch(`${API_BASE}/analytics`, { headers: authHeaders() }).then((r) => (r.ok ? r.json() : null)),
        fetch(`${API_BASE}/settings`, { headers: authHeaders() }).then((r) => (r.ok ? r.json() : null)),
        fetch(`${API_BASE}/catalog`, { headers: authHeaders() }).then((r) => (r.ok ? r.json() : [])),
        fetch(`${API_BASE}/products`, { headers: authHeaders() }).then((r) => (r.ok ? r.json() : [])),
      ]);

      setVendors(Array.isArray(vRes) ? vRes : []);
      setOrders(Array.isArray(oRes) ? oRes : []);
      setAnalytics(aRes && !aRes.error ? aRes : null);
      if (sRes && sRes.companyName) {
        setSettings(sRes);
      }
      const catalog: CatalogItem[] = Array.isArray(cRes) ? cRes : [];
      setCatalogItems(catalog);
      if (catalog.length > 0) {
        const skus: string[] = Array.from(new Set(catalog.map((i: CatalogItem) => i.sku).filter(Boolean)));
        setSelectedSKU((prev: string) => (skus.includes(prev) ? prev : (skus[0] || "")));
      } else {
        setSelectedSKU("");
        setComparison(null);
      }

      const prods: ProductWithInventory[] = Array.isArray(pRes) ? pRes : [];
      setProducts(prods);
      // Keep drawer in sync if open
      setSelectedProductForInventory((prev) => {
        if (!prev) return null;
        return prods.find((p) => p.id === prev.id) || null;
      });

      setServerOnline(true);
    } catch (err) {
      console.error("Failed to connect to Go server:", err);
      setServerOnline(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [authToken]);

  // Fetch price comparison whenever selectedSKU changes
  useEffect(() => {
    if (selectedSKU) {
      fetch(`${API_BASE}/catalog/compare?sku=${encodeURIComponent(selectedSKU)}`, { headers: authHeaders() })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => setComparison(data))
        .catch((err) => {
          console.error("Error fetching comparison:", err);
          setComparison(null);
        });
    } else {
      setComparison(null);
    }
  }, [selectedSKU, authToken]);

  // Handle Authentication Success
  const handleAuthSuccess = (user: AuthUser, token: string) => {
    setCurrentUser(user);
    setAuthToken(token);
    localStorage.setItem("vendoros_user", JSON.stringify(user));
    localStorage.setItem("vendoros_token", token);
  };

  // Handle Sign Out
  const handleSignOut = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut();
    }
    setCurrentUser(null);
    setAuthToken("");
    localStorage.removeItem("vendoros_user");
    localStorage.removeItem("vendoros_token");
    router.push("/auth");
  };

  // Handle Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const res = await fetch(`${API_BASE}/settings`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        const updated = await res.json();
        setSettings(updated);
        setSettingsSavedToast(true);
        setTimeout(() => setSettingsSavedToast(false), 3000);
      }
    } catch (err) {
      alert("Error saving settings: " + err);
    } finally {
      setSavingSettings(false);
    }
  };

  // Handle Clear All Data (Clean Slate for real account testing)
  const handleClearAllData = async () => {
    if (!confirm("Are you sure you want to clear all demo data? This will reset all suppliers, quotes, and orders to 0 so you can test on an empty clean slate.")) {
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/demo/clear`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (res.ok) {
        await fetchData();
        return;
      }
    } catch (err) {
      console.warn("Backend clear endpoint unavailable, clearing local state:", err);
    }
    // Fallback: Clear in-memory client state directly
    setVendors([]);
    setOrders([]);
    setCatalogItems([]);
    setSelectedSKU("");
    setComparison(null);
    setAnalytics({
      totalSpend: 0,
      activeVendors: 0,
      averageReliability: 0,
      activeOrders: 0,
      ordersByStatus: {},
      topSuppliers: [],
    });
  };

  // Handle Load Sample Demo Data
  const handleLoadDemoData = async () => {
    try {
      const res = await fetch(`${API_BASE}/demo/seed`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (err) {
      alert("Error loading demo data: " + err);
    }
  };

  // Handle Add Vendor
  const handleCreateVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVendor.name) return;

    try {
      const res = await fetch(`${API_BASE}/vendors`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(newVendor),
      });
      if (res.ok) {
        setIsAddVendorOpen(false);
        setNewVendor({
          name: "",
          contactPerson: "",
          email: "",
          phone: "",
          category: "Precision Hardware & CNC",
          tier: "Strategic",
          paymentTerms: "Net 30",
        });
        await fetchData();
      }
    } catch (err) {
      alert("Error adding vendor: " + err);
    }
  };

  // Handle Order Status Update
  const handleUpdateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const res = await fetch(`${API_BASE}/orders/${orderId}/status`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (err) {
      alert("Error updating order: " + err);
    }
  };

  // Complete Delivery & Recalculate Reliability Score
  const handleConfirmDelivery = async () => {
    if (!deliveryModalOrder) return;
    try {
      const res = await fetch(`${API_BASE}/orders/${deliveryModalOrder.id}/status`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({
          status: "DELIVERED",
          wasOnTime: deliveryWasOnTime,
          qualityRating: deliveryQualityRating,
        }),
      });
      if (res.ok) {
        setDeliveryModalOrder(null);
        await fetchData();
      }
    } catch (err) {
      alert("Error confirming delivery: " + err);
    }
  };

  // Create New PO with Edge Case validation (MOQ, Suspended Supplier)
  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrderError("");
    if (!newOrderVendorId || !newOrderItemName) {
      setOrderError("Target supplier and item name are required.");
      return;
    }

    // EDGE CASE: Check if supplier is SUSPENDED
    const targetVendor = vendors.find((v) => v.id === newOrderVendorId);
    if (targetVendor?.status === "SUSPENDED") {
      setOrderError("Cannot create order: Selected supplier is currently SUSPENDED.");
      return;
    }

    // EDGE CASE: Check MOQ
    if (selectedCatalogItem && Number(newOrderQty) < selectedCatalogItem.minOrderQty) {
      setOrderError(`Minimum Order Quantity (MOQ) for this item is ${selectedCatalogItem.minOrderQty} units.`);
      return;
    }

    const payload = {
      vendorId: newOrderVendorId,
      items: [
        {
          catalogItemId: selectedCatalogItem?.id || "custom_item",
          sku: newOrderSKU || selectedCatalogItem?.sku || "CUSTOM-SKU",
          name: newOrderItemName,
          quantity: Number(newOrderQty),
          unitPrice: Number(newOrderPrice),
        },
      ],
      notes: "Direct procurement order via VendorOS",
      status: "SUBMITTED",
      taxRate: settings.defaultTaxRate || 0.08,
    };

    try {
      const res = await fetch(`${API_BASE}/orders`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setIsNewOrderOpen(false);
        setNewOrderItemName("");
        setNewOrderSKU("");
        setSelectedCatalogItem(null);
        setOrderError("");
        await fetchData();
      } else {
        const data = await res.json();
        setOrderError(data.error || "Failed to create purchase order");
      }
    } catch (err: any) {
      setOrderError("Error creating order: " + err.message);
    }
  };

  // 1-Click Order From Product Quote in Matrix
  const handleOrderFromQuote = (q: CatalogItem) => {
    setNewOrderVendorId(q.vendorId);
    setNewOrderItemName(q.itemName);
    setNewOrderSKU(q.sku);
    setNewOrderPrice(q.unitPrice);
    setNewOrderQty(q.minOrderQty); // Auto prefill to supplier MOQ
    setSelectedCatalogItem(q);
    setOrderError("");
    setIsNewOrderOpen(true);
  };

  // Create Product & Link to Supplier
  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setProductModalError("");
    if (!newProduct.vendorId) {
      setProductModalError("Please select a target supplier.");
      return;
    }
    const targetVendor = vendors.find((v) => v.id === newProduct.vendorId);
    if (targetVendor?.status === "SUSPENDED") {
      setProductModalError("Cannot add products: Selected supplier is currently SUSPENDED.");
      return;
    }
    if (newProduct.unitPrice <= 0) {
      setProductModalError("Unit price must be strictly greater than $0.00.");
      return;
    }
    if (newProduct.minOrderQty < 1) {
      setProductModalError("Minimum Order Quantity (MOQ) must be at least 1.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/catalog`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          ...newProduct,
          sku: newProduct.sku.trim().toUpperCase(),
          itemName: newProduct.itemName.trim(),
          currency: settings.operatingCurrency || "USD",
        }),
      });

      if (res.ok) {
        const created = await res.json();
        setIsAddProductOpen(false);
        setSelectedSKU(created.sku);
        setNewProduct({
          vendorId: "",
          sku: "",
          itemName: "",
          category: "Precision Hardware & CNC",
          unitPrice: 35.0,
          minOrderQty: 10,
          leadTimeDays: 7,
          inStock: true,
        });
        await fetchData();
      } else {
        const data = await res.json();
        setProductModalError(data.error || "Failed to create product quote");
      }
    } catch (err: any) {
      setProductModalError("Network error: " + err.message);
    }
  };

  // Open Product Order Tracking Modal
  const handleOpenProductTracking = async (sku: string) => {
    setTrackingSKU(sku);
    setIsTrackingModalOpen(true);
    setTrackingLoading(true);
    try {
      const res = await fetch(`${API_BASE}/catalog/orders?sku=${encodeURIComponent(sku)}`, {
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setTrackingSummary(data);
      } else {
        setTrackingSummary(null);
      }
    } catch (err) {
      console.error("Error loading product order tracking:", err);
    } finally {
      setTrackingLoading(false);
    }
  };

  // Master Product Operations
  const handleCreateMasterProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setMasterProductError("");
    if (!newMasterProduct.name.trim() || !newMasterProduct.sku.trim()) {
      setMasterProductError("Product Name and Master SKU are required.");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/products`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          ...newMasterProduct,
          name: newMasterProduct.name.trim(),
          sku: newMasterProduct.sku.trim().toUpperCase(),
          targetStockLevel: Number(newMasterProduct.targetStockLevel) || 0,
        }),
      });
      if (res.ok) {
        setIsAddMasterProductOpen(false);
        setNewMasterProduct({
          name: "",
          sku: "",
          category: "Precision Hardware & CNC",
          description: "",
          unitOfMeasure: "units",
          targetStockLevel: 250,
        });
        await fetchData();
      } else {
        const data = await res.json();
        setMasterProductError(data.error || "Failed to create product");
      }
    } catch (err: any) {
      setMasterProductError("Network error: " + err.message);
    }
  };

  const handleDeleteMasterProduct = async (productId: string) => {
    if (!confirm("Are you sure you want to delete this product? All supplier stock associations will also be removed.")) {
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/products/${productId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (res.ok) {
        if (selectedProductForInventory?.id === productId) {
          setSelectedProductForInventory(null);
        }
        await fetchData();
      } else {
        const data = await res.json();
        alert("Failed to delete product: " + (data.error || "Unknown error"));
      }
    } catch (err) {
      alert("Network error deleting product: " + err);
    }
  };

  // Supplier Inventory Linking & Stock Operations
  const handleLinkSupplierToProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setLinkSupplierError("");
    if (!selectedProductForInventory) return;
    if (!linkSupplierForm.vendorId) {
      setLinkSupplierError("Please choose a supplier to link.");
      return;
    }
    if (Number(linkSupplierForm.quantityOnHand) < 0) {
      setLinkSupplierError("Quantity on hand cannot be negative.");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/inventory`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          productId: selectedProductForInventory.id,
          vendorId: linkSupplierForm.vendorId,
          quantityOnHand: Number(linkSupplierForm.quantityOnHand),
          reorderPoint: Number(linkSupplierForm.reorderPoint) || 0,
          notes: linkSupplierForm.notes || "",
        }),
      });
      if (res.ok) {
        setIsLinkSupplierOpen(false);
        setLinkSupplierForm({
          vendorId: "",
          quantityOnHand: 100,
          reorderPoint: 50,
          notes: "",
        });
        await fetchData();
      } else {
        const data = await res.json();
        setLinkSupplierError(data.error || "Failed to link supplier to product");
      }
    } catch (err: any) {
      setLinkSupplierError("Network error: " + err.message);
    }
  };

  const handleUpdateSupplierStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStockModal) return;
    try {
      const res = await fetch(`${API_BASE}/inventory`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({
          productId: editingStockModal.productId,
          vendorId: editingStockModal.vendorId,
          quantityOnHand: Number(editingStockModal.quantityOnHand),
          reorderPoint: Number(editingStockModal.reorderPoint),
          notes: editingStockModal.notes,
        }),
      });
      if (res.ok) {
        setEditingStockModal(null);
        await fetchData();
      } else {
        const data = await res.json();
        alert("Failed to update stock: " + (data.error || "Unknown error"));
      }
    } catch (err) {
      alert("Network error updating stock: " + err);
    }
  };

  const handleUnlinkSupplier = async (productId: string, vendorId: string) => {
    if (!confirm("Are you sure you want to unlink this supplier from tracking stock for this product?")) {
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/inventory?productId=${encodeURIComponent(productId)}&vendorId=${encodeURIComponent(vendorId)}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (res.ok) {
        await fetchData();
      } else {
        const data = await res.json();
        alert("Failed to unlink supplier: " + (data.error || "Unknown error"));
      }
    } catch (err) {
      alert("Network error unlinking supplier: " + err);
    }
  };

  // Dynamic list of unique SKUs across catalog items
  const availableSKUs = Array.from(
    new Set(catalogItems.map((c) => c.sku))
  );

  // Filter vendors
  const filteredVendors = vendors.filter((v) => {
    const matchesSearch =
      v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.contactPerson.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTier = selectedTier === "ALL" || v.tier === selectedTier;
    return matchesSearch && matchesTier;
  });

  // Filter products and track low stock warnings
  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      productSearchQuery === "" ||
      p.name.toLowerCase().includes(productSearchQuery.toLowerCase()) ||
      p.sku.toLowerCase().includes(productSearchQuery.toLowerCase()) ||
      p.category.toLowerCase().includes(productSearchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (selectedStockFilter === "LOW") {
      return p.isLowStock || (p.targetStockLevel > 0 && p.totalStock < p.targetStockLevel);
    }
    if (selectedStockFilter === "HEALTHY") {
      return !p.isLowStock && p.totalStock > 0;
    }
    if (selectedStockFilter === "DEPLETED") {
      return p.totalStock === 0;
    }
    return true;
  });

  const lowStockAlertProducts = products.filter(
    (p) => p.isLowStock || (p.targetStockLevel > 0 && p.totalStock <= p.targetStockLevel)
  );

  const getReliabilityBadge = (score: number) => {
    const isProbation = score < (settings.probationThreshold || 75.0);
    if (isProbation) {
      return (
        <span className="score-pill score-low" title="Under Company Probation Threshold">
          ⚠️ {score.toFixed(1)}% (Probation)
        </span>
      );
    }
    if (score >= 90) return <span className="score-pill score-high">★ {score.toFixed(1)}%</span>;
    return <span className="score-pill score-med">★ {score.toFixed(1)}%</span>;
  };

  const getTierBadge = (tier: string) => {
    switch (tier) {
      case "Strategic":
        return <span className="badge badge-strategic">✦ Strategic</span>;
      case "Preferred":
        return <span className="badge badge-preferred">★ Preferred</span>;
      default:
        return <span className="badge badge-standard">{tier}</span>;
    }
  };

  const getOrderStatusBadge = (status: string) => {
    switch (status) {
      case "DELIVERED":
        return <span className="badge badge-success">✓ Delivered</span>;
      case "SHIPPED":
        return <span className="badge badge-info">✈ Shipped</span>;
      case "CONFIRMED":
        return <span className="badge badge-preferred">● Confirmed</span>;
      case "SUBMITTED":
        return <span className="badge badge-warning">⏳ Submitted</span>;
      default:
        return <span className="badge badge-standard">{status}</span>;
    }
  };

  const getStockBadge = (p: ProductWithInventory) => {
    if (p.totalStock === 0) {
      return <span className="stock-badge-out">⚪ Out of Stock</span>;
    }
    if (p.isLowStock || (p.targetStockLevel > 0 && p.totalStock <= p.targetStockLevel)) {
      return <span className="stock-badge-low">🔴 Low Stock Alert</span>;
    }
    return <span className="stock-badge-healthy">🟢 Optimal Stock</span>;
  };

  return (
    <div className="app-layout">
      {/* Mobile Backdrop Overlay */}
      {isMobileMenuOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Left Sidebar Navigation (Enterprise B2B SaaS) */}
      <aside className={`sidebar ${isMobileMenuOpen ? "mobile-open" : ""}`}>
        {/* Brand & Organization Header */}
        <div className="sidebar-header">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div className="brand-wrapper">
              <div className="brand-logo-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                  <line x1="12" y1="22.08" x2="12" y2="12"></line>
                </svg>
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <span className="brand-title">VendorOS</span>
                  <span className="brand-badge">SaaS</span>
                </div>
              </div>
            </div>

            {/* Mobile close button inside drawer */}
            <button
              onClick={() => setIsMobileMenuOpen(false)}
              className="sidebar-close-btn"
              aria-label="Close navigation drawer"
            >
              ✕
            </button>
          </div>

          {/* Quick link back to Landing Page */}
          <div style={{ marginTop: "10px", display: "flex", justifyContent: "flex-start" }}>
            <Link
              href="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "12px",
                fontWeight: 500,
                color: "var(--text-secondary)",
                textDecoration: "none",
                padding: "4px 8px",
                borderRadius: "6px",
                backgroundColor: "var(--bg-tertiary)",
                transition: "all 0.2s ease"
              }}
            >
              ← Back to Landing
            </Link>
          </div>

          {/* Active Workspace / Organization Card */}
          <div className="workspace-card" title={settings.companyName}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
              <span style={{ fontSize: "14px" }}>🏢</span>
              <span className="workspace-name">{settings.companyName}</span>
            </div>
            <span className="workspace-badge">{settings.operatingCurrency}</span>
          </div>
        </div>

        {/* Sidebar Navigation Items */}
        <nav className="sidebar-nav">
          <div className="nav-section-title">Procurement Ops</div>

          <button
            className={`sidebar-nav-btn ${activeTab === "vendors" ? "active" : ""}`}
            onClick={() => { setActiveTab("vendors"); setIsMobileMenuOpen(false); }}
          >
            <div className="sidebar-nav-content">
              <span className="sidebar-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 21h18M3 7v14M21 7v14M9 21V11m6 10V11M3 7l9-4 9 4M9 7h6"></path>
                </svg>
              </span>
              <span>Suppliers</span>
            </div>
            <span className="nav-badge">{vendors.length}</span>
          </button>

          <button
            className={`sidebar-nav-btn ${activeTab === "products" ? "active" : ""}`}
            onClick={() => { setActiveTab("products"); setIsMobileMenuOpen(false); }}
          >
            <div className="sidebar-nav-content">
              <span className="sidebar-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                  <line x1="12" y1="22.08" x2="12" y2="12"></line>
                </svg>
              </span>
              <span>Products & Stock</span>
            </div>
            <span className="nav-badge">{products.length}</span>
          </button>

          <button
            className={`sidebar-nav-btn ${activeTab === "pricing" ? "active" : ""}`}
            onClick={() => { setActiveTab("pricing"); setIsMobileMenuOpen(false); }}
          >
            <div className="sidebar-nav-content">
              <span className="sidebar-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
                  <line x1="7" y1="7" x2="7.01" y2="7"></line>
                </svg>
              </span>
              <span>Price Matrix</span>
            </div>
            <span className="nav-badge">Quotes</span>
          </button>

          <button
            className={`sidebar-nav-btn ${activeTab === "orders" ? "active" : ""}`}
            onClick={() => { setActiveTab("orders"); setIsMobileMenuOpen(false); }}
          >
            <div className="sidebar-nav-content">
              <span className="sidebar-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
                </svg>
              </span>
              <span>Purchase Orders</span>
            </div>
            <span className="nav-badge">{orders.length}</span>
          </button>

          <button
            className={`sidebar-nav-btn ${activeTab === "analytics" ? "active" : ""}`}
            onClick={() => { setActiveTab("analytics"); setIsMobileMenuOpen(false); }}
          >
            <div className="sidebar-nav-content">
              <span className="sidebar-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="20" x2="18" y2="10"></line>
                  <line x1="12" y1="20" x2="12" y2="4"></line>
                  <line x1="6" y1="20" x2="6" y2="14"></line>
                </svg>
              </span>
              <span>Analytics & SLA</span>
            </div>
          </button>

          <div className="nav-section-title" style={{ marginTop: "16px" }}>Organization</div>

          <button
            className={`sidebar-nav-btn ${activeTab === "settings" ? "active" : ""}`}
            onClick={() => { setActiveTab("settings"); setIsMobileMenuOpen(false); }}
          >
            <div className="sidebar-nav-content">
              <span className="sidebar-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3"></circle>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
              </span>
              <span>Settings & Profile</span>
            </div>
          </button>
        </nav>

        {/* Sidebar Footer: Backend Engine Status & User Profile */}
        <div className="sidebar-footer">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "6px 10px",
              background: "var(--bg-secondary)",
              borderRadius: "var(--radius-sm)",
              fontSize: "11px",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-secondary)" }}>
              <span
                style={{
                  width: "7px",
                  height: "7px",
                  borderRadius: "50%",
                  background: serverOnline ? "var(--brand-green-accent)" : "#ef4444",
                  display: "inline-block",
                }}
              />
              Go API :8080
            </span>
            <span style={{ fontWeight: 700, color: serverOnline ? "var(--brand-green-dark)" : "#ef4444" }}>
              {serverOnline ? "Online" : "Offline"}
            </span>
          </div>

          {currentUser ? (
            <div className="user-profile-card">
              <div className="user-info-row">
                <div className="user-avatar">
                  {currentUser.email.slice(0, 2).toUpperCase()}
                </div>
                <div className="user-details">
                  <div className="user-name" title={currentUser.email}>
                    {currentUser.email.split("@")[0]}
                  </div>
                  <div className="user-role">Supply Admin</div>
                </div>
              </div>
              <button
                className="signout-btn"
                onClick={handleSignOut}
                title="Sign out of VendorOS"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                  <polyline points="16 17 21 12 16 7"></polyline>
                  <line x1="21" y1="12" x2="9" y2="12"></line>
                </svg>
              </button>
            </div>
          ) : (
            <button
              className="btn-secondary"
              onClick={() => setIsAuthModalOpen(true)}
              style={{ width: "100%", justifyContent: "center", borderColor: "var(--brand-green-border)", color: "var(--brand-green-dark)" }}
            >
              Sign In / Account
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="main-wrapper">
        {/* Sticky Topbar */}
        <header className="topbar">
          <div className="topbar-left">
            {/* Hamburger button for Mobile / Tablet */}
            <button
              className="hamburger-btn"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Open navigation menu"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>

            {/* Breadcrumb & Section Name */}
            <div className="page-title-row">
              <span style={{ fontSize: "13px", color: "var(--text-muted)", fontWeight: 600 }}>Procurement</span>
              <span style={{ color: "var(--border-medium)" }}>/</span>
              <span className="current-page-title">
                {activeTab === "vendors" && "Suppliers & Performance"}
                {activeTab === "pricing" && "Multi-Vendor Price Comparison"}
                {activeTab === "orders" && "Purchase Orders"}
                {activeTab === "analytics" && "Procurement Analytics"}
                {activeTab === "settings" && "Company Settings & Profile"}
              </span>
            </div>
          </div>

          {/* Quick Action CTAs */}
          <div className="topbar-right">
            {vendors.length > 0 && (
              <button
                className="btn-secondary"
                onClick={handleClearAllData}
                title="Wipe demo data to test a completely clean account"
                style={{ fontSize: "12px", color: "var(--text-muted)", borderColor: "var(--border-subtle)" }}
              >
                <span>🗑️ Clear Demo Data</span>
              </button>
            )}
            <button className="btn-secondary" onClick={() => setIsAddVendorOpen(true)}>
              <span>+ Add Supplier</span>
            </button>
            <button className="btn-secondary" onClick={() => setIsAddMasterProductOpen(true)}>
              <span>+ Add Product</span>
            </button>
            <button className="btn-primary" onClick={() => setIsNewOrderOpen(true)}>
              <span>+ New Order</span>
            </button>
          </div>
        </header>

        {/* Page Container */}
        <main className="page-container">
          {/* Executive KPI Summary */}
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-top">
                <span className="kpi-label">Total Spend ({settings.operatingCurrency})</span>
                <div className="kpi-icon-wrapper" style={{ background: "var(--brand-green-bg)", color: "var(--brand-green-dark)" }}>
                  $
                </div>
              </div>
              <div className="kpi-value">${analytics ? analytics.totalSpend.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "0.00"}</div>
              <div className="kpi-subtext">Across {analytics ? analytics.activeVendors : 0} active suppliers</div>
            </div>

            <div className="kpi-card">
              <div className="kpi-top">
                <span className="kpi-label">Active Suppliers</span>
                <div className="kpi-icon-wrapper" style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)" }}>
                  🏢
                </div>
              </div>
              <div className="kpi-value">{analytics ? analytics.activeVendors : 0}</div>
              <div className="kpi-subtext">100% compliant & verified</div>
            </div>

            <div className="kpi-card">
              <div className="kpi-top">
                <span className="kpi-label">Avg Reliability Score</span>
                <div className="kpi-icon-wrapper" style={{ background: "var(--brand-green-bg)", color: "var(--brand-green-dark)" }}>
                  ★
                </div>
              </div>
              <div className="kpi-value">{analytics ? analytics.averageReliability.toFixed(1) : "0.0"}%</div>
              <div className="kpi-subtext">Threshold: {settings.probationThreshold}% minimum</div>
            </div>

            <div className="kpi-card">
              <div className="kpi-top">
                <span className="kpi-label">Active Orders</span>
                <div className="kpi-icon-wrapper" style={{ background: "var(--status-warning-bg)", color: "var(--status-warning-text)" }}>
                  📦
                </div>
              </div>
              <div className="kpi-value">{analytics ? analytics.activeOrders : 0}</div>
              <div className="kpi-subtext">In-flight purchase orders</div>
            </div>
          </div>

      {/* ==================================================================== */}
      {/* TAB 1: VENDORS DIRECTORY */}
      {/* ==================================================================== */}
      {activeTab === "vendors" && (
        <div className="panel-card">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Supplier Directory & Performance</h2>
              <p className="panel-subtitle">Manage approved suppliers, contract terms, and reliability ratings.</p>
            </div>
            <div className="controls-bar">
              <input
                type="text"
                className="search-input"
                placeholder="Search by vendor name, contact, or category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <select
                className="form-select"
                value={selectedTier}
                onChange={(e) => setSelectedTier(e.target.value)}
              >
                <option value="ALL">All Tiers</option>
                <option value="Strategic">Strategic</option>
                <option value="Preferred">Preferred</option>
                <option value="Standard">Standard</option>
              </select>
              <button className="btn-primary" onClick={() => setIsAddVendorOpen(true)}>
                <span>+ Add Supplier</span>
              </button>
            </div>
          </div>

          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Supplier Name</th>
                  <th>Contact Details</th>
                  <th>Category</th>
                  <th>Tier</th>
                  <th>Terms</th>
                  <th>On-Time Rate</th>
                  <th>Quality</th>
                  <th>Reliability</th>
                  <th>Total Spend</th>
                </tr>
              </thead>
              <tbody>
                {filteredVendors.map((v) => (
                  <tr key={v.id}>
                    <td className="primary-cell">
                      <div style={{ fontWeight: 700 }}>{v.name}</div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>ID: {v.id}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{v.contactPerson}</div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{v.email}</div>
                    </td>
                    <td>{v.category}</td>
                    <td>{getTierBadge(v.tier)}</td>
                    <td><span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", fontWeight: 600 }}>{v.paymentTerms}</span></td>
                    <td>
                      <span style={{ color: v.onTimeDeliveryRate >= 90 ? "var(--brand-green-dark)" : "#d97706", fontWeight: 700 }}>
                        {v.onTimeDeliveryRate.toFixed(1)}%
                      </span>
                    </td>
                    <td>
                      <span style={{ color: "#d97706" }}>★</span> {v.qualityScore.toFixed(1)} / 5.0
                    </td>
                    <td>{getReliabilityBadge(v.reliabilityScore)}</td>
                    <td style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                      ${v.totalSpend.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
                {filteredVendors.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: "center", padding: "48px 20px", color: "var(--text-muted)" }}>
                      <div style={{ fontSize: "36px", marginBottom: "8px" }}>🏢</div>
                      <div style={{ fontWeight: 800, fontSize: "16px", color: "var(--text-primary)" }}>No suppliers registered yet</div>
                      <p style={{ fontSize: "13px", marginTop: "4px", marginBottom: "16px" }}>
                        Click <strong>"+ Add Supplier"</strong> in the topbar to register your first vendor and start building your supplier catalog.
                      </p>
                      <button className="btn-primary" onClick={() => setIsAddVendorOpen(true)}>
                        + Add First Supplier
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB: PRODUCTS & MULTI-SUPPLIER INVENTORY */}
      {/* ==================================================================== */}
      {activeTab === "products" && (
        <div>
          {/* Low Stock Warning Banner */}
          {lowStockAlertProducts.length > 0 && (
            <div className="low-stock-banner">
              <div className="low-stock-banner-left">
                <div className="low-stock-icon-bubble">⚠️</div>
                <div>
                  <div className="low-stock-banner-title">
                    Stock Replenishment Needed ({lowStockAlertProducts.length} {lowStockAlertProducts.length === 1 ? "product" : "products"} below threshold)
                  </div>
                  <div className="low-stock-banner-desc">
                    {lowStockAlertProducts.slice(0, 3).map((p) => `${p.name} (${p.totalStock} / ${p.targetStockLevel || "target"})`).join(", ")}
                    {lowStockAlertProducts.length > 3 ? ` and ${lowStockAlertProducts.length - 3} more...` : ""}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <button
                  className="btn-secondary"
                  onClick={() => setSelectedStockFilter("LOW")}
                  style={{ fontSize: "12px", background: "white", borderColor: "#fde68a", color: "#92400e" }}
                >
                  View Low Stock
                </button>
                <button
                  className="btn-primary"
                  onClick={() => {
                    const firstLow = lowStockAlertProducts[0];
                    if (firstLow) {
                      setNewOrderItemName(firstLow.name);
                      setNewOrderSKU(firstLow.sku);
                      if (firstLow.inventory.length > 0) {
                        setNewOrderVendorId(firstLow.inventory[0].vendorId);
                      }
                      setNewOrderQty(firstLow.targetStockLevel > firstLow.totalStock ? firstLow.targetStockLevel - firstLow.totalStock : 50);
                    }
                    setIsNewOrderOpen(true);
                  }}
                  style={{ fontSize: "12px" }}
                >
                  + Create Restock PO
                </button>
              </div>
            </div>
          )}

          {/* Master Products Directory Panel */}
          <div className="panel-card">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Master Product Registry & Inventory</h2>
                <p className="panel-subtitle">Create canonical parts, connect multiple suppliers, and track warehouse stock levels.</p>
              </div>
              <div className="controls-bar">
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search products by SKU, name, or category..."
                  value={productSearchQuery}
                  onChange={(e) => setProductSearchQuery(e.target.value)}
                />
                <select
                  className="form-select"
                  value={selectedStockFilter}
                  onChange={(e) => setSelectedStockFilter(e.target.value as any)}
                >
                  <option value="ALL">All Stock Levels</option>
                  <option value="LOW">⚠️ Low Stock Alerts</option>
                  <option value="HEALTHY">🟢 Optimal Stock</option>
                  <option value="DEPLETED">⚪ Out of Stock</option>
                </select>
                <button className="btn-primary" onClick={() => { setMasterProductError(""); setIsAddMasterProductOpen(true); }}>
                  <span>+ Create Product</span>
                </button>
              </div>
            </div>

            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product & Master SKU</th>
                    <th>Category</th>
                    <th>Linked Suppliers</th>
                    <th>Total Stock on Hand</th>
                    <th>Target Level</th>
                    <th>Stock Health</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((p) => {
                    const isSelected = selectedProductForInventory?.id === p.id;
                    const stockRatio = p.targetStockLevel > 0 ? Math.min(100, Math.round((p.totalStock / p.targetStockLevel) * 100)) : 100;
                    return (
                      <React.Fragment key={p.id}>
                        <tr style={{ background: isSelected ? "var(--bg-tertiary)" : undefined }}>
                          <td className="primary-cell">
                            <div style={{ fontWeight: 700, fontSize: "14px" }}>{p.name}</div>
                            <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "2px" }}>
                              <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--brand-green-dark)", background: "var(--brand-green-bg)", padding: "2px 6px", borderRadius: "4px", fontWeight: 700 }}>
                                {p.sku}
                              </span>
                              {p.description && (
                                <span style={{ fontSize: "11px", color: "var(--text-muted)", maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {p.description}
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            <span className="badge badge-standard">{p.category}</span>
                          </td>
                          <td>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", alignItems: "center" }}>
                              {p.inventory.length === 0 ? (
                                <span style={{ fontSize: "11px", color: "var(--text-muted)", fontStyle: "italic" }}>
                                  No suppliers linked
                                </span>
                              ) : (
                                p.inventory.map((inv) => (
                                  <span
                                    key={inv.vendorId}
                                    style={{
                                      fontSize: "11px",
                                      padding: "2px 8px",
                                      borderRadius: "4px",
                                      background: inv.isLowStock ? "#fef2f2" : "var(--bg-tertiary)",
                                      border: inv.isLowStock ? "1px solid #fecaca" : "1px solid var(--border-subtle)",
                                      color: inv.isLowStock ? "#b91c1c" : "var(--text-secondary)",
                                      fontWeight: 600,
                                    }}
                                  >
                                    {inv.vendorName}: <strong style={{ fontFamily: "var(--font-mono)" }}>{inv.quantityOnHand}</strong>
                                  </span>
                                ))
                              )}
                            </div>
                          </td>
                          <td>
                            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "14px", color: p.totalStock === 0 ? "var(--text-muted)" : "var(--text-primary)" }}>
                              {p.totalStock.toLocaleString()} {p.unitOfMeasure}
                            </div>
                            {p.targetStockLevel > 0 && (
                              <div className="inventory-progress-track">
                                <div
                                  className="inventory-progress-fill"
                                  style={{
                                    width: `${stockRatio}%`,
                                    background: p.isLowStock || p.totalStock <= p.targetStockLevel ? "#ef4444" : "var(--brand-green-accent)",
                                  }}
                                />
                              </div>
                            )}
                          </td>
                          <td>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--text-secondary)" }}>
                              {p.targetStockLevel > 0 ? `${p.targetStockLevel.toLocaleString()} ${p.unitOfMeasure}` : "—"}
                            </span>
                          </td>
                          <td>
                            {getStockBadge(p)}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <div style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}>
                              <button
                                className="btn-secondary"
                                onClick={() => setSelectedProductForInventory(isSelected ? null : p)}
                                style={{
                                  fontSize: "11px",
                                  padding: "5px 10px",
                                  background: isSelected ? "var(--brand-green-dark)" : undefined,
                                  color: isSelected ? "white" : undefined,
                                }}
                              >
                                {isSelected ? "Hide Suppliers ▲" : `Manage Stock (${p.inventory.length}) ▼`}
                              </button>
                              <button
                                className="btn-secondary"
                                onClick={() => {
                                  setSelectedProductForInventory(p);
                                  setLinkSupplierError("");
                                  setLinkSupplierForm({ vendorId: "", quantityOnHand: 100, reorderPoint: 50, notes: "" });
                                  setIsLinkSupplierOpen(true);
                                }}
                                title="Link another supplier to this product"
                                style={{ fontSize: "11px", padding: "5px 8px" }}
                              >
                                + Link Supplier
                              </button>
                              <button
                                className="btn-secondary"
                                onClick={() => handleDeleteMasterProduct(p.id)}
                                title="Delete product and unbind all inventory"
                                style={{ fontSize: "11px", padding: "5px 8px", color: "#b91c1c", borderColor: "#fecaca" }}
                              >
                                ✕
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Expandable Supplier Stock Sub-Panel */}
                        {isSelected && (
                          <tr>
                            <td colSpan={7} style={{ background: "var(--bg-secondary)", padding: "18px 24px", borderBottom: "2px solid var(--border-medium)" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                                <div>
                                  <h4 style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)" }}>
                                    Supplier Stock Levels for: <span style={{ color: "var(--brand-green-dark)" }}>{p.name}</span> ({p.sku})
                                  </h4>
                                  <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                                    Each approved supplier can hold allocated inventory on consignment or under contract SLA.
                                  </p>
                                </div>
                                <button
                                  className="btn-primary"
                                  onClick={() => {
                                    setSelectedProductForInventory(p);
                                    setLinkSupplierError("");
                                    setLinkSupplierForm({ vendorId: "", quantityOnHand: 100, reorderPoint: 50, notes: "" });
                                    setIsLinkSupplierOpen(true);
                                  }}
                                  style={{ fontSize: "12px", padding: "6px 12px" }}
                                >
                                  + Link Another Supplier
                                </button>
                              </div>

                              {p.inventory.length === 0 ? (
                                <div style={{ background: "var(--bg-card)", border: "1px dashed var(--border-medium)", borderRadius: "var(--radius-md)", padding: "32px", textAlign: "center" }}>
                                  <div style={{ fontSize: "28px", marginBottom: "6px" }}>📦</div>
                                  <div style={{ fontWeight: 700, fontSize: "14px" }}>No suppliers currently tracking stock for this item</div>
                                  <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px", marginBottom: "12px" }}>
                                    Connect suppliers to monitor individual supplier quantities and set reorder alert thresholds.
                                  </p>
                                  <button
                                    className="btn-primary"
                                    onClick={() => {
                                      setSelectedProductForInventory(p);
                                      setLinkSupplierError("");
                                      setLinkSupplierForm({ vendorId: "", quantityOnHand: 100, reorderPoint: 50, notes: "" });
                                      setIsLinkSupplierOpen(true);
                                    }}
                                    style={{ fontSize: "12px" }}
                                  >
                                    + Link Supplier Now
                                  </button>
                                </div>
                              ) : (
                                <div className="inventory-supplier-grid">
                                  {p.inventory.map((inv) => {
                                    const maxScale = Math.max(inv.quantityOnHand, inv.reorderPoint * 2, 100);
                                    const pct = Math.min(100, Math.round((inv.quantityOnHand / maxScale) * 100));
                                    return (
                                      <div key={inv.vendorId} className="inventory-supplier-card">
                                        <div>
                                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                                            <div>
                                              <div style={{ fontWeight: 700, fontSize: "14px", color: "var(--text-primary)" }}>{inv.vendorName}</div>
                                              <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>ID: {inv.vendorId}</div>
                                            </div>
                                            {inv.isLowStock ? (
                                              <span className="stock-badge-low">🔴 Low Stock</span>
                                            ) : (
                                              <span className="stock-badge-healthy">🟢 In Stock</span>
                                            )}
                                          </div>

                                          <div style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "12px" }}>
                                            {getTierBadge(inv.vendorTier)}
                                            <span className={`status-pill status-${inv.vendorStatus.toLowerCase()}`} style={{ fontSize: "10px", padding: "2px 6px" }}>
                                              {inv.vendorStatus}
                                            </span>
                                          </div>

                                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: "10px" }}>
                                            <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>On-Hand Stock:</span>
                                            <span className="stock-qty-number" style={{ color: inv.isLowStock ? "#b91c1c" : "var(--brand-green-dark)" }}>
                                              {inv.quantityOnHand.toLocaleString()} {p.unitOfMeasure}
                                            </span>
                                          </div>

                                          <div className="inventory-progress-track">
                                            <div
                                              className="inventory-progress-fill"
                                              style={{
                                                width: `${pct}%`,
                                                background: inv.isLowStock ? "#ef4444" : "var(--brand-green-accent)",
                                              }}
                                            />
                                          </div>

                                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text-muted)" }}>
                                            <span>Reorder Alert: <strong>{inv.reorderPoint} {p.unitOfMeasure}</strong></span>
                                            <span>Updated: {inv.lastUpdated ? new Date(inv.lastUpdated).toLocaleDateString() : "Just now"}</span>
                                          </div>

                                          {inv.notes && (
                                            <div style={{ fontSize: "11px", color: "var(--text-muted)", background: "var(--bg-tertiary)", padding: "6px 8px", borderRadius: "4px", marginTop: "8px" }}>
                                              📝 {inv.notes}
                                            </div>
                                          )}
                                        </div>

                                        <div style={{ display: "flex", gap: "6px", marginTop: "14px", borderTop: "1px solid var(--border-subtle)", paddingTop: "10px" }}>
                                          <button
                                            className="btn-secondary"
                                            onClick={() => setEditingStockModal({
                                              productId: p.id,
                                              productName: p.name,
                                              vendorId: inv.vendorId,
                                              vendorName: inv.vendorName,
                                              quantityOnHand: inv.quantityOnHand,
                                              reorderPoint: inv.reorderPoint,
                                              notes: inv.notes,
                                            })}
                                            style={{ flex: 1, fontSize: "11px", padding: "5px" }}
                                          >
                                            ✏️ Update Stock
                                          </button>
                                          <button
                                            className="btn-primary"
                                            onClick={() => {
                                              setNewOrderVendorId(inv.vendorId);
                                              setNewOrderItemName(p.name);
                                              setNewOrderSKU(p.sku);
                                              setNewOrderQty(inv.reorderPoint > 0 ? inv.reorderPoint : 50);
                                              setIsNewOrderOpen(true);
                                            }}
                                            style={{ flex: 1, fontSize: "11px", padding: "5px" }}
                                          >
                                            📦 Order PO
                                          </button>
                                          <button
                                            className="btn-secondary"
                                            onClick={() => handleUnlinkSupplier(p.id, inv.vendorId)}
                                            title="Unlink supplier from tracking"
                                            style={{ fontSize: "11px", padding: "5px 8px", color: "#b91c1c", borderColor: "#fecaca" }}
                                          >
                                            ✕
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}

                  {filteredProducts.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", padding: "48px 20px", color: "var(--text-muted)" }}>
                        <div style={{ fontSize: "36px", marginBottom: "8px" }}>📦</div>
                        <div style={{ fontWeight: 800, fontSize: "16px", color: "var(--text-primary)" }}>No products created yet</div>
                        <p style={{ fontSize: "13px", marginTop: "4px", marginBottom: "16px" }}>
                          Create your canonical product registry to connect suppliers and track stock inventory levels.
                        </p>
                        <button className="btn-primary" onClick={() => { setMasterProductError(""); setIsAddMasterProductOpen(true); }}>
                          + Create First Product
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 2: PRICE COMPARISON MATRIX */}
      {/* ==================================================================== */}
      {/* ==================================================================== */}
      {/* TAB 2: PRICE COMPARISON & PRODUCT CATALOG */}
      {/* ==================================================================== */}
      {activeTab === "pricing" && (
        <div className="panel-card">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Multi-Supplier Price & Lead Time Matrix</h2>
              <p className="panel-subtitle">Compare competitive quotes for identical parts across your approved vendors.</p>
            </div>
            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
                {availableSKUs.map((sku) => (
                  <button
                    key={sku}
                    className={`btn-secondary ${selectedSKU === sku ? "active" : ""}`}
                    onClick={() => setSelectedSKU(sku)}
                    style={{
                      background: selectedSKU === sku ? "var(--brand-green-bg)" : "transparent",
                      borderColor: selectedSKU === sku ? "var(--brand-green-border)" : "var(--border-subtle)",
                      color: selectedSKU === sku ? "var(--brand-green-dark)" : "var(--text-secondary)",
                      fontWeight: selectedSKU === sku ? 700 : 500,
                    }}
                  >
                    {sku}
                  </button>
                ))}
              </div>

              <div style={{ display: "flex", gap: "8px", marginLeft: "auto" }}>
                {comparison && (
                  <button
                    className="btn-secondary"
                    onClick={() => handleOpenProductTracking(comparison.sku)}
                    title="Track all past and active purchase orders for this SKU"
                  >
                    📊 Order Tracking for {comparison.sku}
                  </button>
                )}
                <button
                  className="btn-primary"
                  onClick={() => {
                    setNewProduct({
                      ...newProduct,
                      sku: selectedSKU || "",
                    });
                    setProductModalError("");
                    setIsAddProductOpen(true);
                  }}
                >
                  <span>+ Add Product / Quote</span>
                </button>
              </div>
            </div>
          </div>

          {availableSKUs.length === 0 ? (
            <div style={{ textAlign: "center", padding: "64px 20px", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
              <div style={{ fontSize: "36px", marginBottom: "8px" }}>🏷️</div>
              <p style={{ fontWeight: 800, fontSize: "16px", color: "var(--text-primary)" }}>No products or quotes in catalog yet</p>
              <p style={{ color: "var(--text-muted)", fontSize: "13px", marginTop: "4px", maxWidth: "420px", margin: "6px auto 18px" }}>
                Add parts, components, and supplier quotes to compare market prices and track product procurement.
              </p>
              <button
                className="btn-primary"
                onClick={() => {
                  setNewProduct({
                    vendorId: vendors[0]?.id || "",
                    sku: "",
                    itemName: "",
                    category: "Precision Hardware & CNC",
                    unitPrice: 35.0,
                    minOrderQty: 10,
                    leadTimeDays: 7,
                    inStock: true,
                  });
                  setProductModalError("");
                  setIsAddProductOpen(true);
                }}
                disabled={vendors.length === 0}
              >
                {vendors.length === 0 ? "Add a Supplier First" : "+ Add First Product / Quote"}
              </button>
            </div>
          ) : comparison ? (
            <div>
              <div style={{ background: "var(--bg-secondary)", padding: "18px 24px", borderRadius: "var(--radius-md)", marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid var(--border-subtle)", flexWrap: "wrap", gap: "16px" }}>
                <div>
                  <div style={{ fontSize: "17px", fontWeight: 800, color: "var(--text-primary)" }}>{comparison.itemName}</div>
                  <div style={{ fontSize: "12px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>SKU: {comparison.sku}</div>
                </div>
                <div style={{ display: "flex", gap: "28px", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>Lowest Quote</div>
                    <div style={{ fontSize: "22px", fontWeight: 800, color: "var(--brand-green-dark)" }}>${comparison.lowestPrice.toFixed(2)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>Fastest Lead Time</div>
                    <div style={{ fontSize: "22px", fontWeight: 800, color: "var(--text-primary)" }}>{comparison.fastestLeadTime} Days</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>Cheapest Supplier</div>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--brand-green-dark)", marginTop: "4px" }}>{comparison.cheapestVendor}</div>
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px" }}>
                {(comparison.quotes || []).map((q) => {
                  const isCheapest = q.unitPrice === comparison.lowestPrice;
                  const isFastest = q.leadTimeDays === comparison.fastestLeadTime;
                  return (
                    <div key={q.id} className={`quote-card ${isCheapest ? "cheapest" : ""}`}>
                      {isCheapest && <span className="quote-highlight-ribbon">Lowest Unit Price</span>}
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: "16px", color: "var(--text-primary)" }}>{q.vendorName}</div>
                          <div style={{ fontSize: "12px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
                            <span>Vendor ID: {q.vendorId}</span>
                            <span>•</span>
                            <span style={{ color: q.inStock ? "var(--brand-green-dark)" : "#d97706", fontWeight: 700 }}>
                              {q.inStock ? "✓ In Stock" : "⚠️ Backorder"}
                            </span>
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: "24px", fontWeight: 800, color: isCheapest ? "var(--brand-green-dark)" : "var(--text-primary)" }}>
                            ${q.unitPrice.toFixed(2)}
                          </div>
                          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>per unit / {q.currency}</div>
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", padding: "12px 0", borderTop: "1px solid var(--border-subtle)", borderBottom: "1px solid var(--border-subtle)", marginBottom: "16px" }}>
                        <div>
                          <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600 }}>Min Order Qty (MOQ):</span>
                          <div style={{ fontWeight: 700, fontSize: "13px" }}>
                            <span className="moq-pill">{q.minOrderQty} units</span>
                          </div>
                        </div>
                        <div>
                          <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600 }}>Lead Time:</span>
                          <div style={{ fontWeight: 700, fontSize: "13px", color: isFastest ? "var(--brand-green-accent)" : "inherit" }}>
                            {q.leadTimeDays} business days {isFastest ? "(Fastest)" : ""}
                          </div>
                        </div>
                      </div>

                      <div className="quote-actions-row">
                        <button
                          className="btn-primary"
                          style={{ flex: 1, justifyContent: "center" }}
                          onClick={() => handleOrderFromQuote(q)}
                        >
                          Order Product
                        </button>
                        <button
                          className="btn-secondary"
                          onClick={() => handleOpenProductTracking(q.sku)}
                          title="View purchase order history for this product"
                        >
                          Order History
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "40px 20px", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)" }}>
              <p style={{ fontWeight: 700, fontSize: "15px" }}>No product quotes found for SKU: {selectedSKU}</p>
              <p style={{ color: "var(--text-muted)", fontSize: "13px", marginTop: "4px" }}>
                Add the first supplier quote for this SKU using the button below.
              </p>
              <button
                className="btn-primary"
                style={{ marginTop: "16px" }}
                onClick={() => {
                  setNewProduct({ ...newProduct, sku: selectedSKU });
                  setIsAddProductOpen(true);
                }}
              >
                + Add Product Quote for {selectedSKU}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 3: PURCHASE ORDERS */}
      {/* ==================================================================== */}
      {activeTab === "orders" && (
        <div className="panel-card">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Purchase Order Lifecycles & Deliveries</h2>
              <p className="panel-subtitle">
                Advance orders through procurement stages. When delivered, scoring recalculates automatically on the Go backend!
              </p>
            </div>
            <button className="btn-primary" onClick={() => setIsNewOrderOpen(true)}>
              <span>+ New Purchase Order</span>
            </button>
          </div>

          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>PO Number</th>
                  <th>Supplier</th>
                  <th>Order Items</th>
                  <th>Expected Date</th>
                  <th>Total Amount</th>
                  <th>Lifecycle Status</th>
                  <th>Workflow Action</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((po) => (
                  <tr key={po.id}>
                    <td className="primary-cell">
                      <div style={{ fontFamily: "var(--font-mono)", fontWeight: 800 }}>{po.poNumber}</div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                        {new Date(po.orderDate).toLocaleDateString()}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 700 }}>{po.vendorName}</div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{po.vendorId}</div>
                    </td>
                    <td>
                      {(po.items || []).map((item, idx) => (
                        <div key={idx} style={{ fontSize: "12px", color: "var(--text-primary)" }}>
                          <strong>{item.quantity}x</strong> {item.name}
                        </div>
                      ))}
                    </td>
                    <td>{new Date(po.expectedDate).toLocaleDateString()}</td>
                    <td style={{ fontWeight: 800, color: "var(--text-primary)" }}>
                      ${po.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td>{getOrderStatusBadge(po.status)}</td>
                    <td>
                      {po.status === "DRAFT" && (
                        <button
                          className="btn-secondary"
                          style={{ fontSize: "12px", padding: "6px 12px" }}
                          onClick={() => handleUpdateOrderStatus(po.id, "SUBMITTED")}
                        >
                          Submit Order ➔
                        </button>
                      )}
                      {po.status === "SUBMITTED" && (
                        <button
                          className="btn-secondary"
                          style={{ fontSize: "12px", padding: "6px 12px" }}
                          onClick={() => handleUpdateOrderStatus(po.id, "CONFIRMED")}
                        >
                          Confirm Order ➔
                        </button>
                      )}
                      {po.status === "CONFIRMED" && (
                        <button
                          className="btn-secondary"
                          style={{ fontSize: "12px", padding: "6px 12px" }}
                          onClick={() => handleUpdateOrderStatus(po.id, "SHIPPED")}
                        >
                          Mark Shipped ➔
                        </button>
                      )}
                      {po.status === "SHIPPED" && (
                        <button
                          className="btn-green"
                          style={{ fontSize: "12px", padding: "6px 14px" }}
                          onClick={() => {
                            setDeliveryModalOrder(po);
                            setDeliveryWasOnTime(true);
                            setDeliveryQualityRating(5);
                          }}
                        >
                          Receive & Score ➔
                        </button>
                      )}
                      {po.status === "DELIVERED" && (
                        <div style={{ fontSize: "11px", color: "var(--brand-green-dark)", fontWeight: 700 }}>
                          ✓ Evaluated: {po.qualityRating || 5}★ ({po.wasOnTime ? "On-Time" : "Delayed"})
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "48px 20px", color: "var(--text-muted)" }}>
                      <div style={{ fontSize: "36px", marginBottom: "8px" }}>📦</div>
                      <div style={{ fontWeight: 800, fontSize: "16px", color: "var(--text-primary)" }}>No purchase orders created yet</div>
                      <p style={{ fontSize: "13px", marginTop: "4px", marginBottom: "16px" }}>
                        Create purchase orders to track line items, delivery timelines, and vendor fulfillment SLAs.
                      </p>
                      <button className="btn-primary" onClick={() => setIsNewOrderOpen(true)} disabled={vendors.length === 0}>
                        {vendors.length === 0 ? "Add a Supplier First" : "+ Create First Purchase Order"}
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 4: ANALYTICS & SCORECARDS */}
      {/* ==================================================================== */}
      {activeTab === "analytics" && (
        <div>
          <div className="panel-card">
            <h2 className="panel-title" style={{ marginBottom: "16px" }}>Supplier Performance Scorecards</h2>
            <p className="panel-subtitle" style={{ marginBottom: "24px" }}>
              Scores are calculated dynamically by the Go server algorithm: (40% On-Time Delivery + 40% Quality Rating + 20% Base Activity).
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" }}>
              {vendors.map((v) => (
                <div key={v.id} style={{ background: "#ffffff", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "22px", boxShadow: "var(--shadow-sm)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: "16px", color: "var(--text-primary)" }}>{v.name}</div>
                      <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{v.category}</div>
                    </div>
                    {getReliabilityBadge(v.reliabilityScore)}
                  </div>

                  <div style={{ margin: "18px 0", display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "5px" }}>
                        <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>On-Time Delivery Rate:</span>
                        <strong style={{ color: "var(--brand-green-dark)", fontWeight: 800 }}>{v.onTimeDeliveryRate.toFixed(1)}%</strong>
                      </div>
                      <div style={{ width: "100%", height: "6px", background: "#f1f5f9", borderRadius: "3px", overflow: "hidden" }}>
                        <div style={{ width: `${v.onTimeDeliveryRate}%`, height: "100%", background: "var(--brand-green-dark)", borderRadius: "3px" }}></div>
                      </div>
                    </div>

                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "5px" }}>
                        <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>Quality Rating:</span>
                        <strong style={{ color: "#d97706", fontWeight: 800 }}>{v.qualityScore.toFixed(1)} / 5.0</strong>
                      </div>
                      <div style={{ width: "100%", height: "6px", background: "#f1f5f9", borderRadius: "3px", overflow: "hidden" }}>
                        <div style={{ width: `${(v.qualityScore / 5) * 100}%`, height: "100%", background: "#d97706", borderRadius: "3px" }}></div>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text-muted)", paddingTop: "14px", borderTop: "1px solid var(--border-subtle)" }}>
                    <span>Total Orders: <strong style={{ color: "var(--text-primary)" }}>{v.totalOrders}</strong></span>
                    <span>Total Spend: <strong style={{ color: "var(--text-primary)" }}>${v.totalSpend.toLocaleString()}</strong></span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 5: COMPANY SETTINGS & PROFILE */}
      {/* ==================================================================== */}
      {activeTab === "settings" && (
        <form onSubmit={handleSaveSettings}>
          <div className="panel-card">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Company Profile & Procurement Governance</h2>
                <p className="panel-subtitle">
                  Configure legal business entity details, receiving dock facilities, and automated supplier safeguard rules.
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                {settingsSavedToast && (
                  <span className="badge badge-success" style={{ padding: "6px 12px" }}>
                    ✓ Settings saved successfully!
                  </span>
                )}
                <button type="submit" className="btn-primary" disabled={savingSettings}>
                  <span>{savingSettings ? "Saving..." : "Save Changes"}</span>
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "28px" }}>
              {/* Section 1: Business Entity */}
              <div style={{ background: "var(--bg-secondary)", padding: "24px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
                <h3 style={{ fontSize: "15px", fontWeight: 800, marginBottom: "16px", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span>🏢 Business Entity & Accounts Payable</span>
                </h3>

                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div className="form-group">
                    <label className="form-label">Company Legal Name</label>
                    <input
                      type="text"
                      required
                      className="form-input"
                      value={settings.companyName}
                      onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div className="form-group">
                      <label className="form-label">Tax ID / VAT Number</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="US-EIN-..."
                        value={settings.taxId}
                        onChange={(e) => setSettings({ ...settings, taxId: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Operating Currency</label>
                      <select
                        className="form-select"
                        value={settings.operatingCurrency}
                        onChange={(e) => setSettings({ ...settings, operatingCurrency: e.target.value })}
                      >
                        <option value="USD">USD ($) — US Dollar</option>
                        <option value="EUR">EUR (€) — Euro</option>
                        <option value="GBP">GBP (£) — British Pound</option>
                        <option value="CAD">CAD ($) — Canadian Dollar</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div className="form-group">
                      <label className="form-label">Accounts Payable Email</label>
                      <input
                        type="email"
                        className="form-input"
                        value={settings.contactEmail}
                        onChange={(e) => setSettings({ ...settings, contactEmail: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Contact Phone</label>
                      <input
                        type="text"
                        className="form-input"
                        value={settings.contactPhone}
                        onChange={(e) => setSettings({ ...settings, contactPhone: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 2: Procurement Governance */}
              <div style={{ background: "var(--bg-secondary)", padding: "24px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
                <h3 style={{ fontSize: "15px", fontWeight: 800, marginBottom: "16px", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span>⚖️ Procurement Governance & Safeguards</span>
                </h3>

                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div className="form-group">
                      <label className="form-label">Default PO Tax Rate (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="30"
                        className="form-input"
                        value={(settings.defaultTaxRate * 100).toFixed(1)}
                        onChange={(e) => setSettings({ ...settings, defaultTaxRate: Number(e.target.value) / 100 })}
                      />
                      <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Applied to new purchase orders</span>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Auto-Probation Min Score (%)</label>
                      <input
                        type="number"
                        step="1"
                        min="50"
                        max="95"
                        className="form-input"
                        value={settings.probationThreshold}
                        onChange={(e) => setSettings({ ...settings, probationThreshold: Number(e.target.value) })}
                      />
                      <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Suppliers below this get flagged</span>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">High-Value PO Sign-Off Threshold ($)</label>
                    <input
                      type="number"
                      step="500"
                      min="1000"
                      className="form-input"
                      value={settings.highValueApprovalMin}
                      onChange={(e) => setSettings({ ...settings, highValueApprovalMin: Number(e.target.value) })}
                    />
                    <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Orders exceeding this require Director approval</span>
                  </div>
                </div>
              </div>

              {/* Section 3: Facilities Address */}
              <div style={{ background: "var(--bg-secondary)", padding: "24px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
                <h3 style={{ fontSize: "15px", fontWeight: 800, marginBottom: "16px", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span>📍 Receiving Dock & Shipping Address</span>
                </h3>

                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div className="form-group">
                    <label className="form-label">Receiving Facility Address (For Suppliers)</label>
                    <textarea
                      rows={2}
                      className="form-textarea"
                      value={settings.shippingAddress}
                      onChange={(e) => setSettings({ ...settings, shippingAddress: e.target.value })}
                    />
                    <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Appears on purchase order delivery instructions</span>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Corporate Billing Address</label>
                    <textarea
                      rows={2}
                      className="form-textarea"
                      value={settings.billingAddress}
                      onChange={(e) => setSettings({ ...settings, billingAddress: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Section 4: Cloud Database & Session Info */}
              <div style={{ background: "var(--bg-secondary)", padding: "24px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
                <h3 style={{ fontSize: "15px", fontWeight: 800, marginBottom: "16px", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span>☁️ Cloud Database & User Session</span>
                </h3>

                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div>
                    <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: 700 }}>DATABASE CONNECTION</span>
                    <div style={{ marginTop: "6px" }}>
                      {isSupabaseConfigured ? (
                        <span className="badge badge-success">
                          ✓ Live Supabase PostgreSQL Connected
                        </span>
                      ) : (
                        <span className="badge badge-warning">
                          ⚡ Local Dev Mode (In-Memory + Mock Auth)
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "6px" }}>
                      To connect your live database, add `NEXT_PUBLIC_SUPABASE_URL` to frontend and `DATABASE_URL` to backend.
                    </p>
                  </div>

                  <div style={{ paddingTop: "12px", borderTop: "1px solid var(--border-subtle)" }}>
                    <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: 700 }}>CURRENT USER</span>
                    <div style={{ marginTop: "4px", fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>
                      {currentUser ? currentUser.email : "Not signed in (Guest)"}
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--brand-green-dark)", fontWeight: 600 }}>
                      Role: Procurement Lead
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 5: Data Management (Clean Slate vs Demo Data) */}
              <div style={{ background: "var(--bg-secondary)", padding: "24px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", gridColumn: "1 / -1" }}>
                <h3 style={{ fontSize: "15px", fontWeight: 800, marginBottom: "8px", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span>🧹 Data & Environment Management</span>
                </h3>
                <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "16px" }}>
                  Switch between an empty clean slate (0 suppliers, $0 spend) to test creating your real account and adding data from scratch, or reload sample demo data.
                </p>
                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ borderColor: "var(--status-danger-border)", color: "var(--status-danger-text)", background: "var(--status-danger-bg)", fontWeight: 700 }}
                    onClick={handleClearAllData}
                  >
                    🗑️ Clear All Data (Start with 0 Data)
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ borderColor: "var(--brand-green-border)", color: "var(--brand-green-dark)", background: "var(--brand-green-bg)", fontWeight: 700 }}
                    onClick={handleLoadDemoData}
                  >
                    ⚡ Load Sample Demo Data
                  </button>
                  <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    Currently loaded: {vendors.length} suppliers • {orders.length} orders • {catalogItems.length} quotes
                  </span>
                </div>
              </div>
            </div>
          </div>
        </form>
      )}
        </main>
      </div>

      {/* ==================================================================== */}
      {/* MODAL: AUTHENTICATION */}
      {/* ==================================================================== */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={handleAuthSuccess}
      />

      {/* ==================================================================== */}
      {/* MODAL: ADD SUPPLIER */}
      {/* ==================================================================== */}
      {isAddVendorOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{ fontSize: "18px", fontWeight: 800 }}>Add New Supplier</h3>
              <button
                style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "20px" }}
                onClick={() => setIsAddVendorOpen(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateVendor}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Company / Supplier Name *</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="e.g. Apex Industrial Solutions"
                    value={newVendor.name}
                    onChange={(e) => setNewVendor({ ...newVendor, name: e.target.value })}
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div className="form-group">
                    <label className="form-label">Contact Person</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Rachel Adams"
                      value={newVendor.contactPerson}
                      onChange={(e) => setNewVendor({ ...newVendor, contactPerson: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <input
                      type="email"
                      className="form-input"
                      placeholder="orders@vendor.com"
                      value={newVendor.email}
                      onChange={(e) => setNewVendor({ ...newVendor, email: e.target.value })}
                    />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div className="form-group">
                    <label className="form-label">Category</label>
                    <input
                      type="text"
                      className="form-input"
                      value={newVendor.category}
                      onChange={(e) => setNewVendor({ ...newVendor, category: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Strategic Tier</label>
                    <select
                      className="form-select"
                      value={newVendor.tier}
                      onChange={(e) => setNewVendor({ ...newVendor, tier: e.target.value as any })}
                    >
                      <option value="Strategic">Strategic</option>
                      <option value="Preferred">Preferred</option>
                      <option value="Standard">Standard</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Payment Terms</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Net 30, Net 60, Due on Receipt"
                    value={newVendor.paymentTerms}
                    onChange={(e) => setNewVendor({ ...newVendor, paymentTerms: e.target.value })}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setIsAddVendorOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: RECEIVE & SCORE DELIVERY */}
      {/* ==================================================================== */}
      {deliveryModalOrder && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{ fontSize: "18px", fontWeight: 800 }}>Receive Order & Score Supplier</h3>
              <button
                style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "20px" }}
                onClick={() => setDeliveryModalOrder(null)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                Confirming delivery for order <strong>{deliveryModalOrder.poNumber}</strong> ({deliveryModalOrder.vendorName}).
              </p>

              <div className="form-group">
                <label className="form-label">Was delivery on time?</label>
                <div style={{ display: "flex", gap: "12px", marginTop: "4px" }}>
                  <button
                    type="button"
                    className={`btn-secondary ${deliveryWasOnTime ? "active" : ""}`}
                    style={{ flex: 1, borderColor: deliveryWasOnTime ? "var(--brand-green-dark)" : "var(--border-subtle)", color: deliveryWasOnTime ? "var(--brand-green-dark)" : "inherit" }}
                    onClick={() => setDeliveryWasOnTime(true)}
                  >
                    ✓ Yes, On-Time
                  </button>
                  <button
                    type="button"
                    className={`btn-secondary ${!deliveryWasOnTime ? "active" : ""}`}
                    style={{ flex: 1, borderColor: !deliveryWasOnTime ? "#dc2626" : "var(--border-subtle)", color: !deliveryWasOnTime ? "#dc2626" : "inherit" }}
                    onClick={() => setDeliveryWasOnTime(false)}
                  >
                    ✕ No, Delayed
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Product Quality Rating (1 - 5 Stars)</label>
                <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      className="btn-secondary"
                      style={{
                        flex: 1,
                        fontSize: "16px",
                        borderColor: deliveryQualityRating >= star ? "#d97706" : "var(--border-subtle)",
                        color: deliveryQualityRating >= star ? "#d97706" : "var(--text-muted)",
                      }}
                      onClick={() => setDeliveryQualityRating(star)}
                    >
                      ★ {star}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setDeliveryModalOrder(null)}>
                Cancel
              </button>
              <button type="button" className="btn-green" onClick={handleConfirmDelivery}>
                Confirm Delivery & Update Score
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: ADD PRODUCT & CONNECT TO SUPPLIER */}
      {/* ==================================================================== */}
      {isAddProductOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: "18px", fontWeight: 800 }}>Add Product & Link to Supplier</h3>
                <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                  Register a catalog part or competitive supplier quote.
                </p>
              </div>
              <button
                style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "20px" }}
                onClick={() => setIsAddProductOpen(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateProduct}>
              <div className="modal-body">
                {productModalError && (
                  <div className="edge-case-alert danger">
                    <span>⚠️ {productModalError}</span>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Connected Supplier *</label>
                  <select
                    className="form-select"
                    required
                    value={newProduct.vendorId}
                    onChange={(e) => setNewProduct({ ...newProduct, vendorId: e.target.value })}
                  >
                    <option value="">Select an approved supplier...</option>
                    {vendors.map((v) => (
                      <option
                        key={v.id}
                        value={v.id}
                        disabled={v.status === "SUSPENDED"}
                      >
                        {v.name} ({v.tier}) {v.status === "SUSPENDED" ? " - SUSPENDED (Ineligible)" : v.status === "PROBATION" ? " - [Probation]" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div className="form-group">
                    <label className="form-label">Product / Part Name *</label>
                    <input
                      type="text"
                      required
                      className="form-input"
                      placeholder="e.g. Optical Sensor Probe"
                      value={newProduct.itemName}
                      onChange={(e) => setNewProduct({ ...newProduct, itemName: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">SKU (Part Number) *</label>
                    <input
                      type="text"
                      required
                      className="form-input"
                      placeholder="e.g. SENS-OPT-4K"
                      value={newProduct.sku}
                      onChange={(e) => setNewProduct({ ...newProduct, sku: e.target.value.toUpperCase() })}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div className="form-group">
                    <label className="form-label">Category</label>
                    <input
                      type="text"
                      className="form-input"
                      value={newProduct.category}
                      onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Unit Price ($) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      className="form-input"
                      value={newProduct.unitPrice}
                      onChange={(e) => setNewProduct({ ...newProduct, unitPrice: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div className="form-group">
                    <label className="form-label">Minimum Order Qty (MOQ) *</label>
                    <input
                      type="number"
                      min="1"
                      required
                      className="form-input"
                      value={newProduct.minOrderQty}
                      onChange={(e) => setNewProduct({ ...newProduct, minOrderQty: Number(e.target.value) })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Lead Time (Business Days)</label>
                    <input
                      type="number"
                      min="0"
                      required
                      className="form-input"
                      value={newProduct.leadTimeDays}
                      onChange={(e) => setNewProduct({ ...newProduct, leadTimeDays: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "4px" }}>
                  <input
                    type="checkbox"
                    id="inStockCheck"
                    checked={newProduct.inStock}
                    onChange={(e) => setNewProduct({ ...newProduct, inStock: e.target.checked })}
                    style={{ width: "16px", height: "16px", cursor: "pointer" }}
                  />
                  <label htmlFor="inStockCheck" style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", cursor: "pointer" }}>
                    Item is currently in stock (Ready to dispatch)
                  </label>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setIsAddProductOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save Product Quote
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: PRODUCT ORDER TRACKING & HISTORY */}
      {/* ==================================================================== */}
      {isTrackingModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content modal-lg">
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: "18px", fontWeight: 800 }}>
                  Order History: {trackingSKU}
                </h3>
                <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                  {trackingSummary?.itemName ? `${trackingSummary.itemName} • ` : ""}Track volume, total spend, and purchase order lifecycles across suppliers.
                </p>
              </div>
              <button
                style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "20px" }}
                onClick={() => setIsTrackingModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              {trackingLoading ? (
                <div style={{ textAlign: "center", padding: "32px 0", color: "var(--text-muted)" }}>
                  Loading order tracking records...
                </div>
              ) : trackingSummary ? (
                <div>
                  {/* KPI Strip */}
                  <div className="product-kpi-grid">
                    <div className="product-kpi-box">
                      <div className="product-kpi-label">Total Units Ordered</div>
                      <div className="product-kpi-value">{trackingSummary.totalUnits.toLocaleString()}</div>
                    </div>
                    <div className="product-kpi-box">
                      <div className="product-kpi-label">Total Spend on SKU</div>
                      <div className="product-kpi-value" style={{ color: "var(--brand-green-dark)" }}>
                        ${trackingSummary.totalSpend.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div className="product-kpi-box">
                      <div className="product-kpi-label">Purchase Orders</div>
                      <div className="product-kpi-value">{trackingSummary.totalOrders}</div>
                    </div>
                  </div>

                  {/* Orders Table */}
                  {trackingSummary.orders.length > 0 ? (
                    <div className="data-table-container">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>PO Number</th>
                            <th>Supplier</th>
                            <th>Order Date</th>
                            <th>Quantity</th>
                            <th>Unit Price</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(trackingSummary.orders || []).map((po) => {
                            const items = po.items || [];
                            const line = items.find((it) => it.sku.toUpperCase() === trackingSKU.toUpperCase()) || items[0];
                            return (
                              <tr key={po.id}>
                                <td style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                                  {po.poNumber}
                                </td>
                                <td>
                                  <div style={{ fontWeight: 600 }}>{po.vendorName}</div>
                                  <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>ID: {po.vendorId}</div>
                                </td>
                                <td>{new Date(po.orderDate).toLocaleDateString()}</td>
                                <td style={{ fontWeight: 700 }}>{line?.quantity || 0} units</td>
                                <td>${line?.unitPrice ? line.unitPrice.toFixed(2) : "0.00"}</td>
                                <td>{getOrderStatusBadge(po.status)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ textAlign: "center", padding: "30px 16px", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)" }}>
                      <p style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>
                        No purchase orders placed for {trackingSKU} yet
                      </p>
                      <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                        Click "Order Product" on the comparison card to place the first order.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-muted)" }}>
                  No order tracking data available for {trackingSKU}.
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button type="button" className="btn-primary" onClick={() => setIsTrackingModalOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: NEW PURCHASE ORDER */}
      {/* ==================================================================== */}
      {isNewOrderOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{ fontSize: "18px", fontWeight: 800 }}>Generate Purchase Order</h3>
              <button
                style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "20px" }}
                onClick={() => {
                  setIsNewOrderOpen(false);
                  setOrderError("");
                  setSelectedCatalogItem(null);
                }}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateOrder}>
              <div className="modal-body">
                {/* Edge Case Warning Banners */}
                {orderError && (
                  <div className="edge-case-alert danger">
                    <span>⚠️ {orderError}</span>
                  </div>
                )}

                {newOrderVendorId && vendors.find((v) => v.id === newOrderVendorId)?.status === "PROBATION" && (
                  <div className="edge-case-alert warning">
                    <span>⚠️ Caution: This supplier is currently on Probation. High risk of fulfillment delay.</span>
                  </div>
                )}

                {newOrderVendorId && vendors.find((v) => v.id === newOrderVendorId)?.status === "SUSPENDED" && (
                  <div className="edge-case-alert danger">
                    <span>⛔ Supplier is SUSPENDED. Orders cannot be submitted until status is restored.</span>
                  </div>
                )}

                {selectedCatalogItem && !selectedCatalogItem.inStock && (
                  <div className="edge-case-alert warning">
                    <span>ℹ️ Notice: Item is on Backorder. Quoted lead time: {selectedCatalogItem.leadTimeDays} business days.</span>
                  </div>
                )}

                {selectedCatalogItem && newOrderQty < selectedCatalogItem.minOrderQty && (
                  <div className="edge-case-alert warning">
                    <span>⚠️ Minimum Order Quantity for this item is {selectedCatalogItem.minOrderQty} units.</span>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Target Supplier</label>
                  <select
                    className="form-select"
                    required
                    value={newOrderVendorId}
                    onChange={(e) => setNewOrderVendorId(e.target.value)}
                  >
                    <option value="">Select a supplier...</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id} disabled={v.status === "SUSPENDED"}>
                        {v.name} ({v.tier}) {v.status === "SUSPENDED" ? " - SUSPENDED (Ineligible)" : v.status === "PROBATION" ? " - [Probation]" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Item / Product Name</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="e.g. Titanium Hex Bolts"
                    value={newOrderItemName}
                    onChange={(e) => setNewOrderItemName(e.target.value)}
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div className="form-group">
                    <label className="form-label">
                      Quantity {selectedCatalogItem ? `(MOQ: ${selectedCatalogItem.minOrderQty})` : ""}
                    </label>
                    <input
                      type="number"
                      min={selectedCatalogItem?.minOrderQty || 1}
                      required
                      className="form-input"
                      value={newOrderQty}
                      onChange={(e) => setNewOrderQty(Number(e.target.value))}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Unit Price ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.1"
                      required
                      className="form-input"
                      value={newOrderPrice}
                      onChange={(e) => setNewOrderPrice(Number(e.target.value))}
                    />
                  </div>
                </div>
                <div style={{ background: "var(--bg-secondary)", padding: "14px", borderRadius: "var(--radius-sm)", fontSize: "13px", border: "1px solid var(--border-subtle)" }}>
                  Estimated Total: <strong style={{ color: "var(--brand-green-dark)" }}>${(newOrderQty * newOrderPrice * (1 + (settings.defaultTaxRate || 0.08))).toFixed(2)}</strong> (inc. {((settings.defaultTaxRate || 0.08) * 100).toFixed(1)}% tax)
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setIsNewOrderOpen(false);
                    setOrderError("");
                    setSelectedCatalogItem(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={vendors.find((v) => v.id === newOrderVendorId)?.status === "SUSPENDED"}
                >
                  Create Purchase Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: ADD MASTER PRODUCT */}
      {/* ==================================================================== */}
      {isAddMasterProductOpen && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3 className="modal-title">Create Master Product</h3>
              <button
                className="modal-close"
                onClick={() => {
                  setIsAddMasterProductOpen(false);
                  setMasterProductError("");
                }}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateMasterProduct}>
              <div className="modal-body">
                {masterProductError && (
                  <div className="banner-alert" style={{ background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca", padding: "10px", borderRadius: "var(--radius-sm)", marginBottom: "16px", fontSize: "13px" }}>
                    ⚠️ {masterProductError}
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Product Name *</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="e.g. Titanium Hex Head Bolt M4"
                    value={newMasterProduct.name}
                    onChange={(e) => setNewMasterProduct({ ...newMasterProduct, name: e.target.value })}
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div className="form-group">
                    <label className="form-label">Master SKU *</label>
                    <input
                      type="text"
                      required
                      className="form-input"
                      placeholder="e.g. BOLT-M4-TI"
                      value={newMasterProduct.sku}
                      onChange={(e) => setNewMasterProduct({ ...newMasterProduct, sku: e.target.value.toUpperCase() })}
                      style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Category</label>
                    <select
                      className="form-select"
                      value={newMasterProduct.category}
                      onChange={(e) => setNewMasterProduct({ ...newMasterProduct, category: e.target.value })}
                    >
                      <option value="Precision Hardware & CNC">Precision Hardware & CNC</option>
                      <option value="Aviation Composites">Aviation Composites</option>
                      <option value="Avionics & Semiconductors">Avionics & Semiconductors</option>
                      <option value="Robotics & Actuators">Robotics & Actuators</option>
                      <option value="Fluid Systems & Seals">Fluid Systems & Seals</option>
                      <option value="General Fasteners">General Fasteners</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div className="form-group">
                    <label className="form-label">Unit of Measure</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="units, kg, reels, meters..."
                      value={newMasterProduct.unitOfMeasure}
                      onChange={(e) => setNewMasterProduct({ ...newMasterProduct, unitOfMeasure: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Target Minimum Stock</label>
                    <input
                      type="number"
                      min="0"
                      className="form-input"
                      placeholder="e.g. 500"
                      value={newMasterProduct.targetStockLevel}
                      onChange={(e) => setNewMasterProduct({ ...newMasterProduct, targetStockLevel: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Technical Description & Notes</label>
                  <textarea
                    className="form-input"
                    rows={2}
                    placeholder="Engineering specs, tolerances, material grade..."
                    value={newMasterProduct.description}
                    onChange={(e) => setNewMasterProduct({ ...newMasterProduct, description: e.target.value })}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setIsAddMasterProductOpen(false);
                    setMasterProductError("");
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Create Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: LINK SUPPLIER & INITIAL INVENTORY */}
      {/* ==================================================================== */}
      {isLinkSupplierOpen && selectedProductForInventory && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Link Supplier to Product</h3>
                <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                  Product: <strong style={{ color: "var(--brand-green-dark)" }}>{selectedProductForInventory.name}</strong> ({selectedProductForInventory.sku})
                </p>
              </div>
              <button
                className="modal-close"
                onClick={() => {
                  setIsLinkSupplierOpen(false);
                  setLinkSupplierError("");
                }}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleLinkSupplierToProduct}>
              <div className="modal-body">
                {linkSupplierError && (
                  <div className="banner-alert" style={{ background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca", padding: "10px", borderRadius: "var(--radius-sm)", marginBottom: "16px", fontSize: "13px" }}>
                    ⚠️ {linkSupplierError}
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Select Approved Supplier *</label>
                  <select
                    className="form-select"
                    required
                    value={linkSupplierForm.vendorId}
                    onChange={(e) => setLinkSupplierForm({ ...linkSupplierForm, vendorId: e.target.value })}
                  >
                    <option value="">Choose a supplier from directory...</option>
                    {vendors.map((v) => {
                      const alreadyLinked = selectedProductForInventory.inventory.some((inv) => inv.vendorId === v.id);
                      return (
                        <option key={v.id} value={v.id} disabled={alreadyLinked || v.status === "SUSPENDED"}>
                          {v.name} ({v.tier}) {alreadyLinked ? " - [Already Linked]" : v.status === "SUSPENDED" ? " - [SUSPENDED]" : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div className="form-group">
                    <label className="form-label">Quantity on Hand *</label>
                    <input
                      type="number"
                      min="0"
                      required
                      className="form-input"
                      value={linkSupplierForm.quantityOnHand}
                      onChange={(e) => setLinkSupplierForm({ ...linkSupplierForm, quantityOnHand: Number(e.target.value) })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Reorder Alert Threshold</label>
                    <input
                      type="number"
                      min="0"
                      className="form-input"
                      value={linkSupplierForm.reorderPoint}
                      onChange={(e) => setLinkSupplierForm({ ...linkSupplierForm, reorderPoint: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Warehouse / Consignment Notes</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Lot #8849, Austin Central Warehouse Bay 4"
                    value={linkSupplierForm.notes}
                    onChange={(e) => setLinkSupplierForm({ ...linkSupplierForm, notes: e.target.value })}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setIsLinkSupplierOpen(false);
                    setLinkSupplierError("");
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Connect Supplier & Save Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: UPDATE SUPPLIER STOCK */}
      {/* ==================================================================== */}
      {editingStockModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Update Supplier Stock Level</h3>
                <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                  {editingStockModal.productName} ↔ <strong style={{ color: "var(--brand-green-dark)" }}>{editingStockModal.vendorName}</strong>
                </p>
              </div>
              <button className="modal-close" onClick={() => setEditingStockModal(null)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleUpdateSupplierStock}>
              <div className="modal-body">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div className="form-group">
                    <label className="form-label">Quantity on Hand *</label>
                    <input
                      type="number"
                      min="0"
                      required
                      className="form-input"
                      value={editingStockModal.quantityOnHand}
                      onChange={(e) => setEditingStockModal({ ...editingStockModal, quantityOnHand: Number(e.target.value) })}
                      style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "16px" }}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Reorder Point Threshold</label>
                    <input
                      type="number"
                      min="0"
                      className="form-input"
                      value={editingStockModal.reorderPoint}
                      onChange={(e) => setEditingStockModal({ ...editingStockModal, reorderPoint: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Adjustment Reason / Notes</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Physical inventory cycle count audit completed"
                    value={editingStockModal.notes}
                    onChange={(e) => setEditingStockModal({ ...editingStockModal, notes: e.target.value })}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setEditingStockModal(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save Stock Level
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Supabase Authentication Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={(user, token) => {
          setCurrentUser(user);
          setAuthToken(token);
        }}
      />
    </div>
  );
}
