import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { OrderStatus, STATUS_CONFIG, STATUS_ORDER } from "@/types/order";
import { businessHoursMs } from "@/lib/businessHours";

export interface StatusHistoryEntry {
  id: string;
  order_id: string;
  status_anterior: string | null;
  status_novo: string;
  alterado_por: string | null;
  created_at: string;
}

export interface OrderTimeline {
  orderId: string;
  titulo: string;
  cliente: string;
  tempoTotal: number | null;
  tempoPorStatus: Record<string, number>;
  criadoEm: string;
  finalizadoEm: string | null;
  statusAtual: string;
  provasCount: number; // how many times it entered "aguardando_prova"
  provaDigital: boolean;
  provaEmail: boolean;
  prazo: string | null;
  urgente: boolean;
  movimentacoes: { de: string | null; para: string; data: string; por: string | null }[];
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}min`;
  return `${minutes}min`;
}

export { formatDuration };

export function useOrderAnalytics() {
  const [history, setHistory] = useState<StatusHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    const { data, error } = await supabase
      .from("order_status_history")
      .select("*")
      .order("created_at", { ascending: true });

    if (!error && data) {
      setHistory(data as StatusHistoryEntry[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchHistory();

    const channel = supabase
      .channel("status-history-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "order_status_history" }, () => fetchHistory())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchHistory]);

  const buildTimelines = useCallback(
    (orders: { id: string; titulo: string; cliente: string; status: string; created_at: string; prova_digital?: boolean; prova_email?: boolean; prazo?: string | null; urgente?: boolean }[]): OrderTimeline[] => {
      return orders.map((order) => {
        const entries = history.filter((h) => h.order_id === order.id);
        const tempoPorStatus: Record<string, number> = {};

        for (let i = 0; i < entries.length; i++) {
          const current = entries[i];
          const next = entries[i + 1];
          const start = new Date(current.created_at);
          const end = next ? new Date(next.created_at) : new Date();
          const status = current.status_novo;

          if (order.status === "arquivo_liberado" && !next) {
            // Already finalized, don't count ongoing time
          } else {
            tempoPorStatus[status] = (tempoPorStatus[status] || 0) + businessHoursMs(start, end);
          }
        }

        const provasCount = entries.filter((e) => e.status_novo === "aguardando_prova").length;

        const movimentacoes = entries.map((e) => ({
          de: e.status_anterior,
          para: e.status_novo,
          data: e.created_at,
          por: e.alterado_por,
        }));

        const firstEntry = entries[0];
        const lastEntry = entries[entries.length - 1];
        const isFinalized = order.status === "arquivo_liberado";

        let tempoTotal: number | null = null;
        if (isFinalized && firstEntry && lastEntry) {
          tempoTotal = businessHoursMs(new Date(firstEntry.created_at), new Date(lastEntry.created_at));
        } else if (firstEntry) {
          tempoTotal = businessHoursMs(new Date(firstEntry.created_at), new Date());
        }

        return {
          orderId: order.id,
          titulo: order.titulo,
          cliente: order.cliente,
          tempoTotal,
          tempoPorStatus,
          criadoEm: order.created_at,
          finalizadoEm: isFinalized && lastEntry ? lastEntry.created_at : null,
          statusAtual: order.status,
          provasCount,
          provaDigital: order.prova_digital ?? false,
          provaEmail: order.prova_email ?? false,
          prazo: order.prazo ?? null,
          urgente: order.urgente ?? false,
          movimentacoes,
        };
      });
    },
    [history]
  );

  const getAverageTimePerStatus = useCallback(
    (orders: { id: string; titulo: string; cliente: string; status: string; created_at: string }[]) => {
      const timelines = buildTimelines(orders);
      const completedTimelines = timelines.filter((t) => t.statusAtual === "arquivo_liberado");

      const totals: Record<string, { sum: number; count: number }> = {};

      completedTimelines.forEach((t) => {
        Object.entries(t.tempoPorStatus).forEach(([status, ms]) => {
          if (!totals[status]) totals[status] = { sum: 0, count: 0 };
          totals[status].sum += ms;
          totals[status].count += 1;
        });
      });

      const averages: Record<string, number> = {};
      Object.entries(totals).forEach(([status, { sum, count }]) => {
        averages[status] = count > 0 ? sum / count : 0;
      });

      return averages;
    },
    [buildTimelines]
  );

  const getAverageTotalTime = useCallback(
    (orders: { id: string; titulo: string; cliente: string; status: string; created_at: string }[]) => {
      const timelines = buildTimelines(orders);
      const completed = timelines.filter((t) => t.tempoTotal !== null && t.statusAtual === "arquivo_liberado");
      if (completed.length === 0) return null;
      const sum = completed.reduce((acc, t) => acc + (t.tempoTotal || 0), 0);
      return sum / completed.length;
    },
    [buildTimelines]
  );

  return {
    history,
    loading,
    buildTimelines,
    getAverageTimePerStatus,
    getAverageTotalTime,
    formatDuration,
  };
}
