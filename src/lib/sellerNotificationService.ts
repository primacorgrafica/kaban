/**
 * Serviço de Notificação por E-mail para Vendedores vinculados a Ordens de Serviço (O.S.).
 *
 * Responsabilidades:
 * - Identificação automática e resolução do e-mail do vendedor vinculado ao card da O.S.
 * - Geração de mensagem com identificação da O.S., cliente, status e link direto.
 * - Prevenção estrita de notificações duplicadas na mesma mudança de status.
 * - Envio via integração existente com Microsoft 365 / Microsoft Graph API (Outlook).
 * - Registro de auditoria em `order_seller_notifications` com tratamento de falhas e retentativas.
 */

import { supabase } from "@/integrations/supabase/client";
import { getEmailAccessToken } from "./outlookService";
import { MONITORED_MAILBOXES } from "@/types/email";
import { getMsalInstance } from "./msalClient";

export interface SellerEmailResolution {
  email: string | null;
  name: string | null;
  source: "profiles" | "vendedores" | "creator" | "none";
}

export interface SellerNotificationRecord {
  id: string;
  order_id: string;
  os_number: string;
  cliente: string;
  status: string;
  vendedor_nome: string | null;
  vendedor_email: string;
  subject: string;
  body_html: string;
  link_card: string;
  sent_status: "pending" | "sent" | "failed";
  attempts: number;
  max_attempts: number;
  last_attempt_at: string | null;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
}

export interface TriggerNotificationResult {
  success: boolean;
  notificationId?: string;
  skippedDuplicate?: boolean;
  error?: string;
  sent?: boolean;
}

/** Validador padrão de formato de e-mail */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Normaliza e valida um endereço de e-mail.
 */
export function isValidEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return EMAIL_REGEX.test(email.trim().toLowerCase());
}

/**
 * Resolve o e-mail do vendedor a partir do nome ou identificador associado à O.S.
 */
export async function resolveSellerEmail(
  vendedor: string | null | undefined,
  criadoPorUserId?: string | null
): Promise<SellerEmailResolution> {
  const cleanVendedor = (vendedor || "").trim();

  // 1. Busca na tabela profiles por nome exato (case-insensitive)
  if (cleanVendedor) {
    try {
      const { data: profileExact } = await supabase
        .from("profiles")
        .select("nome, email, user_id" as any)
        .ilike("nome", cleanVendedor)
        .not("email", "is", null)
        .limit(1)
        .maybeSingle();

      if (profileExact?.email && isValidEmail(profileExact.email)) {
        return {
          email: profileExact.email.trim().toLowerCase(),
          name: profileExact.nome || cleanVendedor,
          source: "profiles",
        };
      }

      // Busca na tabela profiles por correspondência parcial (ex: "Carlos" para "Carlos Silva")
      const { data: profilePartial } = await supabase
        .from("profiles")
        .select("nome, email, user_id" as any)
        .ilike("nome", `${cleanVendedor}%`)
        .not("email", "is", null)
        .limit(1)
        .maybeSingle();

      if (profilePartial?.email && isValidEmail(profilePartial.email)) {
        return {
          email: profilePartial.email.trim().toLowerCase(),
          name: profilePartial.nome || cleanVendedor,
          source: "profiles",
        };
      }
    } catch {
      // Se a coluna email ainda não existir na tabela profiles, continua para outros métodos
    }

    // 2. Busca na tabela vendedores
    try {
      const { data: vendData } = await supabase
        .from("vendedores")
        .select("nome, email, user_id" as any)
        .ilike("nome", cleanVendedor)
        .not("email", "is", null)
        .limit(1)
        .maybeSingle();

      if (vendData?.email && isValidEmail(vendData.email)) {
        return {
          email: vendData.email.trim().toLowerCase(),
          name: vendData.nome || cleanVendedor,
          source: "vendedores",
        };
      }
    } catch {
      // continua
    }

    // 3. Busca por nome em profiles e resolve e-mail via list-users (auth.users)
    try {
      const { data: pByName } = await supabase
        .from("profiles")
        .select("user_id, nome" as any)
        .ilike("nome", cleanVendedor)
        .limit(1)
        .maybeSingle();

      if (pByName?.user_id) {
        const { data: uRes } = await supabase.functions.invoke("list-users");
        const found = uRes?.emails?.[pByName.user_id];
        if (found && isValidEmail(found)) {
          return {
            email: found.trim().toLowerCase(),
            name: pByName.nome || cleanVendedor,
            source: "auth_users",
          };
        }
      }
    } catch {
      // continua
    }
  }

  // 4. Fallback: criador da O.S. se for conhecido
  if (criadoPorUserId) {
    try {
      const { data: creatorProfile } = await supabase
        .from("profiles")
        .select("nome, email" as any)
        .eq("user_id", criadoPorUserId)
        .not("email", "is", null)
        .limit(1)
        .maybeSingle();

      if (creatorProfile?.email && isValidEmail(creatorProfile.email)) {
        return {
          email: creatorProfile.email.trim().toLowerCase(),
          name: creatorProfile.nome || cleanVendedor || "Criador da O.S.",
          source: "creator",
        };
      }
    } catch {
      // continua
    }
  }

  return {
    email: null,
    name: cleanVendedor || null,
    source: "none",
  };
}

/**
 * Monta o assunto, o link e o corpo HTML da notificação de mudança para Aguardando Aprovação.
 */
export function buildApprovalNotificationEmail(params: {
  osNumber: string;
  cliente: string;
  descricao?: string | null;
  vendedorNome?: string | null;
  baseUrl?: string;
}): { subject: string; html: string; link: string } {
  const origin =
    params.baseUrl ||
    (typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://primacorflow.vercel.app");

  const cleanOs = (params.osNumber || "").replace(/^[#\s]+/, "");
  const link = `${origin}/?os=${encodeURIComponent(cleanOs)}`;
  const cliente = params.cliente || "Cliente não informado";
  const seller = params.vendedorNome || "Vendedor";

  const subject = `🔔 [KABAN] O.S. #${cleanOs} — ${cliente} está em Aguardando Aprovação`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #06141b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #06141b; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 600px; background-color: #11212d; border: 1px solid #253745; border-radius: 20px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.45);">
          <!-- Top Accent Banner -->
          <tr>
            <td style="height: 4px; background: linear-gradient(90deg, #f97316 0%, #3b82f6 100%);"></td>
          </tr>
          <!-- Header -->
          <tr>
            <td style="padding: 28px 32px 20px 32px;">
              <table width="100%">
                <tr>
                  <td>
                    <span style="font-size: 11px; font-weight: 700; color: #9ba8ab; text-transform: uppercase; letter-spacing: 1.5px;">Primacor Gráfica • Sistema Kaban</span>
                    <h1 style="margin: 8px 0 0 0; font-size: 22px; color: #ffffff; font-weight: 800; letter-spacing: -0.5px;">O.S. Aguardando Aprovação</h1>
                  </td>
                  <td align="right" valign="top">
                    <span style="display: inline-block; background-color: rgba(249, 115, 22, 0.15); border: 1px solid rgba(249, 115, 22, 0.4); color: #f97316; font-size: 12px; font-weight: 700; padding: 4px 12px; border-radius: 9999px;">
                      Aprovação
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Intro Text -->
          <tr>
            <td style="padding: 0 32px 20px 32px; font-size: 14px; line-height: 1.6; color: #ccd0cf;">
              Olá <strong>${seller}</strong>, a Ordem de Serviço abaixo foi transferida para a coluna <strong>Aguardando Aprovação</strong>. Fique atento ao retorno do cliente para liberação do arquivo.
            </td>
          </tr>
          <!-- Order Card Details -->
          <tr>
            <td style="padding: 0 32px 28px 32px;">
              <table role="presentation" width="100%" style="background-color: #0c1821; border: 1px solid #1f3344; border-radius: 14px; padding: 18px 22px; border-collapse: separate;">
                <tr>
                  <td style="padding: 6px 0; color: #9ba8ab; font-size: 13px; width: 130px;">Número da O.S.:</td>
                  <td style="padding: 6px 0; color: #ffffff; font-weight: 700; font-size: 15px; font-family: ui-monospace, Menlo, Consolas, monospace;">#${cleanOs}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #9ba8ab; font-size: 13px;">Cliente:</td>
                  <td style="padding: 6px 0; color: #ffffff; font-weight: 700; font-size: 14px;">${cliente}</td>
                </tr>
                ${params.descricao ? `
                <tr>
                  <td style="padding: 6px 0; color: #9ba8ab; font-size: 13px;">Produto / Serviço:</td>
                  <td style="padding: 6px 0; color: #ccd0cf; font-size: 14px;">${params.descricao}</td>
                </tr>` : ""}
                <tr>
                  <td style="padding: 6px 0; color: #9ba8ab; font-size: 13px;">Vendedor:</td>
                  <td style="padding: 6px 0; color: #ccd0cf; font-size: 14px;">${seller}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #9ba8ab; font-size: 13px;">Status Atual:</td>
                  <td style="padding: 6px 0;">
                    <span style="color: #fb923c; font-weight: 700; font-size: 13px;">● Aguardando Aprovação</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- CTA Button -->
          <tr>
            <td align="center" style="padding: 0 32px 32px 32px;">
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="border-radius: 10px; background-color: #2563eb;">
                    <a href="${link}" target="_blank" style="display: inline-block; padding: 14px 32px; font-size: 14px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 10px; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);">
                      Abrir O.S. no Kaban
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #0c1821; border-top: 1px solid #1f3344; font-size: 12px; color: #9ba8ab; text-align: center; border-radius: 0 0 20px 20px;">
              Disparado automaticamente pelo fluxo de O.S. • Primacor Gráfica e Editora LTDA
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  return { subject, html, link };
}

/**
 * Envia e-mail utilizando a integração Microsoft Graph API (Microsoft 365 / Outlook).
 */
export async function sendEmailViaGraph(params: {
  to: string;
  subject: string;
  htmlContent: string;
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  try {
    const token = await getEmailAccessToken(false);

    const pca = await getMsalInstance();
    const activeAccount = pca.getActiveAccount();
    const senderMailbox = activeAccount?.username || MONITORED_MAILBOXES[0];

    const messagePayload = {
      message: {
        subject: params.subject,
        body: {
          contentType: "HTML",
          content: params.htmlContent,
        },
        toRecipients: [
          {
            emailAddress: {
              address: params.to.trim(),
            },
          },
        ],
      },
      saveToSentItems: "true",
    };

    // Tenta primeiro /me/sendMail se a conta ativa for um usuário direto
    const primaryUrl = "https://graph.microsoft.com/v1.0/me/sendMail";
    let res = await fetch(primaryUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messagePayload),
    });

    if (res.ok) {
      return { ok: true };
    }

    // Se /me retornar 403 ou 404 (comum em caixas compartilhadas), tenta via /users/{senderMailbox}/sendMail
    if (!res.ok && senderMailbox) {
      const fallbackUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderMailbox)}/sendMail`;
      const fallbackRes = await fetch(fallbackUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messagePayload),
      });

      if (fallbackRes.ok) {
        return { ok: true };
      }

      const errData = await fallbackRes.json().catch(() => ({}));
      return {
        ok: false,
        error: `Falha no envio via Graph API (${fallbackRes.status}): ${errData?.error?.message || fallbackRes.statusText}`,
      };
    }

    const primaryErr = await res.json().catch(() => ({}));
    return {
      ok: false,
      error: `Falha no envio via Graph API (${res.status}): ${primaryErr?.error?.message || res.statusText}`,
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || "Erro desconhecido ao enviar e-mail via Graph API",
    };
  }
}

/**
 * Dispara a notificação ao vendedor para uma O.S. que mudou para Aguardando Aprovação.
 * Garante idempotência, anti-duplicação e gravação do log em order_seller_notifications.
 */
export async function triggerSellerApprovalNotification(
  orderId: string,
  options?: { force?: boolean }
): Promise<TriggerNotificationResult> {
  try {
    // 1. Anti-duplicação: verifica se já existe notificação nas últimas 12 horas
    if (!options?.force) {
      const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
      const { data: existing } = await supabase
        .from("order_seller_notifications")
        .select("id, sent_status")
        .eq("order_id", orderId)
        .eq("status", "aguardando_aprovacao")
        .gte("created_at", twelveHoursAgo)
        .limit(1)
        .maybeSingle();

      if (existing) {
        console.info(`[SellerNotification] O.S. ${orderId} já possui notificação recente (${existing.id}, status: ${existing.sent_status}). Pulando.`);
        return {
          success: true,
          skippedDuplicate: true,
          notificationId: existing.id,
        };
      }
    }

    // 2. Carrega dados atualizados da O.S.
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, titulo, cliente, descricao, vendedor, criado_por, status")
      .eq("id", orderId)
      .maybeSingle();

    if (orderErr || !order) {
      return {
        success: false,
        error: orderErr?.message || "Ordem de Serviço não encontrada",
      };
    }

    // 3. Resolve e-mail do vendedor
    const sellerInfo = await resolveSellerEmail(order.vendedor, order.criado_por);
    const osTitle = (order.titulo || "").trim() || "Sem número";
    const cliente = (order.cliente || "").trim() || "Cliente não informado";

    const { subject, html, link } = buildApprovalNotificationEmail({
      osNumber: osTitle,
      cliente,
      descricao: order.descricao,
      vendedorNome: sellerInfo.name || order.vendedor,
    });

    // 4. Se vendedor não tiver e-mail cadastrado
    if (!sellerInfo.email || !isValidEmail(sellerInfo.email)) {
      const failReason = `Vendedor "${sellerInfo.name || order.vendedor || "Não informado"}" não possui e-mail cadastrado.`;

      const { data: inserted, error: insErr } = await supabase
        .from("order_seller_notifications")
        .insert({
          order_id: orderId,
          os_number: osTitle,
          cliente,
          status: "aguardando_aprovacao",
          vendedor_nome: sellerInfo.name || order.vendedor || null,
          vendedor_email: "sem_email@primacorgrafica.com.br",
          subject,
          body_html: html,
          link_card: link,
          sent_status: "failed",
          error_message: failReason,
          attempts: 1,
          last_attempt_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      return {
        success: false,
        notificationId: inserted?.id,
        error: failReason,
      };
    }

    // 5. Cria registro pendente
    const { data: notifRow, error: insertErr } = await supabase
      .from("order_seller_notifications")
      .insert({
        order_id: orderId,
        os_number: osTitle,
        cliente,
        status: "aguardando_aprovacao",
        vendedor_nome: sellerInfo.name || order.vendedor,
        vendedor_email: sellerInfo.email,
        subject,
        body_html: html,
        link_card: link,
        sent_status: "pending",
        attempts: 1,
        last_attempt_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertErr || !notifRow) {
      console.error("[SellerNotification] Falha ao registrar notificação:", insertErr);
      return {
        success: false,
        error: insertErr?.message || "Erro ao registrar notificação",
      };
    }

    const notificationId = notifRow.id;

    // 6. Tenta enviar o e-mail via Microsoft Graph
    const sendResult = await sendEmailViaGraph({
      to: sellerInfo.email,
      subject,
      htmlContent: html,
    });

    if (sendResult.ok) {
      await supabase
        .from("order_seller_notifications")
        .update({
          sent_status: "sent",
          sent_at: new Date().toISOString(),
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", notificationId);

      console.info(`[SellerNotification] E-mail enviado com sucesso para ${sellerInfo.email} (O.S. #${osTitle})`);
      return {
        success: true,
        sent: true,
        notificationId,
      };
    } else {
      await supabase
        .from("order_seller_notifications")
        .update({
          sent_status: "failed",
          error_message: sendResult.error || "Falha desconhecida no envio",
          updated_at: new Date().toISOString(),
        })
        .eq("id", notificationId);

      console.warn(`[SellerNotification] Falha ao enviar e-mail para ${sellerInfo.email}:`, sendResult.error);
      return {
        success: false,
        sent: false,
        notificationId,
        error: sendResult.error,
      };
    }
  } catch (err: any) {
    console.error("[SellerNotification] Exceção inesperada ao disparar notificação:", err);
    return {
      success: false,
      error: err?.message || "Exceção inesperada",
    };
  }
}

/**
 * Tenta reenviar uma notificação pendente ou falha.
 */
export async function retrySellerNotification(notificationId: string): Promise<boolean> {
  try {
    const { data: notif, error: fetchErr } = await supabase
      .from("order_seller_notifications")
      .select("*")
      .eq("id", notificationId)
      .maybeSingle();

    if (fetchErr || !notif) {
      throw new Error(fetchErr?.message || "Notificação não encontrada");
    }

    // Se o e-mail estava ausente, re-tenta resolver com dados atuais dos usuários
    let targetEmail = notif.vendedor_email;
    if (!targetEmail || targetEmail === "sem_email@primacorgrafica.com.br" || !isValidEmail(targetEmail)) {
      const reResolved = await resolveSellerEmail(notif.vendedor_nome);
      if (reResolved.email && isValidEmail(reResolved.email)) {
        targetEmail = reResolved.email;
        await supabase
          .from("order_seller_notifications")
          .update({ vendedor_email: targetEmail })
          .eq("id", notificationId);
      } else {
        throw new Error(`Vendedor "${notif.vendedor_nome}" ainda não possui e-mail válido cadastrado.`);
      }
    }

    const sendRes = await sendEmailViaGraph({
      to: targetEmail,
      subject: notif.subject,
      htmlContent: notif.body_html,
    });

    const nowIso = new Date().toISOString();
    if (sendRes.ok) {
      await supabase
        .from("order_seller_notifications")
        .update({
          sent_status: "sent",
          sent_at: nowIso,
          error_message: null,
          attempts: (notif.attempts || 0) + 1,
          last_attempt_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", notificationId);
      return true;
    } else {
      await supabase
        .from("order_seller_notifications")
        .update({
          sent_status: "failed",
          error_message: sendRes.error || "Falha na retentativa",
          attempts: (notif.attempts || 0) + 1,
          last_attempt_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", notificationId);
      return false;
    }
  } catch (err: any) {
    console.error("[SellerNotification] Erro ao retentar envio:", err);
    try {
      await supabase
        .from("order_seller_notifications")
        .update({
          error_message: err?.message || "Erro ao retentar",
          updated_at: new Date().toISOString(),
        })
        .eq("id", notificationId);
    } catch {
      // Ignora falha secundária de gravação
    }
    return false;
  }
}

/**
 * Processa lote de notificações pendentes (utilizado por background monitors e cron).
 */
export async function processPendingSellerNotifications(limit = 10): Promise<{ processed: number; success: number }> {
  const result = { processed: 0, success: 0 };
  try {
    const { data: pendings, error } = await supabase
      .from("order_seller_notifications")
      .select("id")
      .eq("sent_status", "pending")
      .lt("attempts", 3)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error || !pendings || pendings.length === 0) return result;

    for (const item of pendings) {
      result.processed++;
      const ok = await retrySellerNotification(item.id);
      if (ok) result.success++;
    }
  } catch (err) {
    console.warn("[SellerNotification] Aviso ao processar notificações pendentes:", err);
  }
  return result;
}
