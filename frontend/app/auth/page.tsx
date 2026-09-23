"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase, isSupabaseConfigured, AuthUser } from "@/lib/supabase";

export default function AuthPage() {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // If already logged in, redirect to /dashboard
  useEffect(() => {
    const savedUser = localStorage.getItem("vendoros_user");
    const savedToken = localStorage.getItem("vendoros_token");
    if (savedUser && savedToken) {
      router.push("/dashboard");
    }
  }, [router]);

  const handleAuthSuccess = (user: AuthUser, token: string) => {
    localStorage.setItem("vendoros_user", JSON.stringify(user));
    localStorage.setItem("vendoros_token", token);
    router.push("/dashboard");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    setLoading(true);

    try {
      if (isSupabaseConfigured && supabase) {
        if (isSignUp) {
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                name: name.trim() || email.split("@")[0],
                role: "Procurement Manager",
              },
            },
          });
          if (error) throw error;
          if (data.session) {
            handleAuthSuccess(
              {
                id: data.user?.id || "usr_1",
                email: data.user?.email || email,
                name: name.trim() || email.split("@")[0],
                role: "Procurement Manager",
              },
              data.session.access_token
            );
          } else {
            setSuccessMessage("Account created! Check your email inbox to confirm your account.");
          }
        } else {
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          if (error) throw error;
          if (data.session) {
            handleAuthSuccess(
              {
                id: data.user?.id || "usr_1",
                email: data.user?.email || email,
                name: data.user?.user_metadata?.name || email.split("@")[0],
                role: data.user?.user_metadata?.role || "Procurement Manager",
              },
              data.session.access_token
            );
          }
        }
      } else {
        // Offline / Demo mode fallback
        const demoToken = "demo-jwt-token-vendoros";
        handleAuthSuccess(
          {
            id: "demo-user-" + Math.floor(Math.random() * 1000),
            email: email || "lead.buyer@vendoros.corp",
            name: name || (isSignUp ? "New Procurement Specialist" : "Senior Buyer"),
            role: "Procurement Manager",
          },
          demoToken
        );
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Authentication failed. Please verify credentials.");
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = () => {
    handleAuthSuccess(
      {
        id: "demo_procurement_lead",
        email: "sarah.connor@vendoros.corp",
        name: "Sarah Connor (Procurement Lead)",
        role: "Procurement Manager",
      },
      "demo-bearer-token"
    );
  };

  return (
    <div className="auth-page-wrapper">
      {/* Ambient background glows */}
      <div className="auth-ambient-orb auth-orb-1" />
      <div className="auth-ambient-orb auth-orb-2" />

      {/* Navigation back */}
      <header className="auth-nav-header">
        <Link href="/" className="auth-back-link">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          Back to VendorOS Home
        </Link>
      </header>

      {/* Main Auth Card */}
      <main className="auth-card-container">
        <div className="auth-card">
          {/* Logo & Header */}
          <div className="auth-header">
            <div className="auth-brand-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                <line x1="12" y1="22.08" x2="12" y2="12"></line>
              </svg>
            </div>
            <h1 className="auth-title">VendorOS</h1>
            <p className="auth-subtitle">
              Enterprise Supplier Intelligence & Procurement Platform
            </p>
          </div>

          {/* Tab Selector */}
          <div className="auth-tabs">
            <button
              type="button"
              className={`auth-tab-btn ${!isSignUp ? "active" : ""}`}
              onClick={() => {
                setIsSignUp(false);
                setErrorMessage("");
                setSuccessMessage("");
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`auth-tab-btn ${isSignUp ? "active" : ""}`}
              onClick={() => {
                setIsSignUp(true);
                setErrorMessage("");
                setSuccessMessage("");
              }}
            >
              Create Account
            </button>
          </div>

          {/* Feedback Alerts */}
          {errorMessage && (
            <div className="auth-alert auth-alert-error">
              <span>⚠️ {errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="auth-alert auth-alert-success">
              <span>✓ {successMessage}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="auth-form">
            {isSignUp && (
              <div className="auth-field">
                <label className="auth-label">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Alex Mercer"
                  className="auth-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            )}

            <div className="auth-field">
              <label className="auth-label">Work Email</label>
              <input
                type="email"
                required
                placeholder="procurement@company.com"
                className="auth-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="auth-field">
              <label className="auth-label">Password</label>
              <input
                type="password"
                required
                placeholder="••••••••••••"
                className="auth-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button type="submit" className="auth-submit-btn" disabled={loading}>
              {loading ? (
                <span className="auth-spinner-row">
                  <span className="auth-spinner" /> Authenticating...
                </span>
              ) : isSignUp ? (
                "Create Enterprise Account →"
              ) : (
                "Sign In to Console →"
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="auth-divider">
            <span>OR INSTANT DEMO</span>
          </div>

          {/* 1-Click Demo Login */}
          <button
            type="button"
            onClick={handleDemoLogin}
            className="auth-demo-btn"
          >
            <span className="auth-demo-badge">Instant</span>
            <span>1-Click Demo Account (Procurement Lead)</span>
          </button>

          {/* Footer notice */}
          <p className="auth-footer-text">
            Protected by SOC2 Type II compliance & role-based encrypted access.
          </p>
        </div>
      </main>
    </div>
  );
}
