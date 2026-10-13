/**
 * Cache compartilhado para o "instante de entrada em aguardando_aprovacao".
 *
 * Antes desta camada, cada ProductionCard executava sua própria query a
 * order_status_history (resultando em ~9,8 milhões de chamadas registradas
 * no pg_stat_statements). Agora os pedidos são agrupados em uma microtask
 * e resolvidos com UMA única query `.in("order_id", [...])`.
 */
import { supabase } from "@/integrations/supabase/client";

type Listener = (entry: Date | null) => void;

const cache = new Map<string, Date | null>();
const listeners = new Map<string, Set<Listener>>();
const pending = new Set<string>();
let flushScheduled = false;

async function flush() {
  flushScheduled = false;
  const ids = Array.from(pending);
  pending.clear();
  if (ids.length === 0) return;

  const { data } = await supabase
    .from("order_status_history")
    .select("order_id, created_at")
    .in("order_id", ids)
    .eq("status_novo", "aguardando_aprovacao")
    .order("created_at", { ascending: false });

  const latest = new Map<string, Date>();
  if (data) {
    for (const row of data) {
      // primeiro encontrado por order_id é o mais recente (DESC)
      if (!latest.has(row.order_id)) {
        latest.set(row.order_id, new Date(row.created_at));
      }
    }
  }

  for (const id of ids) {
    const value = latest.get(id) ?? null;
    cache.set(id, value);
    listeners.get(id)?.forEach((cb) => cb(value));
  }
}

function schedule(orderId: string) {
  pending.add(orderId);
  if (!flushScheduled) {
    flushScheduled = true;
    queueMicrotask(flush);
  }
}

/**
 * Subscribe to the approval entry time for a given order id.
 * If the value is cached, the callback is invoked synchronously on next microtask.
 * Returns an unsubscribe function.
 */
export function subscribeApprovalEntry(orderId: string, cb: Listener): () => void {
  if (!listeners.has(orderId)) listeners.set(orderId, new Set());
  listeners.get(orderId)!.add(cb);

  if (cache.has(orderId)) {
    queueMicrotask(() => cb(cache.get(orderId)!));
  } else {
    schedule(orderId);
  }

  return () => {
    const set = listeners.get(orderId);
    if (!set) return;
    set.delete(cb);
    if (set.size === 0) listeners.delete(orderId);
  };
}

/** Invalida o cache para uma OS (chamar quando há transição de status). */
export function invalidateApprovalEntry(orderId: string) {
  cache.delete(orderId);
  if (listeners.has(orderId)) schedule(orderId);
}
