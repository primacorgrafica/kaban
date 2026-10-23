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

  const startTime = performance.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Configuração do Supabase ausente" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // 1. Medição de latência de leitura e contagem de O.S. ativas
    const dbQueryStart = performance.now();
    const { count: activeCount, error: countError } = await adminClient
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("arquivado", false);

    const queryLatencyMs = performance.now() - dbQueryStart;

    if (countError) {
      throw new Error(`Falha ao auditar banco de dados: ${countError.message}`);
    }

    // 2. Contagem de O.S. aguardando aprovação
    const { count: approvalCount } = await adminClient
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("arquivado", false)
      .eq("status", "aguardando_aprovacao");

    // 3. Auditoria de eventos de e-mail recentes (últimas 24h)
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count: recentEmailCount } = await adminClient
      .from("order_email_events")
      .select("id", { count: "exact", head: true })
      .gte("created_at", yesterday);

    // 3.1. Auditoria de notificações de vendedores pendentes
    const { count: pendingSellerNotifs } = await adminClient
      .from("order_seller_notifications")
      .select("id", { count: "exact", head: true })
      .eq("sent_status", "pending");

    const totalDurationMs = performance.now() - startTime;
    const status = queryLatencyMs > 2000 ? "DEGRADED" : "HEALTHY";

    // 4. Registra métrica de telemetria autônoma 24/7 no banco
    await adminClient.from("system_health_telemetry").insert({
      metric_type: "HEARTBEAT",
      source: "edge_function_cron",
      status,
      latency_ms: Math.round(queryLatencyMs),
      details: {
        active_orders: activeCount || 0,
        awaiting_approval: approvalCount || 0,
        recent_email_events_24h: recentEmailCount || 0,
        pending_seller_notifications: pendingSellerNotifs || 0,
        total_duration_ms: Math.round(totalDurationMs),
        audited_at: new Date().toISOString(),
      },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        status,
        latency_ms: Math.round(queryLatencyMs),
        metrics: {
          active_orders: activeCount || 0,
          awaiting_approval: approvalCount || 0,
          recent_email_events_24h: recentEmailCount || 0,
        },
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    const totalDurationMs = performance.now() - startTime;

    // Em caso de falha, tenta gravar o alerta crítico na telemetria
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (supabaseUrl && serviceRoleKey) {
        const adminClient = createClient(supabaseUrl, serviceRoleKey);
        await adminClient.from("system_health_telemetry").insert({
          metric_type: "SYSTEM_ALERT",
          source: "edge_function_cron",
          status: "CRITICAL",
          latency_ms: Math.round(totalDurationMs),
          details: { error: error?.message || String(error) },
        });
      }
    } catch {}

    return new Response(
      JSON.stringify({
        ok: false,
        status: "CRITICAL",
        error: error?.message || String(error),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
