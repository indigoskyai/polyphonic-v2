// Type shims so the project's TS check (which scans supabase/functions) doesn't
// flag Deno-specific globals/imports. Edge functions actually run on Deno where
// these are real; here we just declare the surface we use.
declare const Deno: {
  env: { get(name: string): string | undefined };
  readTextFile(path: string | URL): Promise<string>;
};

declare module "https://esm.sh/@supabase/supabase-js@2" {
  // deno-lint-ignore no-explicit-any
  export const createClient: any;
  // deno-lint-ignore no-explicit-any
  export type SupabaseClient = any;
}

declare module "https://deno.land/std@0.168.0/http/server.ts" {
  // deno-lint-ignore no-explicit-any
  export const serve: any;
}
