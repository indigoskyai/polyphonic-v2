import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { error } = await supabase.from("app_config").upsert([
    { key: "supabase_url", value: supabaseUrl },
    { key: "service_role_key", value: serviceRoleKey },
  ], { onConflict: "key" });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ success: true, message: "Config seeded" }), {
    headers: { "Content-Type": "application/json" },
  });
});
