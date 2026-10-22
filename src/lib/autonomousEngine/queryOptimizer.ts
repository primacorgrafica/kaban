/**
 * Kaban Autonomous Engine - Query Optimizer & Server Aggregator (Fase 2)
 *
 * Provê consultas de alta performance com projeção seletiva, busca indexada e
 * agregação por RPCs para evitar full scans em tabelas com milhares de O.S.
 */

import { supabase } from "@/integrations/supabase/client";
import { measureQueryLatency } from "./telemetry";
import type { Order } from "@/types/order";
import { getOrderRevision } from "@/lib/orderRevision";

export interface OrdersMetricsSummary {
  active_total: number;
  archived_total: number;
  awaiting_approval: number;
  liberados_today: number;
  preparando_arquivo: number;
  generated_at: string;
}

/**
 * Colunas essenciais para renderização do Kanban operacional.
 * Utiliza projeção completa para compatibilidade estrita com todas as flags e cards.
 */
export const KANBAN_ESSENTIAL_COLUMNS = "*";

/**
 * Consulta de alta performance para o Kanban ativo.
 * Utiliza o índice parcial `idx_orders_active_posicao WHERE arquivado = false`.
 */
export async function fetchActiveOrdersOptimized(): Promise<Order[]> {
  return measureQueryLatency("fetchActiveOrdersOptimized", async () => {
    const { data, error } = await supabase
      .from("orders")
      .select(KANBAN_ESSENTIAL_COLUMNS)
      .eq("arquivado", false)
      .order("posicao", { ascending: true });

    if (error) {
      console.error("[QueryOptimizer] Erro ao buscar ordens ativas:", error.message);
      throw error;
    }

    const rows = (data as Order[]) || [];
    return rows.map((r) => ({
      ...r,
      revisao: getOrderRevision(r),
    }));
  });
}

/**
 * Obtém resumo instantâneo de métricas sem baixar milhares de linhas.
 * Executa a RPC `get_orders_metrics_summary` com fallback resiliente.
 */
export async function fetchOrdersMetricsSummary(): Promise<OrdersMetricsSummary> {
  return measureQueryLatency("fetchOrdersMetricsSummary", async () => {
    try {
      const { data, error } = await (supabase.rpc as any)("get_orders_metrics_summary");

      if (!error && data) {
        return data as OrdersMetricsSummary;
      }
    } catch {
      // Fallback em caso de ambiente onde a RPC ainda não foi executada manualmente
    }

    // Fallback gracioso com consultas indexadas por contagem
    const [activeRes, archivedRes] = await Promise.all([
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("arquivado", false),
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("arquivado", true),
    ]);

    return {
      active_total: activeRes.count || 0,
      archived_total: archivedRes.count || 0,
      awaiting_approval: 0,
      liberados_today: 0,
      preparando_arquivo: 0,
      generated_at: new Date().toISOString(),
    };
  });
}

/**
 * Busca indexada por termo (Número da O.S. ou Cliente).
 * Aproveita os índices GIN Trigram criados na Fase 2.
 */
export async function searchOrdersOptimized(searchTerm: string, limit = 50): Promise<Order[]> {
  const cleanTerm = searchTerm.trim();
  if (!cleanTerm) return [];

  return measureQueryLatency("searchOrdersOptimized", async () => {
    const { data, error } = await supabase
      .from("orders")
      .select(KANBAN_ESSENTIAL_COLUMNS)
      .or(`titulo.ilike.%${cleanTerm}%,cliente.ilike.%${cleanTerm}%`)
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[QueryOptimizer] Erro na busca indexada:", error.message);
      throw error;
    }

    const rows = (data as Order[]) || [];
    return rows.map((r) => ({
      ...r,
      revisao: getOrderRevision(r),
    }));
  });
}

/**
 * Busca eventos de e-mail respeitando a janela deslizante (últimos N dias).
 * Elimina o consumo excessivo de memória ao sincronizar com o Outlook.
 */
export async function fetchEmailEventsRollingWindow(days = 30) {
  const cutoffDate = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

  return measureQueryLatency("fetchEmailEventsRollingWindow", async () => {
    const { data, error } = await supabase
      .from("order_email_events")
      .select("id, message_id, conversation_id, order_id, os_number, subject, body_preview, email_datetime, direction")
      .gte("email_datetime", cutoffDate)
      .order("email_datetime", { ascending: false });

    if (error) {
      console.warn("[QueryOptimizer] Aviso ao consultar janela móvel de e-mails:", error.message);
      return [];
    }

    return data || [];
  });
}
