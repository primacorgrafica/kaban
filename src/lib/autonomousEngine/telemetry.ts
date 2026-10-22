/**
 * Kaban Autonomous Engine - Telemetry & Health Monitoring Beacon
 *
 * Responsável pela coleta não-bloqueante de telemetria operacional, medição de latência,
 * rastreamento de WebSocket Realtime e auto-recuperação/alertas em segundo plano.
 */

import { supabase } from "@/integrations/supabase/client";

export type MetricType =
  | "HEARTBEAT"
  | "WEBSOCKET"
  | "QUERY_LATENCY"
  | "GRAPH_API"
  | "SYSTEM_ALERT";

export type HealthStatus = "HEALTHY" | "DEGRADED" | "CRITICAL";

export interface TelemetryPayload {
  metric_type: MetricType;
  source?: string;
  status?: HealthStatus;
  latency_ms?: number;
  details?: Record<string, any>;
}

export interface TelemetryRecord extends TelemetryPayload {
  id: string;
  created_at: string;
}

// Configurações de Tolerância Operacional
const LATENCY_DEGRADED_THRESHOLD_MS = 1500;
const LATENCY_CRITICAL_THRESHOLD_MS = 4000;
const CONSECUTIVE_GRAPH_FAILURES_ALERT = 3;

// Estado em memória para rate-limiting e agregação
let consecutiveGraphFailures = 0;
let consecutiveWsFailures = 0;
let lastHeartbeatTimestamp = 0;
let beaconTimer: ReturnType<typeof setInterval> | null = null;

// Fila em memória para envio em lote não intrusivo
let pendingTelemetryQueue: TelemetryPayload[] = [];
let flushTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Envia métricas enfileiradas para o Supabase sem bloquear a UI
 */
async function flushTelemetryQueue(): Promise<void> {
  flushTimeout = null;
  if (pendingTelemetryQueue.length === 0) return;

  const itemsToSend = [...pendingTelemetryQueue];
  pendingTelemetryQueue = [];

  try {
    const formatted = itemsToSend.map((item) => ({
      metric_type: item.metric_type,
      source: item.source || "client_beacon",
      status: item.status || "HEALTHY",
      latency_ms: item.latency_ms !== undefined ? Math.round(item.latency_ms) : null,
      details: item.details || {},
    }));

    const { error } = await supabase
      .from("system_health_telemetry" as any)
      .insert(formatted as any);

    if (error) {
      // Falha silenciosa para isolar e nunca afetar a experiência do usuário
      console.warn("[AutonomousEngine:Telemetry] Falha transitória ao gravar telemetria:", error.message);
    }
  } catch (err) {
    console.warn("[AutonomousEngine:Telemetry] Erro de rede ao gravar telemetria:", err);
  }
}

/**
 * Registra um evento de telemetria com debounce de envio
 */
export function recordTelemetry(payload: TelemetryPayload): void {
  pendingTelemetryQueue.push(payload);

  // Se for CRITICAL ou SYSTEM_ALERT, despacha imediatamente
  if (payload.status === "CRITICAL" || payload.metric_type === "SYSTEM_ALERT") {
    if (flushTimeout) clearTimeout(flushTimeout);
    void flushTelemetryQueue();
    return;
  }

  // Se atingir 10 métricas no buffer ou após 4 segundos, realiza o flush
  if (pendingTelemetryQueue.length >= 10) {
    if (flushTimeout) clearTimeout(flushTimeout);
    void flushTelemetryQueue();
  } else if (!flushTimeout) {
    flushTimeout = setTimeout(flushTelemetryQueue, 4000);
  }
}

/**
 * Mede a latência de uma consulta crítica e gera telemetria automática se degradada
 */
export async function measureQueryLatency<T>(
  operationName: string,
  queryFn: () => Promise<T>
): Promise<T> {
  const start = performance.now();
  try {
    const result = await queryFn();
    const duration = performance.now() - start;

    if (duration > LATENCY_DEGRADED_THRESHOLD_MS) {
      const status: HealthStatus =
        duration > LATENCY_CRITICAL_THRESHOLD_MS ? "CRITICAL" : "DEGRADED";

      recordTelemetry({
        metric_type: "QUERY_LATENCY",
        source: "query_optimizer",
        status,
        latency_ms: duration,
        details: {
          operation: operationName,
          duration_ms: Math.round(duration),
        },
      });
    }

    return result;
  } catch (error: any) {
    const duration = performance.now() - start;
    recordTelemetry({
      metric_type: "QUERY_LATENCY",
      source: "query_optimizer",
      status: "CRITICAL",
      latency_ms: duration,
      details: {
        operation: operationName,
        error: error?.message || String(error),
      },
    });
    throw error;
  }
}

/**
 * Rastreia transições de estado do Supabase Realtime
 */
export function trackWebSocketTelemetry(state: string, details?: Record<string, any>): void {
  if (state === "OFFLINE" || state === "RECONNECTING") {
    consecutiveWsFailures++;
    if (consecutiveWsFailures >= 3) {
      recordTelemetry({
        metric_type: "WEBSOCKET",
        source: "realtime_monitor",
        status: "DEGRADED",
        details: {
          state,
          consecutive_drops: consecutiveWsFailures,
          ...details,
        },
      });
    }
  } else if (state === "ONLINE") {
    if (consecutiveWsFailures > 0) {
      recordTelemetry({
        metric_type: "WEBSOCKET",
        source: "realtime_monitor",
        status: "HEALTHY",
        details: {
          state: "RECOVERED",
          recovered_after_drops: consecutiveWsFailures,
        },
      });
    }
    consecutiveWsFailures = 0;
  }
}

/**
 * Rastreia chamadas e falhas na Microsoft Graph API (Outlook e SharePoint)
 */
export function trackGraphApiTelemetry(
  action: "EMAIL_SYNC" | "SHAREPOINT_UPLOAD" | "MSAL_TOKEN",
  success: boolean,
  durationMs: number,
  errorMessage?: string
): void {
  if (!success) {
    consecutiveGraphFailures++;
    const isCritical = consecutiveGraphFailures >= CONSECUTIVE_GRAPH_FAILURES_ALERT;

    recordTelemetry({
      metric_type: "GRAPH_API",
      source: "microsoft_graph_monitor",
      status: isCritical ? "CRITICAL" : "DEGRADED",
      latency_ms: durationMs,
      details: {
        action,
        consecutive_failures: consecutiveGraphFailures,
        error: errorMessage || "Falha desconhecida",
      },
    });
  } else {
    consecutiveGraphFailures = 0;
    if (durationMs > 2500) {
      recordTelemetry({
        metric_type: "GRAPH_API",
        source: "microsoft_graph_monitor",
        status: "DEGRADED",
        latency_ms: durationMs,
        details: { action, slow_response: true },
      });
    }
  }
}

/**
 * Inicia o Beacon Autônomo de Batimentos Cardíacos (Heartbeat) no cliente
 */
export function startAutonomousClientBeacon(intervalMs = 60000): () => void {
  if (beaconTimer) clearInterval(beaconTimer);

  const sendHeartbeat = () => {
    // Não executa se a aba estiver oculta por mais de 5 minutos para economizar recursos
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      const timeSinceLast = Date.now() - lastHeartbeatTimestamp;
      if (timeSinceLast < 300000) return;
    }

    lastHeartbeatTimestamp = Date.now();
    const memory = (performance as any)?.memory;

    recordTelemetry({
      metric_type: "HEARTBEAT",
      source: "client_heartbeat",
      status: "HEALTHY",
      details: {
        timestamp: new Date().toISOString(),
        jsHeapSizeLimit: memory?.jsHeapSizeLimit,
        totalJSHeapSize: memory?.totalJSHeapSize,
        usedJSHeapSize: memory?.usedJSHeapSize,
      },
    });
  };

  // Primeiro batimento após 5 segundos do boot
  setTimeout(sendHeartbeat, 5000);
  beaconTimer = setInterval(sendHeartbeat, intervalMs);

  return () => {
    if (beaconTimer) clearInterval(beaconTimer);
    beaconTimer = null;
  };
}

/**
 * Consulta as métricas recentes de telemetria
 */
export async function fetchRecentSystemHealth(limit = 20): Promise<TelemetryRecord[]> {
  try {
    const { data, error } = await supabase
      .from("system_health_telemetry" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data as TelemetryRecord[]) || [];
  } catch (err) {
    console.warn("[AutonomousEngine:Telemetry] Erro ao buscar métricas recentes:", err);
    return [];
  }
}
