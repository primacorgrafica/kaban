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

    // Check admin role
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

    // Export all system tables
    const [
      { data: orders },
      { data: profiles },
      { data: orderStatusHistory },
      { data: sectorHistory },
      { data: orderTimeSummary },
      { data: userRoles },
      { data: equipamentos },
      { data: vendedores },
      { data: avisos },
      { data: chatConversations },
      { data: chatMessages },
    ] = await Promise.all([
      adminClient.from("orders").select("*"),
      adminClient.from("profiles").select("*"),
      adminClient.from("order_status_history").select("*"),
      adminClient.from("sector_history").select("*"),
      adminClient.from("order_time_summary").select("*"),
      adminClient.from("user_roles").select("*"),
      adminClient.from("equipamentos").select("*"),
      adminClient.from("vendedores").select("*"),
      adminClient.from("avisos").select("*"),
      adminClient.from("chat_conversations").select("*"),
      adminClient.from("chat_messages").select("*"),
    ]);

    const backup = {
      metadata: {
        created_at: new Date().toISOString(),
        created_by: user.email,
        version: "2.0",
      },
      tables: {
        orders: orders || [],
        profiles: profiles || [],
        order_status_history: orderStatusHistory || [],
        sector_history: sectorHistory || [],
        order_time_summary: orderTimeSummary || [],
        user_roles: userRoles || [],
        equipamentos: equipamentos || [],
        vendedores: vendedores || [],
        avisos: avisos || [],
        chat_conversations: chatConversations || [],
        chat_messages: chatMessages || [],
      },
      summary: {
        orders: orders?.length || 0,
        profiles: profiles?.length || 0,
        order_status_history: orderStatusHistory?.length || 0,
        sector_history: sectorHistory?.length || 0,
        order_time_summary: orderTimeSummary?.length || 0,
        user_roles: userRoles?.length || 0,
        equipamentos: equipamentos?.length || 0,
        vendedores: vendedores?.length || 0,
        avisos: avisos?.length || 0,
        chat_conversations: chatConversations?.length || 0,
        chat_messages: chatMessages?.length || 0,
      },
    };

    return new Response(JSON.stringify(backup, null, 2), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="backup-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
