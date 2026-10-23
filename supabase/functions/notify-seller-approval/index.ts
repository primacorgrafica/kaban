import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonResponse = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Configuração do Supabase ausente" }, 500);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const { order_id, notification_id, process_pending } = body;

    // Caso 1: Processar notificações pendentes em lote
    if (process_pending) {
      const { data: pendings, error: pErr } = await adminClient
        .from("order_seller_notifications")
        .select("id, os_number, vendedor_email, subject, attempts")
        .eq("sent_status", "pending")
        .lt("attempts", 3)
        .order("created_at", { ascending: true })
        .limit(20);

      if (pErr) {
        return jsonResponse({ error: pErr.message }, 500);
      }

      return jsonResponse({
        success: true,
        pending_count: pendings?.length || 0,
        items: pendings || [],
      }, 200);
    }

    // Caso 2: Notificar por order_id específico
    if (order_id) {
      // 1. Verifica se já existe notificação recente
      const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
      const { data: existing } = await adminClient
        .from("order_seller_notifications")
        .select("id, sent_status")
        .eq("order_id", order_id)
        .eq("status", "aguardando_aprovacao")
        .gte("created_at", twelveHoursAgo)
        .limit(1)
        .maybeSingle();

      if (existing) {
        return jsonResponse({
          success: true,
          skipped_duplicate: true,
          notification_id: existing.id,
          sent_status: existing.sent_status,
        }, 200);
      }

      // 2. Consulta a ordem
      const { data: order, error: oErr } = await adminClient
        .from("orders")
        .select("id, titulo, cliente, descricao, vendedor, criado_por, status")
        .eq("id", order_id)
        .maybeSingle();

      if (oErr || !order) {
        return jsonResponse({ error: oErr?.message || "O.S. não encontrada" }, 404);
      }

      // 3. Resolve e-mail do vendedor
      let sellerEmail: string | null = null;
      let sellerName: string = (order.vendedor || "").trim();

      if (sellerName) {
        const { data: prof } = await adminClient
          .from("profiles")
          .select("email, nome")
          .ilike("nome", sellerName)
          .not("email", "is", null)
          .limit(1)
          .maybeSingle();

        if (prof?.email) {
          sellerEmail = prof.email.trim().toLowerCase();
          sellerName = prof.nome || sellerName;
        }

        if (!sellerEmail) {
          const { data: vend } = await adminClient
            .from("vendedores")
            .select("email, nome")
            .ilike("nome", sellerName)
            .not("email", "is", null)
            .limit(1)
            .maybeSingle();

          if (vend?.email) {
            sellerEmail = vend.email.trim().toLowerCase();
            sellerName = vend.nome || sellerName;
          }
        }
      }

      if (!sellerEmail && order.criado_por) {
        const { data: creator } = await adminClient
          .from("profiles")
          .select("email, nome")
          .eq("user_id", order.criado_por)
          .not("email", "is", null)
          .limit(1)
          .maybeSingle();

        if (creator?.email) {
          sellerEmail = creator.email.trim().toLowerCase();
          sellerName = creator.nome || sellerName;
        }
      }

      const osTitle = (order.titulo || "").replace(/^[#\s]+/, "");
      const cliente = (order.cliente || "").trim() || "Cliente não informado";
      const subject = `🔔 [KABAN] O.S. #${osTitle} — ${cliente} está em Aguardando Aprovação`;
      const link = `https://primacorflow.vercel.app/?os=${encodeURIComponent(osTitle)}`;

      const html = `<div style="font-family: sans-serif; max-width: 600px; padding: 24px; background: #0c1821; color: #ccd0cf; border-radius: 16px;">
        <h2 style="color: #ffffff;">O.S. #${osTitle} — Aguardando Aprovação</h2>
        <p>Olá <strong>${sellerName || "Vendedor"}</strong>, a O.S. de <strong>${cliente}</strong> mudou para <strong>Aguardando Aprovação</strong>.</p>
        <p><a href="${link}" style="display: inline-block; background: #2563eb; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none;">Abrir Card no Kaban</a></p>
      </div>`;

      if (sellerEmail) {
        const { data: notif, error: nErr } = await adminClient
          .from("order_seller_notifications")
          .insert({
            order_id,
            os_number: osTitle,
            cliente,
            status: "aguardando_aprovacao",
            vendedor_nome: sellerName || null,
            vendedor_email: sellerEmail,
            subject,
            body_html: html,
            link_card: link,
            sent_status: "pending",
            attempts: 1,
            last_attempt_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        if (nErr) {
          return jsonResponse({ error: nErr.message }, 500);
        }

        return jsonResponse({
          success: true,
          notification_id: notif.id,
          seller_email: sellerEmail,
          status: "pending",
        }, 200);
      } else {
        const { data: notif } = await adminClient
          .from("order_seller_notifications")
          .insert({
            order_id,
            os_number: osTitle,
            cliente,
            status: "aguardando_aprovacao",
            vendedor_nome: sellerName || null,
            vendedor_email: "sem_email@primacorgrafica.com.br",
            subject,
            body_html: html,
            link_card: link,
            sent_status: "failed",
            error_message: `Vendedor "${sellerName || "Não especificado"}" não possui e-mail cadastrado.`,
            attempts: 1,
            last_attempt_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        return jsonResponse({
          success: false,
          notification_id: notif?.id,
          error: "Vendedor não possui e-mail cadastrado",
        }, 422);
      }
    }

    // Caso 3: Re-tentar notificação existente por notification_id
    if (notification_id) {
      const { data: notif, error: fetchErr } = await adminClient
        .from("order_seller_notifications")
        .select("*")
        .eq("id", notification_id)
        .maybeSingle();

      if (fetchErr || !notif) {
        return jsonResponse({ error: "Notificação não encontrada" }, 404);
      }

      await adminClient
        .from("order_seller_notifications")
        .update({
          sent_status: "pending",
          attempts: (notif.attempts || 0) + 1,
          last_attempt_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", notification_id);

      return jsonResponse({
        success: true,
        notification_id,
        status: "pending",
      }, 200);
    }

    return jsonResponse({ error: "Informe order_id, notification_id ou process_pending" }, 400);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
