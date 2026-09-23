"use client";

import React, { useState } from "react";
import { supabase, isSupabaseConfigured, AuthUser } from "@/lib/supabase";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (user: AuthUser, token: string) => void;
}

export default function AuthModal({ isOpen, onClose, onAuthSuccess }: AuthModalProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  if (!isOpen) return null;

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
          });
          if (error) throw error;
          if (data.session) {
            onAuthSuccess(
              {
                id: data.user?.id || "usr_1",
                email: data.user?.email || email,
              },
              data.session.access_token
            );
            onClose();
          } else {
            setSuccessMessage("Account created successfully in Supabase! If email confirmation is enabled in your project, check your inbox to confirm your email.");
          }
        } else {
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          if (error) throw error;
          if (data.session) {
            onAuthSuccess(
              {
                id: data.user?.id || "usr_1",
                email: data.user?.email || email,
              },
              data.session.access_token
            );
            onClose();
          }
        }
      } else {
        // Demo mode fallback when .env keys haven't been pasted yet
        const demoToken = "demo-jwt-token-vendoros";
        onAuthSuccess(
          {
            id: "demo-user-" + Math.floor(Math.random() * 1000),
            email: email || "procurement.lead@vendoros.corp",
            name: "Procurement Lead",
            role: "Purchasing Manager",
          },
          demoToken
        );
        onClose();
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = () => {
    onAuthSuccess(
      {
        id: "demo_procurement_lead",
        email: "sarah.lead@vendoros.corp",
        name: "Sarah Connor (Procurement Lead)",
        role: "Procurement Manager",
      },
      "demo-bearer-token"
    );
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: "440px" }}>
        <div className="modal-header">
          <div>
            <h3 style={{ fontSize: "18px", fontWeight: 800, color: "var(--text-primary)" }}>
              {isSignUp ? "Create VendorOS Account" : "Sign In to VendorOS"}
            </h3>
            <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
              {isSupabaseConfigured
                ? "Connected to Supabase PostgreSQL & Auth"
                : "Supabase Auth (Development Mode)"}
            </p>
          </div>
          <button
            style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "20px" }}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {!isSupabaseConfigured && (
              <div style={{ background: "var(--brand-green-bg)", border: "1px solid var(--brand-green-border)", borderRadius: "var(--radius-sm)", padding: "12px", fontSize: "12px", color: "var(--brand-green-dark)" }}>
                💡 <strong>Tip</strong>: Supabase URL is not yet set in `.env.local`. You can use any email to sign in right now, or click <strong>One-Click Demo Login</strong> below!
              </div>
            )}

            {errorMessage && (
              <div style={{ background: "var(--status-danger-bg)", border: "1px solid var(--status-danger-border)", borderRadius: "var(--radius-sm)", padding: "10px", fontSize: "12px", color: "var(--status-danger-text)" }}>
                {errorMessage}
              </div>
            )}

            {successMessage && (
              <div style={{ background: "var(--brand-green-bg)", border: "1px solid var(--brand-green-border)", borderRadius: "var(--radius-sm)", padding: "10px", fontSize: "12px", color: "var(--brand-green-dark)" }}>
                ✓ {successMessage}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Work Email</label>
              <input
                type="email"
                required
                className="form-input"
                placeholder="purchasing@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                required
                minLength={6}
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px" }}>
              <button
                type="button"
                style={{ background: "transparent", border: "none", color: "var(--brand-green-dark)", cursor: "pointer", fontWeight: 700 }}
                onClick={() => setIsSignUp(!isSignUp)}
              >
                {isSignUp ? "Already have an account? Sign In" : "Need an account? Sign Up"}
              </button>
            </div>
          </div>

          <div className="modal-footer" style={{ flexDirection: "column", gap: "8px" }}>
            <button
              type="submit"
              className="btn-primary"
              disabled={loading}
              style={{ width: "100%", justifyContent: "center" }}
            >
              {loading ? "Authenticating..." : isSignUp ? "Create Account" : "Sign In"}
            </button>

            {!isSupabaseConfigured && (
              <button
                type="button"
                className="btn-secondary"
                style={{ width: "100%", justifyContent: "center", borderColor: "var(--brand-green-border)", color: "var(--brand-green-dark)", background: "var(--brand-green-bg)" }}
                onClick={handleDemoLogin}
              >
                ⚡ One-Click Demo Sign In
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
