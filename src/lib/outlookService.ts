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

import { getMsalInstance, saveStoredMicrosoftAccount, clearMsalInteractions, MSAL_ACCOUNT_KEY, SHAREPOINT_SCOPES } from "./msalClient";
import { InteractionRequiredAuthError } from "@azure/msal-browser";
import type { GraphMessage, GraphMessagesResponse, MonitoredMailbox } from "@/types/email";

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

  // Consulta via /users/{mailbox}/mailFolders/{folder}/messages compatível com a permissão Mail.Read.Shared
  const baseUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/mailFolders/${folder}/messages`;

  const url = `${baseUrl}?$filter=${encodeURIComponent(filterParam)}&$select=${selectParam}&$orderby=${encodeURIComponent(orderByParam)}&$top=${top}`;

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    Prefer: 'outlook.body-content-type="text"',
  };

  const response = await fetch(url, { headers });

  if (response.ok) {
    const data: GraphMessagesResponse = await response.json();
    return data.value || [];
  }

  // Se retornou 404 (comum em caixas compartilhadas ou com pastas em português "Caixa de Entrada / Itens Enviados")
  if (response.status === 404 && !isMe) {
    console.info(`[OutlookService] Pasta padrão '${folder}' retornou 404 para ${mailbox}. Resolvendo pastas reais via Graph API...`);
    try {
      // 1. Tenta listar as pastas reais da caixa para encontrar o ID da pasta localizada (ex: "Caixa de Entrada", "Itens Enviados")
      const foldersUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/mailFolders?$top=50`;
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
          const customFolderUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/mailFolders/${encodeURIComponent(targetFolder.id)}/messages?$filter=${encodeURIComponent(filterParam)}&$select=${selectParam}&$orderby=${encodeURIComponent(orderByParam)}&$top=${top}`;
          const customFolderRes = await fetch(customFolderUrl, { headers });
          if (customFolderRes.ok) {
            const data: GraphMessagesResponse = await customFolderRes.json();
            return data.value || [];
          }
        }
      }

      // 2. Fallback direto: consulta coleção geral de mensagens de /users/{mailbox}/messages sem depender de folder
      console.info(`[OutlookService] Fallback direto: consultando mensagens de /users/${mailbox}/messages...`);
      const directMessagesUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages?$filter=${encodeURIComponent(filterParam)}&$select=${selectParam}&$orderby=${encodeURIComponent(orderByParam)}&$top=${top}`;
      const directRes = await fetch(directMessagesUrl, { headers });
      if (directRes.ok) {
        const data: GraphMessagesResponse = await directRes.json();
        const allMessages: GraphMessage[] = data.value || [];
        if (folder === "sentitems") {
          return allMessages.filter((m) => m.from?.emailAddress?.address?.toLowerCase() === mailbox.toLowerCase());
        } else {
          return allMessages.filter((m) => m.from?.emailAddress?.address?.toLowerCase() !== mailbox.toLowerCase());
        }
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

  const filterParam = `conversationId eq '${conversationId}'`;
  const selectParam = "id,subject,bodyPreview,from,toRecipients,sentDateTime,receivedDateTime,conversationId";
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages?$filter=${encodeURIComponent(filterParam)}&$select=${selectParam}&$top=20&$orderby=${encodeURIComponent("receivedDateTime asc")}`;

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
