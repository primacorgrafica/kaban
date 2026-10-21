import { useState, useEffect, useCallback, useRef } from "react";
import { runEmailSync, type SyncResult, LAST_EMAIL_SYNC_KEY } from "@/lib/emailSyncEngine";
import { getStoredMicrosoftUser, getActiveMicrosoftAccount } from "@/lib/msalClient";
import { getEmailAccessToken } from "@/lib/outlookService";
import { toast } from "sonner";

export interface UseEmailMonitorReturn {
  isSyncing: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  processedCount: number;
  newEventsCount: number;
  syncNow: (interactive?: boolean) => Promise<void>;
  connectOutlook: () => Promise<void>;
  hasMicrosoftAccount: boolean;
}

const DEFAULT_POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutos

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

  const syncNow = useCallback(async (interactive = false) => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    setIsSyncing(true);
    setLastError(null);

    try {
      if (interactive) {
        await getEmailAccessToken(true);
      }
      const result: SyncResult = await runEmailSync();
      setProcessedCount((prev) => prev + result.processed);
      setNewEventsCount((prev) => prev + result.newEvents);
      setLastSyncAt(result.lastSyncAt);

      if (result.errors.length > 0) {
        setLastError(result.errors.join("; "));
      }

      if (result.newEvents > 0) {
        toast.info(
          `Outlook: ${result.newEvents} novo(s) e-mail(s) sincronizado(s) com as Ordens de Serviço!`
        );
      }
    } catch (err: any) {
      console.warn("[useEmailMonitor] Falha no ciclo de sincronização:", err);
      setLastError(err?.message || "Erro desconhecido");
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, []);

  const connectOutlook = useCallback(async () => {
    try {
      await getEmailAccessToken(true);
      setHasMicrosoftAccount(true);
      toast.success("Outlook conectado com sucesso! Iniciando sincronização...");
      void syncNow();
    } catch (err: any) {
      console.error("[useEmailMonitor] Erro ao conectar Outlook:", err);
      toast.error(`Falha ao conectar Outlook: ${err?.message || err}`);
    }
  }, [syncNow]);

  // Polling periódico em segundo plano
  useEffect(() => {
    if (!enabled) return;

    // Sincronização inicial silenciosa após montar (espera 5s para não sobrecarregar inicialização)
    const initialTimer = setTimeout(() => {
      if (hasMicrosoftAccount) {
        void syncNow();
      }
    }, 5000);

    const interval = setInterval(() => {
      if (hasMicrosoftAccount) {
        void syncNow();
      }
    }, DEFAULT_POLL_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
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
