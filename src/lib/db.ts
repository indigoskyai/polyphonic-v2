// Typed helper for supabase queries while types.ts auto-regenerates
// Once types.ts is updated with the full schema, these can be replaced
// with direct supabase.from() calls.
import { supabase } from "@/integrations/supabase/client";

/**
 * Wrapper around supabase.from() that bypasses the auto-generated
 * type constraints. Use this when types.ts hasn't caught up with
 * the current database schema.
 */
export function db(table: string) {
  return (supabase as any).from(table);
}
