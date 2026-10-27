import { useState, useEffect, useCallback, useRef } from "react";
import { runEmailSync, type SyncResult, LAST_EMAIL_SYNC_KEY } from "@/lib/emailSyncEngine";
import { getStoredMicrosoftUser, getActiveMicrosoftAccount } from "@/lib/msalClient";
import { getEmailAccessToken } from "@/lib/outlookService";
import { processPendingSellerNotifications } from "@/lib/sellerNotificationService";
import { toast } from "sonner";

export interface SyncOptions {
  interactive?: boolean;
  force?: boolean;
  notifyOnSuccess?: boolean;
}

export interface UseEmailMonitorReturn {
  isSyncing: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  processedCount: number;
  newEventsCount: number;
  syncNow: (options?: boolean | SyncOptions) => Promise<void>;
  connectOutlook: () => Promise<void>;
  hasMicrosoftAccount: boolean;
}

const ACTIVE_POLL_INTERVAL_MS = 25 * 1000; // 25 segundos enquanto o operador estiver ativo na aba
const BACKGROUND_POLL_INTERVAL_MS = 60 * 1000; // 60 segundos com a aba em segundo plano
const MIN_AUTO_SYNC_INTERVAL_MS = 10 * 1000; // 10 segundos de intervalo mínimo entre syncs automáticos para evitar chamadas redundantes

// Chime sintetizado via Web Audio API para notificação de e-mail respondido
function playEmailChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === "suspended") { void ctx.resume(); }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    // Tom de e-mail agradável e nítido: C5 -> G5 (523.25Hz -> 783.99Hz)
    osc.frequency.setValueAtTime(523.25, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch {
    // silencioso caso o navegador bloqueie áudio
  }
}

/**
 * Hook para monitoramento contínuo em segundo plano das caixas de e-mail corporativas.
 */
export function useEmailMonitor(enabled = true): UseEmailMonitorReturn {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(() => {
    return typeof window !== "undefined" ? localStorage.getItem(LAST_EMAIL_SYNC_KEY) : null;
  });
  const [lastError, setLastError] = useState<string | null>(null);
  const [processedCount, setProcessedCount] = useState(0);
  const [newEventsCount, setNewEventsCount] = useState(0);
  const [hasMicrosoftAccount, setHasMicrosoftAccount] = useState(() => !!getStoredMicrosoftUser());
  const isSyncingRef = useRef(false);
  const lastSyncTimestampRef = useRef<number>(Date.now());

  // Verifica conta Microsoft
  useEffect(() => {
    void getActiveMicrosoftAccount().then((acc) => {
      setHasMicrosoftAccount(!!acc);
    });

    const handleStorage = (e: StorageEvent) => {
      if (e.key === "kaban_msal_user_info") {
        setHasMicrosoftAccount(!!getStoredMicrosoftUser());
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const syncNow = useCallback(
    async (
      optionsOrInteractive: boolean | SyncOptions = false
    ) => {
      const opts: SyncOptions =
        typeof optionsOrInteractive === "boolean"
          ? { interactive: optionsOrInteractive, force: false, notifyOnSuccess: false }
          : { interactive: false, force: false, notifyOnSuccess: false, ...optionsOrInteractive };

      const { interactive = false, force = false, notifyOnSuccess = false } = opts;

      const now = Date.now();
      if (isSyncingRef.current) return;

      // Throttle inteligente: evita syncs automáticos repetidos em intervalos menores que MIN_AUTO_SYNC_INTERVAL_MS
      if (!force && now - lastSyncTimestampRef.current < MIN_AUTO_SYNC_INTERVAL_MS) {
        return;
      }

      isSyncingRef.current = true;
      setIsSyncing(true);
      setLastError(null);

      if (notifyOnSuccess) {
        toast.info("Verificando mensagens no Outlook...", { id: "email-sync-status", duration: 2000 });
      }

      try {
        if (interactive) {
          await getEmailAccessToken(true);
        }
        const result: SyncResult = await runEmailSync();
        lastSyncTimestampRef.current = Date.now();

        setProcessedCount((prev) => prev + result.processed);
        setNewEventsCount((prev) => prev + result.newEvents);
        setLastSyncAt(result.lastSyncAt);

        // Processa eventuais notificações de vendedores pendentes
        void processPendingSellerNotifications().catch((e) => {
          console.warn("[useEmailMonitor] Aviso ao processar notificações pendentes:", e);
        });

        if (result.errors.length > 0) {
          setLastError(result.errors.join("; "));
          if (notifyOnSuccess) {
            toast.warning(`Sincronização concluída com avisos: ${result.errors[0]}`, { id: "email-sync-status", duration: 5000 });
          }
        } else if (notifyOnSuccess) {
          if (result.newEvents > 0) {
            toast.success(`${result.newEvents} novos eventos de e-mail sincronizados com o Kaban!`, { id: "email-sync-status", duration: 4000 });
          } else {
            toast.success("E-mails sincronizados com sucesso!", { id: "email-sync-status", duration: 2500 });
          }
        }

        if (result.newReceivedReplies && result.newReceivedReplies.length > 0) {
          playEmailChime();
          // Atualiza imediatamente o gerenciador de e-mails não lidos
          void import("@/lib/unreadEmailsManager").then(({ unreadEmailsManager }) => {
            void unreadEmailsManager.fetchRecentReceivedEvents();
          });
        }
      } catch (err: any) {
        console.warn("[useEmailMonitor] Falha no ciclo de sincronização:", err);
        const errMsg = err?.message || "Erro desconhecido";
        setLastError(errMsg);
        if (notifyOnSuccess) {
          toast.error(`Falha ao sincronizar e-mails: ${errMsg}`, { id: "email-sync-status", duration: 5000 });
        }
      } finally {
        isSyncingRef.current = false;
        setIsSyncing(false);
      }
    },
    []
  );

  const connectOutlook = useCallback(async () => {
    try {
      await getEmailAccessToken(true);
      setHasMicrosoftAccount(true);
      setLastError(null);
      toast.success("Outlook conectado com sucesso! Iniciando sincronização...");
      void syncNow({ force: true, notifyOnSuccess: true });
    } catch (err: any) {
      console.error("[useEmailMonitor] Erro ao conectar Outlook:", err);
      const msg = err?.message || String(err);
      setLastError(msg);
      toast.error(`Falha ao conectar Outlook: ${msg}`, { duration: 9000 });
      throw err;
    }
  }, [syncNow]);

  // Polling periódico acelerado e reativo ao foco da janela
  useEffect(() => {
    if (!enabled) return;

    // Sincronização inicial ágil após 1s (em vez de 5s)
    const initialTimer = setTimeout(() => {
      if (hasMicrosoftAccount) {
        void syncNow({ force: true });
      }
    }, 1000);

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const setupInterval = () => {
      if (intervalId) clearInterval(intervalId);
      const isVisible = typeof document !== "undefined" && document.visibilityState === "visible";
      const intervalMs = isVisible ? ACTIVE_POLL_INTERVAL_MS : BACKGROUND_POLL_INTERVAL_MS;

      intervalId = setInterval(() => {
        if (hasMicrosoftAccount) {
          void syncNow();
        }
      }, intervalMs);
    };

    setupInterval();

    // Sincroniza imediatamente ao retornar para a aba do Kaban ou focar a janela
    const handleVisibilityChange = () => {
      setupInterval();
      if (typeof document !== "undefined" && document.visibilityState === "visible" && hasMicrosoftAccount) {
        void syncNow();
      }
    };

    const handleFocus = () => {
      if (hasMicrosoftAccount) {
        void syncNow();
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("focus", handleFocus);
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    return () => {
      clearTimeout(initialTimer);
      if (intervalId) clearInterval(intervalId);
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", handleFocus);
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
  }, [enabled, hasMicrosoftAccount, syncNow]);

  return {
    isSyncing,
    lastSyncAt,
    lastError,
    processedCount,
    newEventsCount,
    syncNow,
    connectOutlook,
    hasMicrosoftAccount,
  };
}
