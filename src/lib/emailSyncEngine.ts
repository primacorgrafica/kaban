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
import { fetchMailboxMessages, fetchConversationMessages, getActiveMailboxAddresses } from "./outlookService";
import { findOsInEmail, findOsInSubject } from "./emailMatcher";
import { MONITORED_MAILBOXES, type MonitoredMailbox, type GraphMessage } from "@/types/email";
import { trackGraphApiTelemetry } from "@/lib/autonomousEngine/telemetry";
import { triggerSellerApprovalNotification } from "./sellerNotificationService";

export const LAST_EMAIL_SYNC_KEY = "kaban_last_email_sync_timestamp";

/**
 * Detecta se uma mensagem é uma notificação interna gerada pelo próprio sistema Kaban/Primacor
 * (como a notificação de O.S. enviada ao vendedor), evitando que seja tratada como e-mail de cliente.
 */
export function isSystemNotificationEmail(subject: string, bodyPreview: string): boolean {
  const normSub = (subject || "").toLowerCase();
  const normBody = (bodyPreview || "").toLowerCase();

  if (
    normSub.includes("[kaban]") ||
    normSub.includes("notificação de ordem de serviço") ||
    normSub.includes("notificacao de ordem de servico")
  ) {
    return true;
  }
  if (
    normBody.includes("notificação de ordem de serviço") ||
    normBody.includes("notificacao de ordem de servico") ||
    normBody.includes("mudou para aguardando aprovação") ||
    normBody.includes("mudou para aguardando aprovacao") ||
    normBody.includes("acessar card no kaban")
  ) {
    return true;
  }
  return false;
}

export interface ReceivedEmailReply {
  osNumber: string;
  sender: string;
  subject: string;
  bodyPreview: string;
}

export interface SyncResult {
  processed: number;
  newEvents: number;
  errors: string[];
  lastSyncAt: string;
  newReceivedReplies: ReceivedEmailReply[];
}

/**
 * Executa uma rodada completa de sincronização de e-mails em todas as caixas monitoradas.
 */
export async function runEmailSync(): Promise<SyncResult> {
  const syncStartTime = performance.now();
  const result: SyncResult = {
    processed: 0,
    newEvents: 0,
    errors: [],
    lastSyncAt: new Date().toISOString(),
    newReceivedReplies: [],
  };

  const rollingCutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

  // 1. Define janela temporal de 48h para garantir que mensagens recentes (inclusive com divergência de fuso horário ou do início do expediente) sejam sempre inspecionadas
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  // 2. Carrega todos os dados iniciais em paralelo (ordens ativas, eventos recentes, avisos e sessão)
  const [authRes, ordersRes, eventsRes, avisosRes] = await Promise.all([
    supabase.auth.getUser().catch(() => ({ data: { user: null }, error: null })),
    supabase
      .from("orders")
      .select("id, titulo, criado_por, status, setor, setor_status")
      .neq("status", "arquivado"),
    supabase
      .from("order_email_events")
      .select("id, message_id, conversation_id, order_id, os_number, subject, body_preview, email_datetime, direction")
      .gte("email_datetime", rollingCutoff),
    supabase
      .from("avisos")
      .select("id, titulo, mensagem, created_at")
      .gte("created_at", since),
  ]);

  let currentUserId: string | null = (authRes as any)?.data?.user?.id || null;
  if (!currentUserId) {
    try {
      const { data: sessData } = await supabase.auth.getSession();
      currentUserId = sessData?.session?.user?.id || null;
    } catch {}
  }

  const activeOrders = ordersRes.data;
  const ordersError = ordersRes.error;

  if (ordersError || !activeOrders || activeOrders.length === 0) {
    if (ordersError) {
      result.errors.push(`Erro ao carregar ordens ativas: ${ordersError.message}`);
    }
    return result;
  }

  // Mapeamento: numero_os (titulo normalizado) -> order_id & autor & status
  const osToOrderId = new Map<string, string>();
  const orderAuthorMap = new Map<string, string>();
  const orderStatusMap = new Map<string, { status: string; setor: string | null; setor_status: string | null }>();
  const activeOsNumbers = new Set<string>();

  for (const ord of activeOrders) {
    if (ord.titulo) {
      const trimmed = ord.titulo.trim();
      const clean = trimmed.replace(/^[#\s]+/, "");
      osToOrderId.set(trimmed, ord.id);
      osToOrderId.set(clean, ord.id);
      activeOsNumbers.add(trimmed);
      activeOsNumbers.add(clean);

      // 1. Extrai todas as sequências numéricas de 4 a 6 dígitos do título (ex: "99999" de "O.S. 99999", "99999 - Cartucho", etc.)
      const rawNumbers = ord.titulo.match(/\b\d{4,6}\b/g) || [];
      for (const num of rawNumbers) {
        osToOrderId.set(num, ord.id);
        activeOsNumbers.add(num);
      }

      // 2. Extrai sequência contínua de dígitos (ex: "99999" de "99999/26", "99.999", "#99999")
      const onlyDigits = ord.titulo.replace(/\D/g, "");
      if (onlyDigits.length >= 4 && onlyDigits.length <= 6) {
        osToOrderId.set(onlyDigits, ord.id);
        activeOsNumbers.add(onlyDigits);
      } else if (onlyDigits.length > 6) {
        const first5 = onlyDigits.slice(0, 5);
        osToOrderId.set(first5, ord.id);
        activeOsNumbers.add(first5);
      }

      // 3. Normaliza prefixos comuns de O.S. (ex: "OS 99999" -> "99999")
      const strippedPrefix = trimmed.replace(/^(?:O\.?S\.?|OP|O\.?P\.?|ORDEM(?:\s+DE\s+SERVI[CÇ]O)?)\s*[#:-]?\s*/i, "").trim();
      if (strippedPrefix) {
        osToOrderId.set(strippedPrefix, ord.id);
        activeOsNumbers.add(strippedPrefix);
      }

      orderStatusMap.set(ord.id, {
        status: (ord as any).status || "fila_de_entrada",
        setor: (ord as any).setor || null,
        setor_status: (ord as any).setor_status || null,
      });

      if (ord.criado_por) {
        orderAuthorMap.set(ord.id, ord.criado_por);
      }
    }
  }

  const existingEvents = eventsRes.data;
  if (eventsRes.error) {
    console.warn("[EmailSync] Aviso ao consultar eventos existentes:", eventsRes.error.message);
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

  const existingAvisosList: Array<{ id?: string; titulo: string; mensagem: string }> = avisosRes.data || [];

  // Conjunto para evitar processamento duplicado durante a execução
  const processedEventKeys = new Set<string>();
  const notifiedOsNumbers = new Set<string>();

  // Auto-correção em paralelo: executada de forma concorrente sem bloquear as requisições de e-mail
  const maintenancePromise = Promise.allSettled([
    supabase
      .from("order_email_events")
      .update({ direction: "recebido" })
      .ilike("subject", "res:%")
      .eq("direction", "enviado")
      .not("sender", "ilike", "%@primacorgrafica.com.br")
      .then(() => null)
      .catch(() => null),
    supabase
      .from("order_email_events")
      .update({ direction: "recebido" })
      .ilike("subject", "re:%")
      .eq("direction", "enviado")
      .not("sender", "ilike", "%@primacorgrafica.com.br")
      .then(() => null)
      .catch(() => null),
    supabase
      .from("order_email_events")
      .update({ direction: "enviado" })
      .eq("direction", "recebido")
      .ilike("sender", "%@primacorgrafica.com.br")
      .then(() => null)
      .catch(() => null),
    supabase
      .from("avisos")
      .delete()
      .ilike("mensagem", "%Remetente: %primacorgrafica.com.br%")
      .ilike("mensagem", "%Notificação de Ordem de Serviço%")
      .then(() => null)
      .catch(() => null),
  ]);

  // 3. Busca em paralelo todas as pastas (sentitems e inbox) de todas as caixas monitoradas e da conta ativa
  const mailboxesToScan = await getActiveMailboxAddresses().catch(() => MONITORED_MAILBOXES);
  const folderTasks = mailboxesToScan.flatMap((mailbox) => [
    { mailbox: mailbox as MonitoredMailbox, folder: "sentitems" as const, direction: "enviado" as const },
    { mailbox: mailbox as MonitoredMailbox, folder: "inbox" as const, direction: "recebido" as const },
  ]);

  const fetchedFolders = await Promise.all(
    folderTasks.map(async (task) => {
      try {
        const messages = await fetchMailboxMessages(task.mailbox, task.folder, since);
        return { ...task, messages, error: null };
      } catch (err: any) {
        console.warn(`[EmailSync] Erro ao buscar e-mails de ${task.mailbox}/${task.folder}:`, err.message);
        result.errors.push(`${task.mailbox}/${task.folder}: ${err.message}`);
        return { ...task, messages: [] as GraphMessage[], error: err };
      }
    })
  );

  // 4. Itera sobre as mensagens retornadas em paralelo
  for (const { mailbox, folder, messages } of fetchedFolders) {
    for (const msg of messages) {
      result.processed++;

        const sender = msg.from?.emailAddress?.address || msg.from?.emailAddress?.name || mailbox;
        const senderEmail = (msg.from?.emailAddress?.address || "").toLowerCase().trim();
        const isSenderInternal =
          senderEmail === mailbox.toLowerCase() ||
          senderEmail.endsWith("@primacorgrafica.com.br") ||
          MONITORED_MAILBOXES.some((m) => m.toLowerCase() === senderEmail) ||
          mailboxesToScan.some((m) => m.toLowerCase() === senderEmail);

        const recipients = (msg.toRecipients || [])
          .map((r) => r.emailAddress.address || r.emailAddress.name)
          .filter(Boolean)
          .join(", ") || mailbox;

        // Conforme especificação:
        // Um e-mail só é considerado RECEBIDO quando:
        // 1. Está na Caixa de Entrada (folder === "inbox")
        // 2. O remetente NÃO é da própria gráfica (!isSenderInternal)
        const effectiveDirection: "enviado" | "recebido" =
          folder === "inbox" && !isSenderInternal ? "recebido" : "enviado";

        // Ignora notificações internas geradas automaticamente pelo sistema
        if (isSystemNotificationEmail(msg.subject || "", msg.bodyPreview || "")) {
          continue;
        }

        // Identificação da O.S.:
        // REGRA PRINCIPAL: Para respostas recebidas dos clientes, a identificação é feita
        // EXCLUSIVAMENTE pelo número da O.S. presente no assunto do e-mail (ex: "73210", "RE: 73210", "RES: O.S. 73210").
        // Para e-mails enviados ao cliente: busca no assunto e corpo.
        let matchedOs: string | null = null;
        let matchedOrderId: string | null = null;

        if (effectiveDirection === "recebido") {
          const { osNumber } = findOsInSubject(msg.subject || "", activeOsNumbers);
          if (osNumber && osToOrderId.has(osNumber)) {
            matchedOs = osNumber;
            matchedOrderId = osToOrderId.get(osNumber)!;
          }
        } else {
          const bodyToSearch = msg.body?.content || msg.bodyPreview || "";
          const { osNumber } = findOsInEmail(
            msg.subject || "",
            bodyToSearch,
            activeOsNumbers
          );
          if (osNumber && osToOrderId.has(osNumber)) {
            matchedOs = osNumber;
            matchedOrderId = osToOrderId.get(osNumber)!;
          }
        }

        if (!matchedOs || !matchedOrderId) {
          continue;
        }

        // Prevenção de duplicatas por message_id
        if (existingMessageIds.has(msg.id)) {
          // Se o e-mail está na pasta sentitems mas a ordem ainda não foi movida,
          // move para aguardando_aprovacao e dispara aviso ao vendedor
          if (effectiveDirection === "enviado") {
            const { error: moveErr } = await supabase
              .from("orders")
              .update({
                status: "aguardando_aprovacao",
                setor_status: "aguardando_aprovacao",
                updated_at: new Date().toISOString(),
              })
              .eq("id", matchedOrderId)
              .neq("status", "arquivo_liberado");

            if (!moveErr) {
              void triggerSellerApprovalNotification(matchedOrderId);
            }
          }
          continue;
        }

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
          if (effectiveDirection === "enviado") {
            await supabase
              .from("orders")
              .update({
                status: "aguardando_aprovacao",
                setor_status: "aguardando_aprovacao",
                updated_at: new Date().toISOString(),
              })
              .eq("id", matchedOrderId)
              .neq("status", "arquivo_liberado");
          }
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

          // Atualiza conversationMap para threads futuras
          if (msg.conversationId) {
            conversationMap.set(msg.conversationId, {
              orderId: matchedOrderId,
              osNumber: matchedOs,
            });
          }

          if (effectiveDirection === "enviado") {
            // 1. ENVIO DE E-MAIL AO CLIENTE:
            // Move automaticamente o CARD da respectiva O.S. para "AGUARDANDO APROVAÇÃO"
            const { error: moveError } = await supabase
              .from("orders")
              .update({
                status: "aguardando_aprovacao",
                setor_status: "aguardando_aprovacao",
                updated_at: new Date().toISOString(),
              })
              .eq("id", matchedOrderId)
              .neq("status", "arquivo_liberado");

            if (moveError) {
              console.warn(`[EmailSync] Erro ao mover O.S. #${matchedOs} para aguardando_aprovacao:`, moveError.message);
            } else {
              console.info(`[EmailSync] O.S. #${matchedOs} movida automaticamente para AGUARDANDO APROVAÇÃO`);
              // Dispara notificação por e-mail ao vendedor responsável
              await triggerSellerApprovalNotification(matchedOrderId);
            }
          } else {
            // 2. RESPOSTAS DOS CLIENTES:
            // Notificação SEMPRE de "RESPOSTA RECEBIDA", NUNCA de aprovação automática.
            // O CARD NÃO tem seu status alterado.
            const previewSnippet = msg.bodyPreview ? msg.bodyPreview.slice(0, 300) : "(Sem prévia)";

            const formattedDateTime = (() => {
              try {
                return new Date(emailDatetime).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                });
              } catch {
                return emailDatetime;
              }
            })();

            const avisoTitulo = `Nova resposta do cliente — O.S. ${matchedOs}`;
            const avisoMensagem = [
              `A O.S. ${matchedOs} recebeu uma resposta por e-mail. Acesse o CARD para consultar a mensagem.`,
              "",
              `Remetente: ${sender}`,
              `Data e Horário: ${formattedDateTime}`,
              `Assunto: ${msg.subject || "(Sem assunto)"}`,
              "",
              `Prévia da mensagem:`,
              `"${previewSnippet}"`,
            ].join("\n");

            // Deduplicação: evita gerar notificações duplicadas para a mesma mensagem
            const avisoKey = `${matchedOs}|${msg.id}|${timeMin}`;
            const alreadyNotified =
              notifiedOsNumbers.has(avisoKey) ||
              existingAvisosList.some(
                (a) => a.titulo.includes(`O.S. ${matchedOs}`) && a.mensagem.includes(formattedDateTime)
              );

            if (!alreadyNotified) {
              notifiedOsNumbers.add(avisoKey);
              existingAvisosList.push({ id: msg.id, titulo: avisoTitulo, mensagem: avisoMensagem });

              const authorId = currentUserId || orderAuthorMap.get(matchedOrderId) || "00000000-0000-0000-0000-000000000000";
              const { error: recAvisoErr } = await supabase.from("avisos").insert({
                titulo: avisoTitulo,
                mensagem: avisoMensagem,
                tipo: "info",
                destinatario_id: null,
                criado_por: authorId,
              });

              if (recAvisoErr) {
                console.warn(`[EmailSync] Erro ao gravar aviso de resposta para O.S. #${matchedOs}:`, recAvisoErr.message);
              } else {
                console.info(`[EmailSync] Aviso gravado no Supabase para O.S. #${matchedOs}`);
              }

              result.newReceivedReplies.push({
                osNumber: matchedOs,
                sender,
                subject: msg.subject || "(Sem assunto)",
                bodyPreview: previewSnippet,
              });
            }
          }
        }
    }
  }

  // Atualiza timestamp da última sincronização bem-sucedida
  if (typeof window !== "undefined") {
    localStorage.setItem(LAST_EMAIL_SYNC_KEY, result.lastSyncAt);
  }

  // Aguarda tarefas de manutenção se ainda em andamento
  await maintenancePromise.catch(() => null);

  // Telemetria autônoma da operação de sincronização do Outlook
  const syncDurationMs = performance.now() - syncStartTime;
  trackGraphApiTelemetry("EMAIL_SYNC", result.errors.length === 0, syncDurationMs, result.errors.join("; "));

  return result;
}
