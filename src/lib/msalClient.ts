import {
  PublicClientApplication,
  Configuration,
  BrowserCacheLocation,
  AccountInfo,
  InteractionRequiredAuthError,
  LogLevel,
} from "@azure/msal-browser";

export const AZURE_CLIENT_ID =
  import.meta.env.VITE_AZURE_CLIENT_ID || "bace3c78-42ed-4939-ae62-2c3403ad906b";

export const AZURE_TENANT_ID =
  import.meta.env.VITE_AZURE_TENANT_ID || "62946ce0-3dbb-47b0-9699-8190d4e679b8";

// Permissões delegadas registradas no Entra ID para o aplicativo "Kaban - Integração SharePoint"
export const SHAREPOINT_SCOPES = import.meta.env.VITE_SHAREPOINT_SCOPES
  ? import.meta.env.VITE_SHAREPOINT_SCOPES.split(",").map((s: string) => s.trim())
  : [
      "User.Read",
      "Sites.ReadWrite.All",
    ];

export const MSAL_ACCOUNT_KEY = "kaban_msal_active_account_id";
export const MSAL_USER_INFO_KEY = "kaban_msal_user_info";

export interface StoredMicrosoftUser {
  name: string;
  username: string;
  tenantId?: string;
}

/**
 * Retorna dados da conta Microsoft gravados no localStorage de forma síncrona
 * para renderização instantânea da interface sem esperar a inicialização do MSAL.
 */
export function getStoredMicrosoftUser(): StoredMicrosoftUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(MSAL_USER_INFO_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Grava a conta Microsoft ativa no localStorage para persistência permanente.
 */
export function saveStoredMicrosoftAccount(account: AccountInfo): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MSAL_ACCOUNT_KEY, account.homeAccountId);
    localStorage.setItem(
      MSAL_USER_INFO_KEY,
      JSON.stringify({
        name: account.name || account.username,
        username: account.username,
        tenantId: account.tenantId,
      })
    );
  } catch (err) {
    console.warn("[MSAL] Erro ao gravar conta no localStorage:", err);
  }
}

/**
 * Remove a conta salva do localStorage.
 */
export function removeStoredMicrosoftAccount(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(MSAL_ACCOUNT_KEY);
    localStorage.removeItem(MSAL_USER_INFO_KEY);
  } catch (err) {
    console.warn("[MSAL] Erro ao remover conta do localStorage:", err);
  }
}

// Sincroniza em tempo real contas autenticadas através de popups em outras janelas/abas
if (typeof window !== "undefined") {
  try {
    const bc = new BroadcastChannel("kaban_msal_channel");
    bc.onmessage = (event) => {
      if (event.data?.type === "MSAL_SUCCESS" && event.data?.account) {
        if (msalInstance) {
          msalInstance.setActiveAccount(event.data.account);
        }
        saveStoredMicrosoftAccount(event.data.account);
      }
    };
  } catch (_) {}
}

const msalConfig: Configuration = {
  auth: {
    clientId: AZURE_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${AZURE_TENANT_ID}`,
    redirectUri: typeof window !== "undefined" ? window.location.origin : "https://primacorflow.vercel.app/",
    navigateToLoginRequestUrl: false,
  },
  cache: {
    cacheLocation: BrowserCacheLocation.LocalStorage,
    storeAuthStateInCookie: true, // Mantém compatibilidade com navegadores restritivos e iframes
  },
  system: {
    allowNativeBroker: false,
    popupBridgeTimeout: 60000, // 60s para evitar qualquer erro de timed_out em redes móveis/lentas
    loggerOptions: {
      logLevel: LogLevel.Warning,
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        if (level === LogLevel.Error) {
          console.error("[MSAL]", message);
        } else if (level === LogLevel.Warning) {
          console.warn("[MSAL]", message);
        }
      },
    },
  },
};

let msalInstance: PublicClientApplication | null = null;
let initPromise: Promise<PublicClientApplication> | null = null;

/**
 * Retorna a instância inicializada do MSAL PublicClientApplication (Singleton).
 * Restaura automaticamente a conta ativa a partir do cache e localStorage.
 */
export async function getMsalInstance(): Promise<PublicClientApplication> {
  if (msalInstance) return msalInstance;

  if (!initPromise) {
    initPromise = (async () => {
      const pca = new PublicClientApplication(msalConfig);
      await pca.initialize();

      try {
        await pca.handleRedirectPromise();
      } catch (err) {
        console.warn("[MSAL] Erro ao tratar handleRedirectPromise:", err);
      }

      // Restaura a conta ativa salva no localStorage ou primeira conta do cache
      const savedAccountId = typeof window !== "undefined" ? localStorage.getItem(MSAL_ACCOUNT_KEY) : null;
      const allAccounts = pca.getAllAccounts();
      let active = pca.getActiveAccount();

      if (!active && savedAccountId) {
        active = allAccounts.find((a) => a.homeAccountId === savedAccountId) || null;
      }
      if (!active && allAccounts.length > 0) {
        active = allAccounts[0];
      }

      if (active) {
        pca.setActiveAccount(active);
        saveStoredMicrosoftAccount(active);
      }

      msalInstance = pca;
      return pca;
    })();
  }

  return initPromise;
}

/**
 * Retorna a conta Microsoft atualmente conectada no navegador.
 */
export async function getActiveMicrosoftAccount(): Promise<AccountInfo | null> {
  try {
    const pca = await getMsalInstance();
    let active = pca.getActiveAccount();
    if (active) {
      saveStoredMicrosoftAccount(active);
      return active;
    }

    const savedAccountId = typeof window !== "undefined" ? localStorage.getItem(MSAL_ACCOUNT_KEY) : null;
    const accounts = pca.getAllAccounts();

    if (savedAccountId) {
      const match = accounts.find((a) => a.homeAccountId === savedAccountId);
      if (match) {
        pca.setActiveAccount(match);
        saveStoredMicrosoftAccount(match);
        return match;
      }
    }

    if (accounts.length > 0) {
      pca.setActiveAccount(accounts[0]);
      saveStoredMicrosoftAccount(accounts[0]);
      return accounts[0];
    }

    return null;
  } catch (err) {
    console.error("[MSAL] Erro ao obter conta ativa:", err);
    return null;
  }
}

/**
 * Limpa travas e status residuais de interação pendente do MSAL sem apagar as credenciais da conta.
 */
export function clearMsalInteractions(): void {
  if (typeof window === "undefined") return;
  [window.sessionStorage, window.localStorage].forEach((storage) => {
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (
          key &&
          (key.toLowerCase().includes("interaction_status") ||
            key.toLowerCase().includes("interaction.status") ||
            key.toLowerCase().includes("request.origin"))
        ) {
          toRemove.push(key);
        }
      }
      toRemove.forEach((k) => storage.removeItem(k));
    } catch (_) {}
  });
}

let activeInteractiveTokenPromise: Promise<string> | null = null;
let activeLoginPromise: Promise<AccountInfo | null> | null = null;

/**
 * Obtém o access token delegado para o Microsoft Graph / SharePoint.
 * 1. Tenta silenciosamente via cache/refresh token (válido por 90 dias, renovado automaticamente).
 * 2. Se falhar, realiza fallback interativo via popup com SSO automático (sem forçar escolha de conta).
 */
export async function getSharePointAccessToken(interactiveFallback = true): Promise<string> {
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

  // 1. Tentativa Silenciosa (Silent Token Acquisition via Refresh Token)
  if (account) {
    try {
      const response = await pca.acquireTokenSilent({
        scopes: SHAREPOINT_SCOPES,
        account,
      });
      if (response?.accessToken) {
        return response.accessToken;
      }
    } catch (silentError) {
      if (!(silentError instanceof InteractionRequiredAuthError) && !interactiveFallback) {
        throw silentError;
      }
      console.info("[MSAL] acquireTokenSilent necessita de renovação interativa:", silentError);
    }
  }

  // 2. Interação via Popup com trava singleton e recuperação automática
  if (!interactiveFallback) {
    throw new Error("Sessão Microsoft não autenticada no navegador.");
  }

  if (activeInteractiveTokenPromise) {
    return activeInteractiveTokenPromise;
  }

  activeInteractiveTokenPromise = (async () => {
    try {
      try {
        // Sem prompt: "select_account" para aproveitar a sessão SSO já ativa do navegador
        const popupResponse = await pca.acquireTokenPopup({
          scopes: SHAREPOINT_SCOPES,
        });

        if (popupResponse?.account) {
          pca.setActiveAccount(popupResponse.account);
          saveStoredMicrosoftAccount(popupResponse.account);
        }
        return popupResponse.accessToken;
      } catch (popupError: any) {
        // Se houver colisão de interação residual travada no cache do navegador
        if (
          popupError?.errorCode === "interaction_in_progress" ||
          popupError?.message?.includes("interaction_in_progress")
        ) {
          console.warn("[MSAL] interaction_in_progress detectado. Limpando travas residuais e tentando novamente...");
          clearMsalInteractions();
          await new Promise((r) => setTimeout(r, 400));
          const retryResponse = await pca.acquireTokenPopup({
            scopes: SHAREPOINT_SCOPES,
          });
          if (retryResponse?.account) {
            pca.setActiveAccount(retryResponse.account);
            saveStoredMicrosoftAccount(retryResponse.account);
          }
          return retryResponse.accessToken;
        }

        if (popupError?.errorCode === "user_cancelled") {
          // Se a janela popup foi fechada mas já salvou a conta com sucesso
          const savedAcc = await getActiveMicrosoftAccount();
          if (savedAcc) {
            const silentToken = await pca.acquireTokenSilent({
              scopes: SHAREPOINT_SCOPES,
              account: savedAcc,
            }).catch(() => null);
            if (silentToken?.accessToken) {
              return silentToken.accessToken;
            }
          }
          throw new Error("Autenticação Microsoft cancelada pelo usuário.");
        }
        throw popupError;
      }
    } finally {
      activeInteractiveTokenPromise = null;
    }
  })();

  return activeInteractiveTokenPromise;
}

/**
 * Conecta explicitamente a conta corporativa Microsoft com SSO permanente.
 */
export async function loginMicrosoft(): Promise<AccountInfo | null> {
  const current = await getActiveMicrosoftAccount();
  if (current) return current;

  if (activeLoginPromise) {
    return activeLoginPromise;
  }

  activeLoginPromise = (async () => {
    try {
      const pca = await getMsalInstance();
      const currentActive = pca.getActiveAccount();
      if (currentActive) {
        saveStoredMicrosoftAccount(currentActive);
        return currentActive;
      }

      try {
        // Sem prompt: "select_account" para conectar direto via SSO da conta Microsoft 365
        const response = await pca.loginPopup({
          scopes: SHAREPOINT_SCOPES,
        });
        if (response?.account) {
          pca.setActiveAccount(response.account);
          saveStoredMicrosoftAccount(response.account);
          return response.account;
        }
        return null;
      } catch (loginErr: any) {
        // Se a janela popup foi fechada mas já salvou a conta com sucesso no localStorage
        const savedAcc = await getActiveMicrosoftAccount();
        if (savedAcc) {
          return savedAcc;
        }

        if (
          loginErr?.errorCode === "interaction_in_progress" ||
          loginErr?.message?.includes("interaction_in_progress")
        ) {
          console.warn("[MSAL] Limpando interação travada e tentando login novamente...");
          clearMsalInteractions();
          await new Promise((r) => setTimeout(r, 400));
          const retryRes = await pca.loginPopup({
            scopes: SHAREPOINT_SCOPES,
          });
          if (retryRes?.account) {
            pca.setActiveAccount(retryRes.account);
            saveStoredMicrosoftAccount(retryRes.account);
            return retryRes.account;
          }
        }
        if (loginErr?.errorCode === "user_cancelled") {
          return null;
        }
        throw loginErr;
      }
    } finally {
      activeLoginPromise = null;
    }
  })();

  return activeLoginPromise;
}

/**
 * Desconecta a conta Microsoft do navegador.
 */
export async function logoutMicrosoft(): Promise<void> {
  try {
    const pca = await getMsalInstance();
    const account = pca.getActiveAccount();
    removeStoredMicrosoftAccount();
    if (account) {
      await pca.logoutPopup({ account });
    }
    clearMsalInteractions();
  } catch (err) {
    console.warn("[MSAL] Erro ao deslogar da Microsoft:", err);
    removeStoredMicrosoftAccount();
    clearMsalInteractions();
  }
}
