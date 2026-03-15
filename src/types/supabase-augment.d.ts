// Temporary type augmentation for Supabase client
// The auto-generated types.ts currently has empty Tables.
// This declaration allows .from("table_name") to work without type errors
// until types.ts is regenerated with the full schema.

import type { SupabaseClient } from "@supabase/supabase-js";

declare module "@supabase/supabase-js" {
  interface SupabaseClient {
    from(table: string): any;
  }
}
