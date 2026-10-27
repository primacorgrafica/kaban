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

import { getMsalInstance, saveStoredMicrosoftAccount, clearMsalInteractions, MSAL_ACCOUNT_KEY, SHAREPOINT_SCOPES, getStoredMicrosoftUser } from "./msalClient";
import { InteractionRequiredAuthError } from "@azure/msal-browser";
import { MONITORED_MAILBOXES, type GraphMessage, type GraphMessagesResponse, type MonitoredMailbox } from "@/types/email";

/**
 * Retorna as caixas monitoradas combinadas com a conta Microsoft 365 atualmente autenticada.
 * Garante que e-mails enviados a partir da conta pessoal do operador (/me/sentitems)
 * sejam verificados em conjunto com a caixa compartilhada preimpressao@primacorgrafica.com.br.
 */
export async function getActiveMailboxAddresses(): Promise<string[]> {
  const mailboxes = new Set<string>();

  // 1. Sempre inclui a conta conectada atual (/me)
  mailboxes.add("me");

  // 2. Sempre inclui as caixas corporativas padrão
  for (const box of MONITORED_MAILBOXES) {
    if (box) mailboxes.add(box.toLowerCase().trim());
  }

  // 3. Inclui a conta do usuário se disponível no localStorage ou cache MSAL
  try {
    const stored = getStoredMicrosoftUser();
    if (stored?.username && stored.username.includes("@")) {
      mailboxes.add(stored.username.toLowerCase().trim());
    }
    const pca = await getMsalInstance();
    const account = pca.getActiveAccount() || pca.getAllAccounts()[0];
    if (account?.username && account.username.includes("@")) {
      mailboxes.add(account.username.toLowerCase().trim());
    }
  } catch {}

  return Array.from(mailboxes);
}

/**
 * Escopos necessários para ler e-mails de caixas compartilhadas.
 * Mail.Read.Shared permite ler e-mails de caixas delegadas sem permissão de aplicação.
 */
export const EMAIL_SCOPES = SHAREPOINT_SCOPES;

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

  // 3. Popup interativo com limpeza de travas e consentimento direto em janela única
  clearMsalInteractions();

  try {
    const authResult = await pca.loginPopup({
      scopes: EMAIL_SCOPES,
      loginHint: account?.username || undefined,
    });

    if (authResult?.account) {
      pca.setActiveAccount(authResult.account);
      saveStoredMicrosoftAccount(authResult.account);
      account = authResult.account;
    }

    if (authResult?.accessToken) {
      return authResult.accessToken;
    }

    // Se loginPopup completou o consentimento mas retornou idToken, obtém o token de acesso silenciosamente
    if (account) {
      const silentRes = await pca.acquireTokenSilent({
        scopes: EMAIL_SCOPES,
        account,
      });
      if (silentRes?.accessToken) {
        return silentRes.accessToken;
      }
    }

    throw new Error("Não foi possível obter o token de acesso após a autorização.");
  } catch (popupError: any) {
    if (popupError?.errorCode === "popup_window_error" || popupError?.message?.includes("popup")) {
      throw new Error(
        "O navegador bloqueou a janela pop-up do Microsoft 365. Por favor, permita pop-ups para este site na barra de endereços (ícone ao lado do cadeado) e tente novamente."
      );
    }

    if (popupError?.errorCode === "user_cancelled") {
      throw new Error("Autorização cancelada pelo usuário.");
    }

    if (
      popupError?.errorCode === "interaction_in_progress" ||
      popupError?.message?.includes("interaction_in_progress")
    ) {
      clearMsalInteractions();
      throw new Error("Uma janela de login do Microsoft 365 já estava aberta. Feche janelas anteriores e tente novamente.");
    }

    if (
      popupError?.message?.includes("AADSTS90094") ||
      popupError?.message?.includes("admin") ||
      popupError?.message?.includes("administrador") ||
      popupError?.errorCode === "admin_consent_required"
    ) {
      throw new Error(
        "Aprovação de Administrador necessária: O Microsoft 365 da organização exige aprovação do administrador para leitura de e-mails corporativos. Na tela da Microsoft, clique em 'Tem uma conta de administrador? Entre com essa conta'."
      );
    }

    throw popupError;
  }
}

/**
 * Lista mensagens recentes de uma pasta específica de uma caixa monitorada.
 *
 * @param mailbox Endereço de e-mail da caixa monitorada ou "me"
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

  const pca = await getMsalInstance();
  const account = pca.getActiveAccount();
  const storedUser = getStoredMicrosoftUser();
  const isMe = Boolean(
    mailbox === "me" ||
    (account?.username && account.username.toLowerCase() === mailbox.toLowerCase()) ||
    (storedUser?.username && storedUser.username.toLowerCase() === mailbox.toLowerCase())
  );

  const sinceDate = since || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const sinceEpoch = new Date(sinceDate).getTime();

  // Em 'sentitems', as mensagens são indexadas por sentDateTime (receivedDateTime pode ser nulo no Exchange)
  const dateProp = folder === "sentitems" ? "sentDateTime" : "receivedDateTime";
  const filterParam = `${dateProp} ge ${sinceDate}`;
  const selectParam = "id,subject,bodyPreview,body,from,toRecipients,sentDateTime,receivedDateTime,conversationId,internetMessageId,parentFolderId,isRead";
  const orderByParam = `${dateProp} desc`;

  // Usa /me quando for a conta conectada ou /users/{email} para caixas delegadas
  const baseUrl = isMe
    ? `https://graph.microsoft.com/v1.0/me/mailFolders/${folder}/messages`
    : `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/mailFolders/${folder}/messages`;

  const url = `${baseUrl}?$filter=${encodeURIComponent(filterParam)}&$select=${selectParam}&$orderby=${encodeURIComponent(orderByParam)}&$top=${top}`;

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    Prefer: 'outlook.body-content-type="text"',
  };

  // 1. Tenta consulta filtrada padrão
  let response = await fetch(url, { headers });

  // Se der erro 400 (Bad Request devido a incompatibilidade de filtro de data/index no Exchange) ou similar
  if (!response.ok && response.status !== 401 && response.status !== 403 && response.status !== 404) {
    // Tenta sem $filter e $orderby (recupera os top 50 mais recentes da pasta de forma direta e sem erro)
    const directUrl = `${baseUrl}?$select=${selectParam}&$top=${top}`;
    const retryRes = await fetch(directUrl, { headers });
    if (retryRes.ok) {
      response = retryRes;
    }
  }

  if (response.ok) {
    const data: GraphMessagesResponse = await response.json();
    const list = data.value || [];
    return list.filter((m) => {
      const msgTime = new Date(m.sentDateTime || m.receivedDateTime || 0).getTime();
      return !sinceEpoch || isNaN(sinceEpoch) || msgTime >= sinceEpoch;
    });
  }

  // Se retornou 404 (comum em caixas compartilhadas ou com pastas em português "Caixa de Entrada / Itens Enviados")
  if (response.status === 404) {
    console.info(`[OutlookService] Pasta padrão '${folder}' retornou 404 para ${mailbox}. Resolvendo pastas reais via Graph API...`);
    try {
      // 1. Tenta listar as pastas reais da caixa para encontrar o ID da pasta localizada (ex: "Caixa de Entrada", "Itens Enviados")
      const foldersUrl = isMe
        ? `https://graph.microsoft.com/v1.0/me/mailFolders?$top=50`
        : `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/mailFolders?$top=50`;
      const foldersRes = await fetch(foldersUrl, { headers });

      if (foldersRes.ok) {
        const foldersData = await foldersRes.json();
        const folderList: Array<{ id: string; displayName?: string; wellKnownName?: string }> = foldersData?.value || [];

        const targetFolder = folderList.find((f) => {
          if (f.wellKnownName?.toLowerCase() === folder.toLowerCase()) return true;
          const name = (f.displayName || "").toLowerCase();
          if (folder === "inbox") {
            return name === "inbox" || name.includes("entrada") || name.includes("caixa de entrada");
          } else {
            return name === "sentitems" || name.includes("enviad") || name.includes("itens enviados");
          }
        });

        if (targetFolder?.id) {
          console.info(`[OutlookService] Pasta '${targetFolder.displayName}' (${targetFolder.id}) identificada para ${mailbox}.`);
          const customFolderBase = isMe
            ? `https://graph.microsoft.com/v1.0/me/mailFolders/${encodeURIComponent(targetFolder.id)}/messages`
            : `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/mailFolders/${encodeURIComponent(targetFolder.id)}/messages`;
          const customFolderUrl = `${customFolderBase}?$select=${selectParam}&$top=${top}`;
          const customFolderRes = await fetch(customFolderUrl, { headers });
          if (customFolderRes.ok) {
            const data: GraphMessagesResponse = await customFolderRes.json();
            const list = data.value || [];
            return list.filter((m) => {
              const msgTime = new Date(m.sentDateTime || m.receivedDateTime || 0).getTime();
              return !sinceEpoch || isNaN(sinceEpoch) || msgTime >= sinceEpoch;
            });
          }
        }
      }

      // 2. Fallback direto: consulta coleção geral de mensagens de /messages sem depender de folder
      console.info(`[OutlookService] Fallback direto: consultando coleção de mensagens de ${mailbox}...`);
      const directMessagesUrl = isMe
        ? `https://graph.microsoft.com/v1.0/me/messages?$select=${selectParam}&$top=${top}`
        : `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages?$select=${selectParam}&$top=${top}`;
      const directRes = await fetch(directMessagesUrl, { headers });
      if (directRes.ok) {
        const data: GraphMessagesResponse = await directRes.json();
        const allMessages: GraphMessage[] = data.value || [];
        const userMail = (account?.username || storedUser?.username || mailbox || "").toLowerCase();
        
        return allMessages.filter((m) => {
          const msgTime = new Date(m.sentDateTime || m.receivedDateTime || 0).getTime();
          if (sinceEpoch && !isNaN(sinceEpoch) && msgTime < sinceEpoch) return false;
          
          const fromAddr = (m.from?.emailAddress?.address || "").toLowerCase();
          const isSenderInternal =
            fromAddr === userMail ||
            fromAddr.endsWith("@primacorgrafica.com.br") ||
            MONITORED_MAILBOXES.some((box) => box.toLowerCase() === fromAddr);

          if (folder === "sentitems") {
            return isSenderInternal;
          } else {
            return !isSenderInternal;
          }
        });
      }
    } catch (fallbackErr) {
      console.warn(`[OutlookService] Falha na resolução alternativa de pastas para ${mailbox}:`, fallbackErr);
    }
  }

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

/**
 * Busca mensagens de uma conversa específica em uma caixa monitorada.
 * Usado para rastrear threads e vincular respostas sem número de O.S. explícito.
 */
export async function fetchConversationMessages(
  mailbox: MonitoredMailbox,
  conversationId: string
): Promise<GraphMessage[]> {
  const token = await getEmailAccessToken(false);

  const pca = await getMsalInstance();
  const account = pca.getActiveAccount();
  const isMe = Boolean(account?.username && account.username.toLowerCase() === mailbox.toLowerCase());

  const filterParam = `conversationId eq '${conversationId}'`;
  const selectParam = "id,subject,bodyPreview,from,toRecipients,sentDateTime,receivedDateTime,conversationId";
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
