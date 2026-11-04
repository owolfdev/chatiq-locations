import { createLocationsAdminClient } from "./admin";
import { isSupabaseConfigured } from "./env";
import { LOCATIONS_TABLES } from "./tables";

export async function probeSupabasePersistence(): Promise<{
  ok: boolean;
  error?: string;
}> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "supabase_not_configured" };
  }
  const supabase = createLocationsAdminClient();
  if (!supabase) {
    return { ok: false, error: "supabase_not_configured" };
  }

  const { error } = await supabase
    .from(LOCATIONS_TABLES.places)
    .select("id")
    .limit(1);
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
