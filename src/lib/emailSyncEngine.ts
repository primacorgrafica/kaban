/**
 * Motor de sincronização de e-mails do Outlook com as Ordens de Serviço do Kanban.
 *
 * Funcionalidades:
 * - Consulta as caixas monitoradas (inbox e sentitems) via Microsoft Graph API.
 * - Deduplica e-mails por message_id para não reinserir eventos já processados.
 * - Identifica o número da O.S. no assunto e no corpo via emailMatcher.
 * - Suporta rastreamento por thread (conversationId) para respostas sem número explícito.
 * - Insere os eventos na tabela order_email_events com suporte a Realtime.
 * - Registra aviso na central de notificações (avisos) para respostas recebidas.
 */

import { supabase } from "@/integrations/supabase/client";
import { fetchMailboxMessages, fetchConversationMessages } from "./outlookService";
import { findOsInEmail } from "./emailMatcher";
import { MONITORED_MAILBOXES, type MonitoredMailbox, type GraphMessage } from "@/types/email";

export const LAST_EMAIL_SYNC_KEY = "kaban_last_email_sync_timestamp";

export interface SyncResult {
  processed: number;
  newEvents: number;
  errors: string[];
  lastSyncAt: string;
}

/**
 * Executa uma rodada completa de sincronização de e-mails em todas as caixas monitoradas.
 */
export async function runEmailSync(): Promise<SyncResult> {
  const result: SyncResult = {
    processed: 0,
    newEvents: 0,
    errors: [],
    lastSyncAt: new Date().toISOString(),
  };

  // 1. Carrega todas as O.S. ativas para cruzamento rápido
  const { data: activeOrders, error: ordersError } = await supabase
    .from("orders")
    .select("id, titulo")
    .neq("status", "arquivado");

  if (ordersError || !activeOrders || activeOrders.length === 0) {
    if (ordersError) {
      result.errors.push(`Erro ao carregar ordens ativas: ${ordersError.message}`);
    }
    return result;
  }

  // Mapeamento: numero_os (titulo normalizado) -> order_id
  const osToOrderId = new Map<string, string>();
  const activeOsNumbers = new Set<string>();

  for (const ord of activeOrders) {
    if (ord.titulo) {
      const trimmed = ord.titulo.trim();
      osToOrderId.set(trimmed, ord.id);
      activeOsNumbers.add(trimmed);
    }
  }

  // 2. Carrega eventos já gravados para mapear conversation_ids e evitar duplicatas
  const { data: existingEvents, error: eventsError } = await supabase
    .from("order_email_events")
    .select("message_id, conversation_id, order_id, os_number");

  if (eventsError) {
    console.warn("[EmailSync] Aviso ao consultar eventos existentes:", eventsError.message);
  }

  const existingMessageIds = new Set<string>(
    (existingEvents || []).map((e) => e.message_id)
  );

  // Mapeamento: conversation_id -> { orderId, osNumber } para rastrear threads
  const conversationMap = new Map<string, { orderId: string; osNumber: string }>();
  for (const evt of existingEvents || []) {
    if (evt.conversation_id && !conversationMap.has(evt.conversation_id)) {
      conversationMap.set(evt.conversation_id, {
        orderId: evt.order_id,
        osNumber: evt.os_number,
      });
    }
  }

  // 3. Define janela temporal (desde a última sincronização ou últimas 48h)
  let since = typeof window !== "undefined" ? localStorage.getItem(LAST_EMAIL_SYNC_KEY) : null;
  if (!since) {
    // Primeira sincronização: busca últimas 48 horas
    since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  }

  // 4. Itera sobre cada caixa e pasta monitorada
  for (const mailbox of MONITORED_MAILBOXES) {
    const folders: Array<{ folder: "inbox" | "sentitems"; direction: "recebido" | "enviado" }> = [
      { folder: "sentitems", direction: "enviado" },
      { folder: "inbox", direction: "recebido" },
    ];

    for (const { folder, direction } of folders) {
      let messages: GraphMessage[] = [];
      try {
        messages = await fetchMailboxMessages(mailbox, folder, since);
      } catch (err: any) {
        console.warn(`[EmailSync] Erro ao buscar e-mails de ${mailbox}/${folder}:`, err.message);
        result.errors.push(`${mailbox}/${folder}: ${err.message}`);
        continue;
      }

      for (const msg of messages) {
        result.processed++;

        // Prevenção de duplicatas por message_id
        if (existingMessageIds.has(msg.id)) {
          continue;
        }

        // Tenta identificar O.S. no assunto e corpo
        let matchedOs: string | null = null;
        let matchedOrderId: string | null = null;

        const { osNumber } = findOsInEmail(
          msg.subject || "",
          msg.bodyPreview || "",
          activeOsNumbers
        );

        if (osNumber && osToOrderId.has(osNumber)) {
          matchedOs = osNumber;
          matchedOrderId = osToOrderId.get(osNumber)!;
        } else if (msg.conversationId && conversationMap.has(msg.conversationId)) {
          // Thread tracking: resposta sem número explícito, mas na mesma conversa
          const thread = conversationMap.get(msg.conversationId)!;
          matchedOs = thread.osNumber;
          matchedOrderId = thread.orderId;
        }

        // Se encontramos uma O.S. correspondente, grava o evento
        if (matchedOs && matchedOrderId) {
          const sender = msg.from?.emailAddress?.address || msg.from?.emailAddress?.name || mailbox;
          const recipients = (msg.toRecipients || [])
            .map((r) => r.emailAddress.address || r.emailAddress.name)
            .filter(Boolean)
            .join(", ") || mailbox;

          const emailDatetime =
            direction === "enviado"
              ? msg.sentDateTime || new Date().toISOString()
              : msg.receivedDateTime || new Date().toISOString();

          const newEventData = {
            order_id: matchedOrderId,
            direction,
            mailbox,
            message_id: msg.id,
            conversation_id: msg.conversationId || null,
            subject: msg.subject || "(Sem assunto)",
            sender,
            recipients,
            body_preview: msg.bodyPreview ? msg.bodyPreview.slice(0, 500) : null,
            email_datetime: emailDatetime,
            os_number: matchedOs,
          };

          const { error: insertError } = await supabase
            .from("order_email_events")
            .insert(newEventData);

          if (insertError) {
            console.warn(`[EmailSync] Erro ao inserir evento de e-mail ${msg.id}:`, insertError.message);
          } else {
            result.newEvents++;
            existingMessageIds.add(msg.id);

            // Atualiza conversationMap para respostas futuras na mesma conversa
            if (msg.conversationId) {
              conversationMap.set(msg.conversationId, {
                orderId: matchedOrderId,
                osNumber: matchedOs,
              });
            }

            // Para respostas recebidas do cliente, gera aviso na central de notificações
            if (direction === "recebido") {
              await supabase.from("avisos").insert({
                titulo: `📩 Resposta de e-mail na O.S. #${matchedOs}`,
                mensagem: `Cliente respondeu ao e-mail de ${mailbox}.\nRemetente: ${sender}\nAssunto: ${msg.subject || "(Sem assunto)"}`,
                tipo: "info",
                criado_por: "00000000-0000-0000-0000-000000000000",
              }).catch(() => null);
            }
          }
        }
      }
    }
  }

  // Atualiza timestamp da última sincronização bem-sucedida
  if (typeof window !== "undefined") {
    localStorage.setItem(LAST_EMAIL_SYNC_KEY, result.lastSyncAt);
  }

  return result;
}
