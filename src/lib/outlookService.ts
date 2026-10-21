/**
 * Serviço de acesso ao Microsoft Graph API para monitoramento de e-mails.
 *
 * Responsabilidades:
 * - Obter access token com escopos de e-mail (reutiliza msalClient.ts)
 * - Listar mensagens das caixas de Entrada e Itens Enviados
 * - Consultar mensagens por conversationId para rastrear threads
 *
 * IMPORTANTE: Não altera nenhuma funcionalidade do SharePoint.
 * Reutiliza a autenticação MSAL existente adicionando apenas Mail.Read.Shared.
 */

import { getMsalInstance, saveStoredMicrosoftAccount, clearMsalInteractions, MSAL_ACCOUNT_KEY } from "./msalClient";
import { InteractionRequiredAuthError } from "@azure/msal-browser";
import type { GraphMessage, GraphMessagesResponse, MonitoredMailbox } from "@/types/email";

/**
 * Escopos necessários para ler e-mails de caixas compartilhadas.
 * Mail.Read.Shared permite ler e-mails de caixas delegadas sem permissão de aplicação.
 */
export const EMAIL_SCOPES = ["User.Read", "Mail.Read", "Mail.Read.Shared"];

/**
 * Obtém um access token para os escopos de e-mail.
 * Tenta silenciosamente primeiro; se falhar, abre popup interativo.
 */
export async function getEmailAccessToken(interactiveFallback = true): Promise<string> {
  const pca = await getMsalInstance();
  let account = pca.getActiveAccount();

  if (!account) {
    const savedAccountId = typeof window !== "undefined" ? localStorage.getItem(MSAL_ACCOUNT_KEY) : null;
    const accounts = pca.getAllAccounts();
    if (savedAccountId) {
      account = accounts.find((a) => a.homeAccountId === savedAccountId) || null;
    }
    if (!account && accounts.length > 0) {
      account = accounts[0];
    }
    if (account) {
      pca.setActiveAccount(account);
      saveStoredMicrosoftAccount(account);
    }
  }

  // 1. Tentativa silenciosa
  if (account) {
    try {
      const response = await pca.acquireTokenSilent({
        scopes: EMAIL_SCOPES,
        account,
      });
      if (response?.accessToken) {
        return response.accessToken;
      }
    } catch (silentError) {
      if (!(silentError instanceof InteractionRequiredAuthError) && !interactiveFallback) {
        throw silentError;
      }
      console.info("[OutlookService] acquireTokenSilent para e-mails necessita renovação interativa:", silentError);
    }
  }

  // 2. Sem fallback interativo (modo background)
  if (!interactiveFallback) {
    throw new Error("Sessão Microsoft não autenticada para leitura de e-mails.");
  }

  // 3. Popup interativo
  try {
    const popupResponse = await pca.acquireTokenPopup({
      scopes: EMAIL_SCOPES,
      account: account || undefined,
      loginHint: account?.username,
    });
    if (popupResponse?.account) {
      pca.setActiveAccount(popupResponse.account);
      saveStoredMicrosoftAccount(popupResponse.account);
    }
    return popupResponse.accessToken;
  } catch (popupError: any) {
    if (
      popupError?.errorCode === "interaction_in_progress" ||
      popupError?.message?.includes("interaction_in_progress")
    ) {
      clearMsalInteractions();
      await new Promise((r) => setTimeout(r, 400));
      const retryResponse = await pca.acquireTokenPopup({
        scopes: EMAIL_SCOPES,
      });
      if (retryResponse?.account) {
        pca.setActiveAccount(retryResponse.account);
        saveStoredMicrosoftAccount(retryResponse.account);
      }
      return retryResponse.accessToken;
    }
    throw popupError;
  }
}

/**
 * Lista mensagens recentes de uma pasta específica de uma caixa monitorada.
 *
 * @param mailbox Endereço de e-mail da caixa monitorada
 * @param folder  Nome da pasta ("inbox" ou "sentitems")
 * @param since   Data mínima (ISO) para filtrar mensagens. Se omitido, busca últimas 24h.
 * @param top     Máximo de mensagens por página
 */
export async function fetchMailboxMessages(
  mailbox: MonitoredMailbox,
  folder: "inbox" | "sentitems",
  since?: string,
  top: number = 50
): Promise<GraphMessage[]> {
  const token = await getEmailAccessToken(false);

  const sinceDate = since || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Usa /users/{email}/mailFolders/{folder}/messages para acessar caixa delegada
  const filterParam = `receivedDateTime ge ${sinceDate}`;
  const selectParam = "id,subject,bodyPreview,from,toRecipients,sentDateTime,receivedDateTime,conversationId,internetMessageId,parentFolderId,isRead";
  const orderByParam = "receivedDateTime desc";

  const pca = await getMsalInstance();
  const account = pca.getActiveAccount();
  const isMe = Boolean(account?.username && account.username.toLowerCase() === mailbox.toLowerCase());

  const baseUrl = isMe
    ? `https://graph.microsoft.com/v1.0/me/mailFolders/${folder}/messages`
    : `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/mailFolders/${folder}/messages`;

  const url = `${baseUrl}?$filter=${encodeURIComponent(filterParam)}&$select=${selectParam}&$orderby=${encodeURIComponent(orderByParam)}&$top=${top}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      Prefer: 'outlook.body-content-type="text"',
    },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    if (response.status === 403 || response.status === 401) {
      throw new Error(
        `Permissão negada para ler e-mails de ${mailbox} (${response.status}). ` +
        `Verifique se a conta Microsoft tem acesso delegado (Full Access ou Read) à caixa "${mailbox}" ` +
        `e se o scope "Mail.Read.Shared" está consentido no Entra ID.`
      );
    }
    throw new Error(
      `Falha ao consultar e-mails de ${mailbox}/${folder} (${response.status}): ${errorBody?.error?.message || response.statusText}`
    );
  }

  const data: GraphMessagesResponse = await response.json();
  return data.value || [];
}

/**
 * Busca mensagens de uma conversa específica em uma caixa monitorada.
 * Usado para rastrear threads e vincular respostas sem número de O.S. explícito.
 */
export async function fetchConversationMessages(
  mailbox: MonitoredMailbox,
  conversationId: string
): Promise<GraphMessage[]> {
  const token = await getEmailAccessToken(false);

  const filterParam = `conversationId eq '${conversationId}'`;
  const selectParam = "id,subject,bodyPreview,from,toRecipients,sentDateTime,receivedDateTime,conversationId";
  const pca = await getMsalInstance();
  const account = pca.getActiveAccount();
  const isMe = Boolean(account?.username && account.username.toLowerCase() === mailbox.toLowerCase());

  const url = isMe
    ? `https://graph.microsoft.com/v1.0/me/messages?$filter=${encodeURIComponent(filterParam)}&$select=${selectParam}&$top=20&$orderby=${encodeURIComponent("receivedDateTime asc")}`
    : `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages?$filter=${encodeURIComponent(filterParam)}&$select=${selectParam}&$top=20&$orderby=${encodeURIComponent("receivedDateTime asc")}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    console.warn(`[OutlookService] Falha ao buscar conversa ${conversationId} em ${mailbox}:`, response.status);
    return [];
  }

  const data: GraphMessagesResponse = await response.json();
  return data.value || [];
}
