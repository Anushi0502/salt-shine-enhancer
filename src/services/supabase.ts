import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_STORAGE_KEY = "salt-supabase-auth";
let supabaseClient: SupabaseClient | null = null;

export type SupabaseConfig = {
  url: string;
  anonKey: string;
};

export function getSupabaseConfig(): SupabaseConfig {
  return {
    url: String(import.meta.env.VITE_SUPABASE_URL || "").trim(),
    anonKey: String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim(),
  };
}

export function isSupabaseConfigured(): boolean {
  const { url, anonKey } = getSupabaseConfig();
  return Boolean(url && anonKey);
}

export function getSupabaseClient(): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient;
  }

  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) {
    throw new Error("Supabase is not configured.");
  }

  supabaseClient = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: DEFAULT_STORAGE_KEY,
    },
  });

  return supabaseClient;
}
