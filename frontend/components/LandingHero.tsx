"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LandingHero() {
  const router = useRouter();
  const heroRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isLoaded, setIsLoaded] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  useEffect(() => {
    // Trigger smooth entrance flow
    const timer = setTimeout(() => setIsLoaded(true), 60);
    return () => clearTimeout(timer);
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!heroRef.current) return;
    const rect = heroRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setMousePos({ x, y });
  };

  const handleMouseLeave = () => {
    setMousePos({ x: 0, y: 0 });
  };

  const handleDemoAccess = () => {
    setIsMobileNavOpen(false);
    localStorage.setItem(
      "vendoros_user",
      JSON.stringify({
        id: "demo_procurement_lead",
        email: "sarah.lead@vendoros.corp",
        name: "Sarah Connor (Procurement Lead)",
        role: "Procurement Manager",
      })
    );
    localStorage.setItem("vendoros_token", "demo-bearer-token");
    router.push("/dashboard");
  };

  return (
    <div
      ref={heroRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`landing-viewport ${isLoaded ? "landing-loaded" : ""}`}
    >
      {/* Dynamic Ambient Background Glows */}
      <div
        className="ambient-orb orb-primary"
        style={{
          transform: `translate(${mousePos.x * 40}px, ${mousePos.y * 40}px)`,
        }}
      />
      <div
        className="ambient-orb orb-secondary"
        style={{
          transform: `translate(${mousePos.x * -50}px, ${mousePos.y * -50}px)`,
        }}
      />
      <div
        className="ambient-orb orb-accent"
        style={{
          transform: `translate(${mousePos.x * 25}px, ${mousePos.y * 25}px)`,
        }}
      />

      {/* Subtle Geometric Enterprise Grid */}
      <div className="landing-grid-pattern" />

      {/* Floating Procurement Cards (Living Canvas) */}
      
      {/* 1. Floating Card: Multi-SKU Cost Optimization (Top-Left) */}
      <div
        className="floating-card float-pos-top-left float-anim-1"
        style={{
          transform: `translate(${mousePos.x * -22}px, ${mousePos.y * -22}px)`,
        }}
      >
        <div className="floating-card-inner">
          <div className="float-card-header">
            <span className="float-icon-pill icon-savings">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
                <polyline points="17 6 23 6 23 12"></polyline>
              </svg>
            </span>
            <span className="float-tag-text">SKU Optimization</span>
            <span className="float-savings-pill">-18.4% Delta</span>
          </div>
          <div className="float-sku-title">BAR-AL6061-2M</div>
          <div className="float-sku-desc">Automated Multi-Quote Lowest Bid</div>
        </div>
      </div>

      {/* 2. Floating Card: Live Purchase Order Approved (Top-Right) */}
      <div
        className="floating-card float-pos-top-right float-anim-2"
        style={{
          transform: `translate(${mousePos.x * 28}px, ${mousePos.y * 28}px)`,
        }}
      >
        <div className="floating-card-inner">
          <div className="float-card-header">
            <span className="live-ping-dot" />
            <span className="float-tag-text">PO #8821 Approved</span>
            <span className="status-badge-confirmed">CONFIRMED</span>
          </div>
          <div className="float-po-amount">$48,250.00</div>
          <div className="float-po-details">
            Titan Precision Dynamics • Net 30 Terms
          </div>
        </div>
      </div>

      {/* 3. Floating Card: Supplier Reliability SLA (Bottom-Left) */}
      <div
        className="floating-card float-pos-bottom-left float-anim-3"
        style={{
          transform: `translate(${mousePos.x * -32}px, ${mousePos.y * -32}px)`,
        }}
      >
        <div className="floating-card-inner float-sla-card">
          <div className="sla-metric-circle">
            <svg viewBox="0 0 36 36" className="circular-chart">
              <path
                className="circle-bg"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className="circle-fill"
                strokeDasharray="99.4, 100"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <span className="sla-percentage">99.4%</span>
          </div>
          <div className="sla-text-content">
            <div className="sla-title">Supplier Reliability SLA</div>
            <div className="sla-badge">Strategic Tier · Zero Defects</div>
          </div>
        </div>
      </div>

      {/* 4. Floating Card: Global Supplier Mesh (Bottom-Right) */}
      <div
        className="floating-card float-pos-bottom-right float-anim-4"
        style={{
          transform: `translate(${mousePos.x * 24}px, ${mousePos.y * 24}px)`,
        }}
      >
        <div className="floating-card-inner">
          <div className="float-card-header">
            <span className="mesh-radar-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="2" y1="12" x2="22" y2="12"></line>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
              </svg>
            </span>
            <span className="float-tag-text">Active Mesh Network</span>
          </div>
          <div className="float-mesh-count">1,420 Global Nodes</div>
          <div className="float-mesh-regions">42 Industrial Hubs Connected</div>
        </div>
      </div>

      {/* Top Glass Navigation Bar */}
      <header className="landing-navbar">
        <div className="nav-brand">
          <div className="brand-logo-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
              <line x1="12" y1="22.08" x2="12" y2="12"></line>
            </svg>
          </div>
          <span className="nav-brand-text">VendorOS</span>
          <span className="nav-badge-pill">Enterprise v2.4</span>
        </div>

        <nav className="nav-center-pill">
          <span className="system-status-indicator">
            <span className="status-dot-pulse" />
            System Operational
          </span>
          <span className="nav-separator">•</span>
          <span className="nav-spec-text">Global Procurement Cloud</span>
        </nav>

        {/* Desktop Action Buttons */}
        <div className="nav-actions desktop-only">
          <Link href="/auth" className="nav-link-btn">
            Sign In
          </Link>
          <Link href="/dashboard" className="nav-launch-btn">
            <span>Launch Console</span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
          </Link>
        </div>

        {/* Mobile Hamburger Toggle Button */}
        <button
          type="button"
          className="landing-hamburger-btn mobile-only"
          onClick={() => setIsMobileNavOpen(!isMobileNavOpen)}
          aria-label="Toggle navigation menu"
          aria-expanded={isMobileNavOpen}
        >
          {isMobileNavOpen ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          )}
        </button>

        {/* Mobile Slide-Down Menu */}
        {isMobileNavOpen && (
          <div className="landing-mobile-dropdown">
            <div className="mobile-dropdown-header">
              <span className="system-status-indicator">
                <span className="status-dot-pulse" />
                System Operational · Cloud Active
              </span>
            </div>

            <div className="mobile-dropdown-links">
              <Link
                href="/dashboard"
                className="mobile-nav-primary-link"
                onClick={() => setIsMobileNavOpen(false)}
              >
                <span>Launch Console</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                  <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
              </Link>

              <button
                type="button"
                onClick={handleDemoAccess}
                className="mobile-nav-demo-link"
              >
                <span className="cta-icon-play">▶</span>
                <span>1-Click Live Demo</span>
              </button>

              <div className="mobile-dropdown-row">
                <Link
                  href="/auth"
                  className="mobile-nav-sublink"
                  onClick={() => setIsMobileNavOpen(false)}
                >
                  Sign In
                </Link>
                <Link
                  href="/auth"
                  className="mobile-nav-sublink highlight"
                  onClick={() => setIsMobileNavOpen(false)}
                >
                  Create Account
                </Link>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Main Single-Section Hero Centerpiece */}
      <main className="landing-hero-center">
        {/* Category Pill with Shimmer & Emerald Glow */}
        <div className="hero-announcement-pill">
          <span className="pill-sparkle">⚡</span>
          <span className="pill-text">THE OPERATING SYSTEM FOR MODERN PROCUREMENT</span>
          <span className="pill-arrow">→</span>
        </div>

        {/* Big "VendorOS" Flowing Headline */}
        <div className="hero-headline-container">
          <div className="brand-glow-halo" />
          <h1 className="hero-vendoros-title">
            <span className="title-word-vendor">Vendor</span>
            <span className="title-word-os">OS</span>
          </h1>
        </div>

        {/* Hero Narrative Subtitle */}
        <p className="hero-subtitle">
          Unify multi-tier suppliers, automate purchase orders, and compare real-time SKU pricing
          with enterprise-grade reliability and automated audit compliance.
        </p>

        {/* High-Impact Action Bar */}
        <div className="hero-action-group">
          <Link href="/dashboard" className="hero-primary-cta">
            <span>Enter Platform</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
          </Link>

          <button
            type="button"
            onClick={handleDemoAccess}
            className="hero-secondary-cta"
          >
            <span className="cta-icon-play">▶</span>
            <span>1-Click Live Demo</span>
          </button>

          <Link href="/auth" className="hero-auth-cta">
            <span>Create Account</span>
          </Link>
        </div>

        {/* Bottom Trust Metrics Bar */}
        <div className="hero-trust-metrics">
          <div className="trust-metric-item">
            <span className="metric-value">$120M+</span>
            <span className="metric-label">Managed PO Spend</span>
          </div>
          <div className="trust-metric-divider" />
          <div className="trust-metric-item">
            <span className="metric-value">99.8%</span>
            <span className="metric-label">On-Time Fulfillment</span>
          </div>
          <div className="trust-metric-divider" />
          <div className="trust-metric-item">
            <span className="metric-value">4.2x</span>
            <span className="metric-label">Faster RFQ Turnaround</span>
          </div>
          <div className="trust-metric-divider" />
          <div className="trust-metric-item">
            <span className="metric-value">100%</span>
            <span className="metric-label">SOC2 & Audit Compliant</span>
          </div>
        </div>
      </main>

      {/* Subtle Bottom Ambient Bar */}
      <footer className="landing-bottom-bar">
        <span>© {new Date().getFullYear()} VendorOS Enterprise Inc. All rights reserved.</span>
        <div className="bottom-links">
          <span>Security & Compliance</span>
          <span>•</span>
          <span>API Documentation</span>
          <span>•</span>
          <span>Global Privacy</span>
        </div>
      </footer>
    </div>
  );
}
