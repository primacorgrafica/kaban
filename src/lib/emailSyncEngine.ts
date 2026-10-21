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
import { findOsInEmail, isApprovalResponse } from "./emailMatcher";
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
    newReceivedReplies: [],
  };

  // Obtém o ID do usuário autenticado no Supabase para satisfazer as políticas de RLS da tabela 'avisos'
  let currentUserId: string | null = null;
  try {
    const { data: authData } = await supabase.auth.getUser();
    currentUserId = authData?.user?.id || null;
    if (!currentUserId) {
      const { data: sessData } = await supabase.auth.getSession();
      currentUserId = sessData?.session?.user?.id || null;
    }
  } catch {}

  // 1. Carrega todas as O.S. ativas para cruzamento rápido
  const { data: activeOrders, error: ordersError } = await supabase
    .from("orders")
    .select("id, titulo, criado_por")
    .neq("status", "arquivado");

  if (ordersError || !activeOrders || activeOrders.length === 0) {
    if (ordersError) {
      result.errors.push(`Erro ao carregar ordens ativas: ${ordersError.message}`);
    }
    return result;
  }

  // Mapeamento: numero_os (titulo normalizado) -> order_id & autor
  const osToOrderId = new Map<string, string>();
  const orderAuthorMap = new Map<string, string>();
  const activeOsNumbers = new Set<string>();

  for (const ord of activeOrders) {
    if (ord.titulo) {
      const trimmed = ord.titulo.trim();
      const clean = trimmed.replace(/^[#\s]+/, "");
      osToOrderId.set(trimmed, ord.id);
      osToOrderId.set(clean, ord.id);
      if (ord.criado_por) {
        orderAuthorMap.set(ord.id, ord.criado_por);
      }
      activeOsNumbers.add(trimmed);
      activeOsNumbers.add(clean);
    }
  }

  // 2. Carrega eventos já gravados para mapear conversation_ids e evitar duplicatas
  const { data: existingEvents, error: eventsError } = await supabase
    .from("order_email_events")
    .select("id, message_id, conversation_id, order_id, os_number, subject, body_preview, email_datetime, direction");

  if (eventsError) {
    console.warn("[EmailSync] Aviso ao consultar eventos existentes:", eventsError.message);
  }

  const existingMessageIds = new Set<string>(
    (existingEvents || []).map((e) => e.message_id)
  );

  // Mapeamento: conversation_id -> { orderId, osNumber } para rastrear threads
  const conversationMap = new Map<string, { orderId: string; osNumber: string }>();
  // Fingerprints para deduplicação entre caixas monitoradas (preimpressao e embalagens)
  const existingFingerprints = new Set<string>();

  for (const evt of existingEvents || []) {
    if (evt.conversation_id && !conversationMap.has(evt.conversation_id)) {
      conversationMap.set(evt.conversation_id, {
        orderId: evt.order_id,
        osNumber: evt.os_number,
      });
    }

    const isReply = evt.direction === "recebido" || /^\s*(re|res|enc|fwd)\s*[:]/i.test(evt.subject || "");
    const normSub = (evt.subject || "").trim().toLowerCase().replace(/^(re|res|fwd|enc)\s*:\s*/i, "");
    const normBody = (evt.body_preview || "").trim().toLowerCase().slice(0, 50).replace(/\s+/g, " ");
    const timeMin = (evt.email_datetime || "").slice(0, 16);
    existingFingerprints.add(`${evt.order_id}|${isReply ? "resp" : "env"}|${normSub}|${normBody}|${timeMin}`);
  }

  // 3. Define janela temporal: busca as últimas 24h
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Carrega avisos recentes para evitar duplicar avisos na mesma O.S.
  const { data: recentAvisosData } = await supabase
    .from("avisos")
    .select("titulo")
    .gte("created_at", since);
  const existingAvisoTitles = new Set<string>((recentAvisosData || []).map((a) => a.titulo));

  // Conjunto para evitar processamento duplicado durante a execução
  const processedEventKeys = new Set<string>();
  const notifiedOsNumbers = new Set<string>();

  // Auto-correção: mensagens de resposta com prefixo RES: ou RE: devem ter direction: 'recebido'
  await supabase
    .from("order_email_events")
    .update({ direction: "recebido" })
    .ilike("subject", "res:%")
    .eq("direction", "enviado")
    .then(() => null)
    .catch(() => null);

  await supabase
    .from("order_email_events")
    .update({ direction: "recebido" })
    .ilike("subject", "re:%")
    .eq("direction", "enviado")
    .then(() => null)
    .catch(() => null);

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

          // Detecção de resposta: se o assunto começa com RES: ou RE:, ou se contém expressões de aprovação, é RESPOSTA (recebido)!
          const isReplyOrApproval =
            /^\s*(re|res|enc|fwd)\s*[:]/i.test(msg.subject || "") ||
            isApprovalResponse(msg.subject || "") ||
            isApprovalResponse(msg.bodyPreview || "");

          // Se está na Caixa de Entrada (inbox) OU é uma resposta/aprovação, foi RECEBIDO!
          // Somente mensagens iniciadas em sentitems sem prefixo de resposta são 'enviado'.
          const effectiveDirection: "enviado" | "recebido" =
            isReplyOrApproval || folder === "inbox" ? "recebido" : "enviado";

          const emailDatetime =
            effectiveDirection === "enviado"
              ? msg.sentDateTime || new Date().toISOString()
              : msg.receivedDateTime || new Date().toISOString();

          // Deduplicação cruzada robusta entre caixas (evita duplicar evento se a mesma mensagem foi sincronizada por preimpressao e embalagens)
          const normSub = (msg.subject || "").trim().toLowerCase().replace(/^(re|res|fwd|enc)\s*:\s*/i, "");
          const normBody = (msg.bodyPreview || "").trim().toLowerCase().slice(0, 50).replace(/\s+/g, " ");
          const timeMin = (emailDatetime || "").slice(0, 16);
          const eventFingerprint = `${matchedOrderId}|${effectiveDirection === "recebido" ? "resp" : "env"}|${normSub}|${normBody}|${timeMin}`;

          if (existingFingerprints.has(eventFingerprint) || processedEventKeys.has(eventFingerprint)) {
            // Se já foi registrado na outra caixa, ignora a duplicata
            continue;
          }
          processedEventKeys.add(eventFingerprint);
          existingFingerprints.add(eventFingerprint);

          const newEventData = {
            order_id: matchedOrderId,
            direction: effectiveDirection,
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

            if (effectiveDirection === "enviado") {
              // 1. Move automaticamente o CARD para a coluna "AGUARDANDO APROVAÇÃO"
              // Conforme solicitado: ao enviar e-mail, NÃO gera aviso/notificação algum, apenas move o card!
              const { error: moveError } = await supabase
                .from("orders")
                .update({
                  status: "aguardando_aprovacao",
                  updated_at: new Date().toISOString(),
                })
                .eq("id", matchedOrderId)
                .neq("status", "arquivo_liberado");

              if (moveError) {
                console.warn(`[EmailSync] Erro ao mover O.S. #${matchedOs} para aguardando_aprovacao:`, moveError.message);
              } else {
                console.info(`[EmailSync] O.S. #${matchedOs} movida automaticamente para AGUARDANDO APROVAÇÃO (sem aviso)`);
              }
            } else {
              // 2. Resposta de e-mail recebida do cliente
              // Conforme especificação: NÃO move o card para Saída, apenas gera o aviso com a mensagem do cliente!
              const isApproval =
                isApprovalResponse(msg.subject || "") ||
                isApprovalResponse(msg.bodyPreview || "");

              const previewSnippet = msg.bodyPreview ? msg.bodyPreview.slice(0, 300) : "(Sem prévia)";

              const avisoTitulo = isApproval
                ? `📩 E-mail Respondido (Aprovação) - O.S. #${matchedOs}`
                : `📩 E-mail Respondido pelo Cliente - O.S. #${matchedOs}`;

              const avisoMensagem = isApproval
                ? `O cliente respondeu ao e-mail da O.S. #${matchedOs} com confirmação/aprovação!\n\nRemetente: ${sender}\nAssunto: ${msg.subject || "(Sem assunto)"}\n\nMensagem do Cliente:\n"${previewSnippet}"`
                : `O cliente respondeu ao e-mail referente à O.S. #${matchedOs}.\n\nRemetente: ${sender}\nAssunto: ${msg.subject || "(Sem assunto)"}\n\nMensagem do Cliente:\n"${previewSnippet}"`;

              // Verifica se já não foi notificado nesta rodada ou se já existe aviso com esse número de O.S.
              const alreadyHasAviso =
                notifiedOsNumbers.has(matchedOs) ||
                Array.from(existingAvisoTitles).some((t) => t.includes(`O.S. #${matchedOs}`));

              if (!alreadyHasAviso) {
                notifiedOsNumbers.add(matchedOs);
                existingAvisoTitles.add(avisoTitulo);

                const authorId = currentUserId || orderAuthorMap.get(matchedOrderId) || "00000000-0000-0000-0000-000000000000";
                const { error: recAvisoErr } = await supabase.from("avisos").insert({
                  titulo: avisoTitulo,
                  mensagem: avisoMensagem,
                  tipo: isApproval ? "urgente" : "info",
                  criado_por: authorId,
                });

                if (recAvisoErr) {
                  console.warn(`[EmailSync] Erro ao gravar aviso de resposta para O.S. #${matchedOs}:`, recAvisoErr.message);
                } else {
                  console.info(`[EmailSync] Aviso gravado no Supabase para O.S. #${matchedOs}`);
                }

                // Adiciona ao resultado para disparo imediato de toast/notificação (apenas 1 por O.S.)
                result.newReceivedReplies.push({
                  osNumber: matchedOs,
                  sender,
                  subject: msg.subject || "(Sem assunto)",
                  bodyPreview: previewSnippet,
                  isApproval,
                });
              }
            }
          }
        }
      }
    }
  }

  // 5. Verificação retroativa de avisos para respostas recebidas nas últimas 24h
  // Garante que mesmo e-mails já gravados em 'order_email_events' em sincronização anterior tenham seus devidos avisos emitidos
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentReceivedEvents } = await supabase
      .from("order_email_events")
      .select("id, os_number, sender, subject, body_preview, created_at, order_id")
      .eq("direction", "recebido")
      .gte("created_at", twentyFourHoursAgo);

    if (recentReceivedEvents && recentReceivedEvents.length > 0) {
      for (const revt of recentReceivedEvents) {
        if (!revt.os_number) continue;

        // Se já foi notificado nesta rodada ou se já existe aviso para esta O.S., NÃO duplica
        const alreadyHasAviso =
          notifiedOsNumbers.has(revt.os_number) ||
          Array.from(existingAvisoTitles).some((t) => t.includes(`O.S. #${revt.os_number}`));

        if (alreadyHasAviso) {
          continue;
        }

        notifiedOsNumbers.add(revt.os_number);

        const isApproval =
          isApprovalResponse(revt.subject || "") ||
          isApprovalResponse(revt.body_preview || "");

        const previewSnippet = revt.body_preview ? revt.body_preview.slice(0, 300) : "(Sem prévia)";

        const avisoTitulo = isApproval
          ? `📩 E-mail Respondido (Aprovação) - O.S. #${revt.os_number}`
          : `📩 E-mail Respondido pelo Cliente - O.S. #${revt.os_number}`;

        existingAvisoTitles.add(avisoTitulo);

        const authorId = currentUserId || orderAuthorMap.get(revt.order_id) || "00000000-0000-0000-0000-000000000000";
        const avisoMensagem = isApproval
          ? `O cliente respondeu ao e-mail da O.S. #${revt.os_number} com confirmação/aprovação!\n\nRemetente: ${revt.sender}\nAssunto: ${revt.subject || "(Sem assunto)"}\n\nMensagem do Cliente:\n"${previewSnippet}"`
          : `O cliente respondeu ao e-mail referente à O.S. #${revt.os_number}.\n\nRemetente: ${revt.sender}\nAssunto: ${revt.subject || "(Sem assunto)"}\n\nMensagem do Cliente:\n"${previewSnippet}"`;

        const { error: insErr } = await supabase.from("avisos").insert({
          titulo: avisoTitulo,
          mensagem: avisoMensagem,
          tipo: isApproval ? "urgente" : "info",
          criado_por: authorId,
        });

        if (!insErr) {
          result.newReceivedReplies.push({
            osNumber: revt.os_number,
            sender: revt.sender,
            subject: revt.subject || "(Sem assunto)",
            bodyPreview: previewSnippet,
            isApproval,
          });
          console.info(`[EmailSync] Aviso retroativo gerado com sucesso para O.S. #${revt.os_number}`);
        } else {
          console.warn(`[EmailSync] Erro ao gravar aviso retroativo para O.S. #${revt.os_number}:`, insErr.message);
        }
      }
    }
  } catch (recovErr) {
    console.warn("[EmailSync] Erro na verificação retroativa de avisos:", recovErr);
  }

  // Atualiza timestamp da última sincronização bem-sucedida
  if (typeof window !== "undefined") {
    localStorage.setItem(LAST_EMAIL_SYNC_KEY, result.lastSyncAt);
  }

  return result;
}
