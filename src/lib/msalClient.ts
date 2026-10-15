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
export const SHAREPOINT_SCOPES = [
  "User.Read",
  "Sites.Selected",
];

const msalConfig: Configuration = {
  auth: {
    clientId: AZURE_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${AZURE_TENANT_ID}`,
    redirectUri: typeof window !== "undefined" ? window.location.origin : "https://primacorflow.vercel.app/",
    navigateToLoginRequestUrl: false,
  },
  cache: {
    cacheLocation: BrowserCacheLocation.LocalStorage,
    storeAuthStateInCookie: false,
  },
  system: {
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
 * Retorna a instância inicializada do MSAL PublicClientApplication (Singleton)
 */
export async function getMsalInstance(): Promise<PublicClientApplication> {
  if (msalInstance) return msalInstance;

  if (!initPromise) {
    initPromise = (async () => {
      const pca = new PublicClientApplication(msalConfig);
      await pca.initialize();
      // Trata o retorno de redirect caso o fluxo tenha sido acionado via redirect
      try {
        await pca.handleRedirectPromise();
      } catch (err) {
        console.warn("[MSAL] Erro ao tratar handleRedirectPromise:", err);
      }

      // Se não há conta ativa setada, seleciona a primeira disponível no cache
      const activeAccount = pca.getActiveAccount();
      if (!activeAccount) {
        const allAccounts = pca.getAllAccounts();
        if (allAccounts.length > 0) {
          pca.setActiveAccount(allAccounts[0]);
        }
      }

      msalInstance = pca;
      return pca;
    })();
  }

  return initPromise;
}

/**
 * Retorna a conta Microsoft atualmente conectada no navegador
 */
export async function getActiveMicrosoftAccount(): Promise<AccountInfo | null> {
  try {
    const pca = await getMsalInstance();
    const active = pca.getActiveAccount();
    if (active) return active;
    const accounts = pca.getAllAccounts();
    if (accounts.length > 0) {
      pca.setActiveAccount(accounts[0]);
      return accounts[0];
    }
    return null;
  } catch (err) {
    console.error("[MSAL] Erro ao obter conta ativa:", err);
    return null;
  }
}

/**
 * Limpa travas e status residuais de interação pendente do MSAL
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
 * Tenta silenciosamente via cache/refresh token primeiro.
 * Se falhar por necessidade de consentimento/interação, abre popup de login com trava anti-colisão.
 */
export async function getSharePointAccessToken(interactiveFallback = true): Promise<string> {
  const pca = await getMsalInstance();
  let account = pca.getActiveAccount();

  if (!account) {
    const accounts = pca.getAllAccounts();
    if (accounts.length > 0) {
      account = accounts[0];
      pca.setActiveAccount(account);
    }
  }

  // 1. Tentativa Silenciosa (Silent Token Acquisition)
  if (account) {
    try {
      const response = await pca.acquireTokenSilent({
        scopes: SHAREPOINT_SCOPES,
        account,
      });
      return response.accessToken;
    } catch (silentError) {
      if (!(silentError instanceof InteractionRequiredAuthError) && !interactiveFallback) {
        throw silentError;
      }
      console.info("[MSAL] Silent token falhou, solicitando via popup interativo...");
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
        const popupResponse = await pca.acquireTokenPopup({
          scopes: SHAREPOINT_SCOPES,
          prompt: "select_account",
        });

        if (popupResponse?.account) {
          pca.setActiveAccount(popupResponse.account);
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
            prompt: "select_account",
          });
          if (retryResponse?.account) {
            pca.setActiveAccount(retryResponse.account);
          }
          return retryResponse.accessToken;
        }

        if (popupError?.errorCode === "user_cancelled") {
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
 * Conecta explicitamente a conta corporativa Microsoft com trava anti-colisão
 */
export async function loginMicrosoft(): Promise<AccountInfo | null> {
  if (activeLoginPromise) {
    return activeLoginPromise;
  }

  activeLoginPromise = (async () => {
    try {
      const pca = await getMsalInstance();
      const currentActive = pca.getActiveAccount();
      if (currentActive) return currentActive;

      try {
        const response = await pca.loginPopup({
          scopes: SHAREPOINT_SCOPES,
          prompt: "select_account",
        });
        if (response.account) {
          pca.setActiveAccount(response.account);
          return response.account;
        }
        return null;
      } catch (loginErr: any) {
        if (
          loginErr?.errorCode === "interaction_in_progress" ||
          loginErr?.message?.includes("interaction_in_progress")
        ) {
          console.warn("[MSAL] Limpando interação travada e tentando login novamente...");
          clearMsalInteractions();
          await new Promise((r) => setTimeout(r, 400));
          const retryRes = await pca.loginPopup({
            scopes: SHAREPOINT_SCOPES,
            prompt: "select_account",
          });
          if (retryRes.account) {
            pca.setActiveAccount(retryRes.account);
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
 * Desconecta a conta Microsoft do navegador
 */
export async function logoutMicrosoft(): Promise<void> {
  try {
    const pca = await getMsalInstance();
    const account = pca.getActiveAccount();
    if (account) {
      await pca.logoutPopup({ account });
    }
    clearMsalInteractions();
  } catch (err) {
    console.warn("[MSAL] Erro ao deslogar da Microsoft:", err);
    clearMsalInteractions();
  }
}

