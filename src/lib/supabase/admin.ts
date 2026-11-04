import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  getSupabaseSecretKey,
  getSupabaseUrl,
  isSupabaseConfigured,
} from "./env";

let cached: SupabaseClient | null = null;

/**
 * Secret-key client for service-to-service locations APIs.
 * Bypasses RLS — never expose to the browser.
 */
export function createLocationsAdminClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (cached) return cached;

  const url = getSupabaseUrl();
  const key = getSupabaseSecretKey();
  if (!url || !key) return null;

  cached = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return cached;
}
