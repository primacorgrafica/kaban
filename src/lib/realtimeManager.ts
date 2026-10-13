/**
 * Gerenciador centralizado de Realtime para a tabela orders e profiles.
 *
 * MELHORIA DE PERFORMANCE (auditoria 2026):
 * - Antes: cada evento Realtime disparava um `fetchOrders` completo que baixava
 *   1.371+ linhas × 92 colunas (~5 MB) — total de 171.055 chamadas registradas
 *   no pg_stat_statements consumindo ~18h de CPU.
 * - Agora: subscribers recebem o payload do evento (INSERT/UPDATE/DELETE) e
 *   aplicam merge incremental no estado local. Refetch completo só ocorre no
 *   load inicial e como fallback de reconexão.
 *
 * Debounce aumentado para 600 ms — agrupa drag-and-drop em rajada (até 10
 * UPDATEs de `posicao` consecutivos viram 1 notificação).
 */
import { supabase } from "@/integrations/supabase/client";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

export type OrderPayload = RealtimePostgresChangesPayload<Record<string, any>>;
type PayloadCallback = (payload: OrderPayload | null) => void;
type Callback = () => void;

const DEBOUNCE_MS = 600;

// Subscribers que recebem payloads (merge incremental)
const ordersPayloadSubs = new Set<PayloadCallback>();
const profilesPayloadSubs = new Set<PayloadCallback>();

// Subscribers legados (refetch sem payload)
const ordersLegacySubs = new Set<Callback>();
const profilesLegacySubs = new Set<Callback>();

let ordersChannel: ReturnType<typeof supabase.channel> | null = null;
let profilesChannel: ReturnType<typeof supabase.channel> | null = null;

// Buffer de payloads pendentes (entregues em lote após o debounce)
let pendingOrderPayloads: OrderPayload[] = [];
let pendingProfilePayloads: OrderPayload[] = [];
let ordersTimer: ReturnType<typeof setTimeout> | null = null;
let profilesTimer: ReturnType<typeof setTimeout> | null = null;

function flushOrders() {
  ordersTimer = null;
  const payloads = pendingOrderPayloads;
  pendingOrderPayloads = [];
  // Entrega cada payload aos subscribers incrementais
  for (const p of payloads) {
    ordersPayloadSubs.forEach((cb) => cb(p));
  }
  // Legados refazem fetch UMA vez ao final do batch
  if (ordersLegacySubs.size > 0) ordersLegacySubs.forEach((cb) => cb());
}

function flushProfiles() {
  profilesTimer = null;
  const payloads = pendingProfilePayloads;
  pendingProfilePayloads = [];
  for (const p of payloads) {
    profilesPayloadSubs.forEach((cb) => cb(p));
  }
  if (profilesLegacySubs.size > 0) profilesLegacySubs.forEach((cb) => cb());
}

function ensureOrdersChannel() {
  if (ordersChannel) return;
  ordersChannel = supabase
    .channel("global-orders-realtime")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "orders" },
      (payload) => {
        pendingOrderPayloads.push(payload as OrderPayload);
        if (ordersTimer) clearTimeout(ordersTimer);
        ordersTimer = setTimeout(flushOrders, DEBOUNCE_MS);
      }
    )
    .subscribe();
}

function ensureProfilesChannel() {
  if (profilesChannel) return;
  profilesChannel = supabase
    .channel("global-profiles-realtime")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "profiles" },
      (payload) => {
        pendingProfilePayloads.push(payload as OrderPayload);
        if (profilesTimer) clearTimeout(profilesTimer);
        profilesTimer = setTimeout(flushProfiles, DEBOUNCE_MS);
      }
    )
    .subscribe();
}

// === Nova API: subscribe com payload (merge incremental) ===
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

// === API legada (refetch completo) — mantida por compatibilidade ===
export function subscribeOrders(cb: Callback): () => void {
  ordersLegacySubs.add(cb);
  ensureOrdersChannel();
  return () => {
    ordersLegacySubs.delete(cb);
    maybeTeardownOrders();
  };
}

export function subscribeProfiles(cb: Callback): () => void {
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
    if (ordersTimer) {
      clearTimeout(ordersTimer);
      ordersTimer = null;
    }
    pendingOrderPayloads = [];
  }
}

function maybeTeardownProfiles() {
  if (profilesPayloadSubs.size === 0 && profilesLegacySubs.size === 0 && profilesChannel) {
    supabase.removeChannel(profilesChannel);
    profilesChannel = null;
    if (profilesTimer) {
      clearTimeout(profilesTimer);
      profilesTimer = null;
    }
    pendingProfilePayloads = [];
  }
}
