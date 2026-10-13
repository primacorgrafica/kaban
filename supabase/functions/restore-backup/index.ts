import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify user is admin
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Acesso negado. Apenas admins." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const backup = await req.json();

    // Validate backup structure
    if (!backup?.tables || !backup?.metadata) {
      return new Response(JSON.stringify({ error: "Arquivo de backup inválido. Estrutura não reconhecida." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Record<string, { inserted: number; errors: number }> = {};

    // Restore orders (upsert by id)
    if (backup.tables.orders?.length > 0) {
      const { data, error } = await adminClient
        .from("orders")
        .upsert(backup.tables.orders, { onConflict: "id" });
      results.orders = {
        inserted: backup.tables.orders.length,
        errors: error ? 1 : 0,
      };
    }

    // Restore profiles (upsert by id)
    if (backup.tables.profiles?.length > 0) {
      const { data, error } = await adminClient
        .from("profiles")
        .upsert(backup.tables.profiles, { onConflict: "id" });
      results.profiles = {
        inserted: backup.tables.profiles.length,
        errors: error ? 1 : 0,
      };
    }

    // Restore order_status_history (upsert by id)
    if (backup.tables.order_status_history?.length > 0) {
      const { data, error } = await adminClient
        .from("order_status_history")
        .upsert(backup.tables.order_status_history, { onConflict: "id" });
      results.order_status_history = {
        inserted: backup.tables.order_status_history.length,
        errors: error ? 1 : 0,
      };
    }

    // Restore user_roles (upsert by id)
    if (backup.tables.user_roles?.length > 0) {
      const { data, error } = await adminClient
        .from("user_roles")
        .upsert(backup.tables.user_roles, { onConflict: "id" });
      results.user_roles = {
        inserted: backup.tables.user_roles.length,
        errors: error ? 1 : 0,
      };
    }

    return new Response(JSON.stringify({
      success: true,
      message: "Backup restaurado com sucesso!",
      backup_date: backup.metadata.created_at,
      results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
