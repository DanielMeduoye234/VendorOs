# VendorOS — Enterprise Supplier Management & Procurement Platform

VendorOS is a high-performance, enterprise-grade supplier intelligence and procurement operating system built with a **Golang REST API** backend and a **Next.js (React 19)** frontend, powered by **Supabase PostgreSQL & Auth**.

---

## 🌟 Key Features

- **Supplier Directory & Lifecycle Management**: Tier classification (Strategic, Preferred, Standard, Under Review), reliability scoring algorithm, and compliance auditing.
- **Product & Multi-Supplier Inventory**: Canonical SKU management with real-time stock levels, reorder threshold alerts, and supplier stock allocations.
- **Dynamic Price Comparison Matrix**: Cross-vendor SKU quotes comparison, cheapest vendor detection, and lead time optimization.
- **Purchase Order Workflow State Machine**: End-to-end PO lifecycle tracking (`DRAFT` ➔ `SUBMITTED` ➔ `CONFIRMED` ➔ `SHIPPED` ➔ `DELIVERED` / `CANCELLED`) with automated delivery ratings and on-time SLA recalculation.
- **Supabase Authentication & Multi-Tenancy**: Live JWT session verification, role-based metadata, and persistent clean slate isolation.

---

## 🏗️ Architecture

```
VendorOS/
├── backend/                  # High-performance Golang REST API
│   ├── handlers/             # HTTP controller endpoints & JWT middleware
│   ├── models/               # Domain structs, sentinel errors & state machines
│   ├── store/                # Thread-safe in-memory & Supabase PostgreSQL stores
│   ├── schema.sql            # Clean PostgreSQL DDL schema
│   ├── seed.sql              # Optional sample dataset
│   └── main.go               # Server initialization & routing pipeline
├── frontend/                 # Next.js 15+ Enterprise Web Application
│   ├── app/                  # App router (/ - Hero, /auth - Auth, /dashboard - Console)
│   ├── components/           # Reusable UI components & modals
│   ├── lib/                  # Supabase client & authentication helpers
│   └── next.config.js
└── .gitignore
```

---

## 🚀 Getting Started

### 1. Backend (Go)

```bash
cd backend

# Copy environment template
cp .env.example .env

# Run server (defaults to port 8080 or :$PORT)
go run main.go
```

### 2. Frontend (Next.js)

```bash
cd frontend

# Install dependencies
npm install

# Copy environment template
cp .env.local.example .env.local

# Run development server
npm run dev
```

---

## ☁️ Deployment Guide

### Vercel Deployment (Frontend)
1. Import repository on [Vercel](https://vercel.com).
2. Set Root Directory to `frontend`.
3. Configure Environment Variables:
   - `NEXT_PUBLIC_API_URL`: Your deployed Go API URL (e.g. `https://api.yourdomain.com`)
   - `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase Anon Key

### Cloud Deployment (Backend)
Deploy the `backend` directory to Render, Fly.io, Railway, or Google Cloud Run.
Configure Environment Variables:
- `PORT`: (automatically provided by cloud provider)
- `DATABASE_URL`: Supabase PostgreSQL connection string
- `SUPABASE_JWT_SECRET`: Supabase JWT secret (for enforcing token verification)
