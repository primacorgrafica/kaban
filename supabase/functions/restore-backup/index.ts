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

    // 1. Tabelas independentes (sem chaves estrangeiras complexas)
    if (backup.tables.vendedores?.length > 0) {
      const { error } = await adminClient
        .from("vendedores")
        .upsert(backup.tables.vendedores, { onConflict: "id" });
      results.vendedores = { inserted: backup.tables.vendedores.length, errors: error ? 1 : 0 };
    }

    if (backup.tables.equipamentos?.length > 0) {
      const { error } = await adminClient
        .from("equipamentos")
        .upsert(backup.tables.equipamentos, { onConflict: "id" });
      results.equipamentos = { inserted: backup.tables.equipamentos.length, errors: error ? 1 : 0 };
    }

    if (backup.tables.avisos?.length > 0) {
      const { error } = await adminClient
        .from("avisos")
        .upsert(backup.tables.avisos, { onConflict: "id" });
      results.avisos = { inserted: backup.tables.avisos.length, errors: error ? 1 : 0 };
    }

    // 2. Perfis e papéis de usuário
    if (backup.tables.profiles?.length > 0) {
      const { error } = await adminClient
        .from("profiles")
        .upsert(backup.tables.profiles, { onConflict: "id" });
      results.profiles = { inserted: backup.tables.profiles.length, errors: error ? 1 : 0 };
    }

    if (backup.tables.user_roles?.length > 0) {
      const { error } = await adminClient
        .from("user_roles")
        .upsert(backup.tables.user_roles, { onConflict: "id" });
      results.user_roles = { inserted: backup.tables.user_roles.length, errors: error ? 1 : 0 };
    }

    // 3. Ordens de Serviço (Ordens-mãe e sub-ordens)
    if (backup.tables.orders?.length > 0) {
      // Inserir primeiro ordens-mãe (parent_order_id IS NULL) e depois filhas para satisfazer FKs
      const parentOrders = backup.tables.orders.filter((o: any) => !o.parent_order_id);
      const childOrders = backup.tables.orders.filter((o: any) => !!o.parent_order_id);

      let errCount = 0;
      if (parentOrders.length > 0) {
        const { error: errP } = await adminClient.from("orders").upsert(parentOrders, { onConflict: "id" });
        if (errP) errCount++;
      }
      if (childOrders.length > 0) {
        const { error: errC } = await adminClient.from("orders").upsert(childOrders, { onConflict: "id" });
        if (errC) errCount++;
      }
      results.orders = { inserted: backup.tables.orders.length, errors: errCount };
    }

    // 4. Históricos e agregações analíticas vinculadas à OS
    if (backup.tables.order_status_history?.length > 0) {
      const { error } = await adminClient
        .from("order_status_history")
        .upsert(backup.tables.order_status_history, { onConflict: "id" });
      results.order_status_history = { inserted: backup.tables.order_status_history.length, errors: error ? 1 : 0 };
    }

    if (backup.tables.sector_history?.length > 0) {
      const { error } = await adminClient
        .from("sector_history")
        .upsert(backup.tables.sector_history, { onConflict: "id" });
      results.sector_history = { inserted: backup.tables.sector_history.length, errors: error ? 1 : 0 };
    }

    if (backup.tables.order_time_summary?.length > 0) {
      const { error } = await adminClient
        .from("order_time_summary")
        .upsert(backup.tables.order_time_summary, { onConflict: "id" });
      results.order_time_summary = { inserted: backup.tables.order_time_summary.length, errors: error ? 1 : 0 };
    }

    // 5. Sistema de Chat (Conversas e mensagens)
    if (backup.tables.chat_conversations?.length > 0) {
      const { error } = await adminClient
        .from("chat_conversations")
        .upsert(backup.tables.chat_conversations, { onConflict: "id" });
      results.chat_conversations = { inserted: backup.tables.chat_conversations.length, errors: error ? 1 : 0 };
    }

    if (backup.tables.chat_messages?.length > 0) {
      const { error } = await adminClient
        .from("chat_messages")
        .upsert(backup.tables.chat_messages, { onConflict: "id" });
      results.chat_messages = { inserted: backup.tables.chat_messages.length, errors: error ? 1 : 0 };
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
