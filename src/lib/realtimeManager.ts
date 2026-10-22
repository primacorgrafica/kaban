/**
 * Gerenciador centralizado de Realtime e Conectividade WebSocket (Supabase Realtime).
 *
 * MUDANÇAS DA FASE 1 & FASE 2 (Auditoria e Evolução):
 * 1. Monitoramento ativo de status de conexão: ONLINE (SUBSCRIBED), RECONNECTING / CONNECTING, OFFLINE (CLOSED / ERROR).
 * 2. Priorização inteligente de eventos (Zero-Delay para ações críticas):
 *    - INSERT, DELETE, e alterações de status/setor/responsável/prioridade são despachados IMEDIATAMENTE (0ms delay).
 *    - Apenas UPDATEs puros de posição (arrastes consecutivos em lote) utilizam o debounce de agregação.
 * 3. Rotina de Reconciliação pós-Reconexão:
 *    - Sempre que o canal passa de reconectando para SUBSCRIBED, notifica os subscribers para executarem verificação delta.
 * 4. Resiliência: listeners para queda de rede do navegador (window.online/offline).
 */
import { supabase } from "@/integrations/supabase/client";
import type { RealtimePostgresChangesPayload, RealtimeChannel } from "@supabase/supabase-js";
import { trackWebSocketTelemetry } from "@/lib/autonomousEngine/telemetry";

export type RealtimeConnectionState = "CONNECTING" | "ONLINE" | "RECONNECTING" | "OFFLINE";
export type OrderPayload = RealtimePostgresChangesPayload<Record<string, any>>;

type PayloadCallback = (payload: OrderPayload | null) => void;
type ConnectionStateCallback = (state: RealtimeConnectionState) => void;
type ReconcileCallback = () => void;

const POSITION_DEBOUNCE_MS = 250; // Reduzido de 600ms para 250ms apenas para movimentações sequenciais de posição

// Estado global de conectividade
let currentConnectionState: RealtimeConnectionState = "CONNECTING";
const connectionStateSubs = new Set<ConnectionStateCallback>();
const reconcileSubs = new Set<ReconcileCallback>();

// Subscribers de dados
const ordersPayloadSubs = new Set<PayloadCallback>();
const profilesPayloadSubs = new Set<PayloadCallback>();
const ordersLegacySubs = new Set<ReconcileCallback>();
const profilesLegacySubs = new Set<ReconcileCallback>();

let ordersChannel: RealtimeChannel | null = null;
let profilesChannel: RealtimeChannel | null = null;

// Buffers para eventos de posição
let pendingPositionOrderPayloads: OrderPayload[] = [];
let pendingPositionProfilePayloads: OrderPayload[] = [];
let ordersPositionTimer: ReturnType<typeof setTimeout> | null = null;
let profilesPositionTimer: ReturnType<typeof setTimeout> | null = null;

function setConnectionState(newState: RealtimeConnectionState) {
  if (currentConnectionState === newState) return;
  const previousState = currentConnectionState;
  currentConnectionState = newState;

  // Telemetria autônoma de WebSocket
  trackWebSocketTelemetry(newState, { previous_state: previousState });

  connectionStateSubs.forEach((cb) => {
    try {
      cb(newState);
    } catch (err) {
      console.error("[RealtimeManager] Erro no listener de status:", err);
    }
  });

  // Se retornou para ONLINE a partir de RECONNECTING ou OFFLINE, aciona reconciliação
  if (newState === "ONLINE" && (previousState === "RECONNECTING" || previousState === "OFFLINE")) {
    console.info("[RealtimeManager] Conexão restabelecida. Disparando reconciliação delta...");
    reconcileSubs.forEach((cb) => {
      try {
        cb();
      } catch (err) {
        console.error("[RealtimeManager] Erro no listener de reconciliação:", err);
      }
    });
  }
}

// Ouvintes nativos de conectividade de rede do navegador
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    console.info("[RealtimeManager] Rede do navegador reconectada.");
    setConnectionState("CONNECTING");
    if (ordersChannel) {
      ordersChannel.subscribe();
    }
  });

  window.addEventListener("offline", () => {
    console.warn("[RealtimeManager] Rede do navegador desconectada.");
    setConnectionState("OFFLINE");
  });
}

function flushPositionOrders() {
  ordersPositionTimer = null;
  const payloads = pendingPositionOrderPayloads;
  pendingPositionOrderPayloads = [];
  for (const p of payloads) {
    ordersPayloadSubs.forEach((cb) => cb(p));
  }
  if (ordersLegacySubs.size > 0) ordersLegacySubs.forEach((cb) => cb());
}

function flushPositionProfiles() {
  profilesPositionTimer = null;
  const payloads = pendingPositionProfilePayloads;
  pendingPositionProfilePayloads = [];
  for (const p of payloads) {
    profilesPayloadSubs.forEach((cb) => cb(p));
  }
  if (profilesLegacySubs.size > 0) profilesLegacySubs.forEach((cb) => cb());
}

/**
 * Avalia se o evento é crítico (ex: novo card, exclusão, troca de etapa/setor, aprovação).
 * Eventos críticos são entregues em 0ms (tempo real puro).
 */
function isCriticalOrderPayload(payload: OrderPayload): boolean {
  const eventType = payload.eventType;
  if (eventType === "INSERT" || eventType === "DELETE") return true;

  const newRow = payload.new as Record<string, any> | undefined;
  const oldRow = payload.old as Record<string, any> | undefined;

  if (!newRow || !oldRow) return true;

  // Mudança de status ou setor ou arquivamento ou prioridade ou responsável
  if (newRow.status !== oldRow.status) return true;
  if (newRow.setor !== oldRow.setor) return true;
  if (newRow.setor_status !== oldRow.setor_status) return true;
  if (newRow.arquivado !== oldRow.arquivado) return true;
  if (newRow.prioridade !== oldRow.prioridade) return true;
  if (newRow.responsavel_id !== oldRow.responsavel_id) return true;

  return false;
}

function dispatchOrderPayload(payload: OrderPayload) {
  if (isCriticalOrderPayload(payload)) {
    // Despacho imediato (0ms delay)
    ordersPayloadSubs.forEach((cb) => cb(payload));
    if (ordersLegacySubs.size > 0) ordersLegacySubs.forEach((cb) => cb());
  } else {
    // É apenas ajuste de posição de arraste: agrupa com debounce de 250ms
    pendingPositionOrderPayloads.push(payload);
    if (ordersPositionTimer) clearTimeout(ordersPositionTimer);
    ordersPositionTimer = setTimeout(flushPositionOrders, POSITION_DEBOUNCE_MS);
  }
}

function ensureOrdersChannel() {
  if (ordersChannel) return;

  ordersChannel = supabase
    .channel("global-orders-realtime")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "orders" },
      (payload) => {
        dispatchOrderPayload(payload as OrderPayload);
      }
    )
    .subscribe((status, err) => {
      if (err) {
        console.error("[RealtimeManager] Erro no canal orders:", err);
      }
      if (status === "SUBSCRIBED") {
        setConnectionState("ONLINE");
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setConnectionState("RECONNECTING");
      } else if (status === "CLOSED") {
        setConnectionState("OFFLINE");
      }
    });
}

function ensureProfilesChannel() {
  if (profilesChannel) return;

  profilesChannel = supabase
    .channel("global-profiles-realtime")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "profiles" },
      (payload) => {
        profilesPayloadSubs.forEach((cb) => cb(payload as OrderPayload));
        if (profilesLegacySubs.size > 0) profilesLegacySubs.forEach((cb) => cb());
      }
    )
    .subscribe();
}

// === Assinatura do Estado da Conexão ===
export function getRealtimeConnectionState(): RealtimeConnectionState {
  return currentConnectionState;
}

export function subscribeRealtimeConnection(cb: ConnectionStateCallback): () => void {
  connectionStateSubs.add(cb);
  cb(currentConnectionState);
  return () => {
    connectionStateSubs.delete(cb);
  };
}

export function subscribeReconcile(cb: ReconcileCallback): () => void {
  reconcileSubs.add(cb);
  return () => {
    reconcileSubs.delete(cb);
  };
}

// === Subscrições de Dados Incrementais ===
export function subscribeOrdersIncremental(cb: PayloadCallback): () => void {
  ordersPayloadSubs.add(cb);
  ensureOrdersChannel();
  return () => {
    ordersPayloadSubs.delete(cb);
    maybeTeardownOrders();
  };
}

export function subscribeProfilesIncremental(cb: PayloadCallback): () => void {
  profilesPayloadSubs.add(cb);
  ensureProfilesChannel();
  return () => {
    profilesPayloadSubs.delete(cb);
    maybeTeardownProfiles();
  };
}

// === Subscrições Legadas ===
export function subscribeOrders(cb: ReconcileCallback): () => void {
  ordersLegacySubs.add(cb);
  ensureOrdersChannel();
  return () => {
    ordersLegacySubs.delete(cb);
    maybeTeardownOrders();
  };
}

export function subscribeProfiles(cb: ReconcileCallback): () => void {
  profilesLegacySubs.add(cb);
  ensureProfilesChannel();
  return () => {
    profilesLegacySubs.delete(cb);
    maybeTeardownProfiles();
  };
}

function maybeTeardownOrders() {
  if (ordersPayloadSubs.size === 0 && ordersLegacySubs.size === 0 && ordersChannel) {
    supabase.removeChannel(ordersChannel);
    ordersChannel = null;
    if (ordersPositionTimer) {
      clearTimeout(ordersPositionTimer);
      ordersPositionTimer = null;
    }
    pendingPositionOrderPayloads = [];
  }
}

function maybeTeardownProfiles() {
  if (profilesPayloadSubs.size === 0 && profilesLegacySubs.size === 0 && profilesChannel) {
    supabase.removeChannel(profilesChannel);
    profilesChannel = null;
    if (profilesPositionTimer) {
      clearTimeout(profilesPositionTimer);
      profilesPositionTimer = null;
    }
    pendingPositionProfilePayloads = [];
  }
}
