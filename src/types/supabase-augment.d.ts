// Temporary type augmentation while types.ts regenerates
// This allows .from("table_name") to work with any table name
// Remove this file once types.ts has been regenerated with the full schema

declare module "@/integrations/supabase/client" {
  import { SupabaseClient } from "@supabase/supabase-js";
  export const supabase: SupabaseClient<any>;
}
