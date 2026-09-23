import { createClient, SupabaseClient } from "@supabase/supabase-js";

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
const rawKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";

// Check if live Supabase project credentials are configured with a valid HTTP URL
export const isSupabaseConfigured = Boolean(
  rawUrl &&
  rawKey &&
  (rawUrl.startsWith("https://") || rawUrl.startsWith("http://"))
);

function initSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  try {
    return createClient(rawUrl, rawKey);
  } catch (err) {
    console.error("Failed to initialize Supabase client:", err);
    return null;
  }
}

// Real or mock Supabase client
export const supabase: SupabaseClient | null = initSupabase();

// User profile interface
export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  role?: string;
}
