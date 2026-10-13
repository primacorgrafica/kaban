import { useState, useEffect, useMemo } from "react";
import { Order } from "@/types/order";
import { supabase } from "@/integrations/supabase/client";
import { businessHoursMs } from "@/lib/businessHours";

const WORK_STATUSES = ["fila_de_entrada", "preparando_arquivo", "operador_2", "operador_3"];
const PAUSE_STATUSES = ["aguardando_aprovacao", "aguardando_novo_arquivo"];
const WORK_THRESHOLD_MS = 21 * 3600000; // 21 business hours

const APPROVAL_STATUS = "aguardando_aprovacao";

interface HistoryEntry {
  order_id: string;
  status_novo: string;
  created_at: string;
}

function getApprovalThresholdMs(order: Order): number | null {
  // Saída direta: 1h, Prova E-mail: 2h, Prova Digital: 8h
  if (order.saida_direta) return 1 * 3600000;
  if (order.prova_email) return 2 * 3600000;
  if (order.prova_digital) return 8 * 3600000;
  return null;
}

/**
 * Returns a Set of order IDs flagged as slow:
 * - Work statuses (entrada/op1/op2/op3): > 21 business hours
 * - aguardando_aprovacao: threshold depends on prova type
 */
export function useSlowOrderAlerts(orders: Order[]): Set<string> {
  const [alertIds, setAlertIds] = useState<Set<string>>(new Set());

  const candidateOrders = useMemo(
    () =>
      orders.filter(
        (o) =>
          !o.arquivado &&
          !o.setor &&
          (WORK_STATUSES.includes(o.status) || o.status === APPROVAL_STATUS)
      ),
    [orders]
  );

  const candidatesKey = useMemo(
    () =>
      candidateOrders
        .map(
          (o) =>
            `${o.id}:${o.status}:${o.created_at}:${o.saida_direta ? 1 : 0}:${o.prova_email ? 1 : 0}:${o.prova_digital ? 1 : 0}`
        )
        .join("|"),
    [candidateOrders]
  );

  useEffect(() => {
    if (candidateOrders.length === 0) {
      setAlertIds((prev) => (prev.size === 0 ? prev : new Set()));
      return;
    }

    const check = async () => {
      const ids = candidateOrders.map((o) => o.id);

      const { data: history } = await supabase
        .from("order_status_history")
        .select("order_id, status_novo, created_at")
        .in("order_id", ids)
        .order("created_at", { ascending: true });

      if (!history) {
        setAlertIds(new Set());
        return;
      }

      const historyByOrder: Record<string, HistoryEntry[]> = {};
      history.forEach((h) => {
        if (!historyByOrder[h.order_id]) historyByOrder[h.order_id] = [];
        historyByOrder[h.order_id].push(h);
      });

      const now = new Date();
      const result = new Set<string>();

      for (const order of candidateOrders) {
        const entries = historyByOrder[order.id] || [];

        if (order.status === APPROVAL_STATUS) {
          const threshold = getApprovalThresholdMs(order);
          if (threshold === null) continue;

          // Reference = last transition into aguardando_aprovacao
          let referenceTime: Date | null = null;
          for (let i = entries.length - 1; i >= 0; i--) {
            if (entries[i].status_novo === APPROVAL_STATUS) {
              referenceTime = new Date(entries[i].created_at);
              break;
            }
          }
          if (!referenceTime) referenceTime = new Date(order.created_at);

          if (businessHoursMs(referenceTime, now) >= threshold) {
            result.add(order.id);
          }
        } else {
          // Work statuses: 21h threshold, restart on return from pause
          let referenceTime = new Date(order.created_at);
          for (let i = entries.length - 1; i >= 0; i--) {
            if (WORK_STATUSES.includes(entries[i].status_novo) && i > 0) {
              if (PAUSE_STATUSES.includes(entries[i - 1].status_novo)) {
                referenceTime = new Date(entries[i].created_at);
                break;
              }
            }
          }
          if (businessHoursMs(referenceTime, now) >= WORK_THRESHOLD_MS) {
            result.add(order.id);
          }
        }
      }

      setAlertIds((prev) => {
        if (prev.size === result.size && [...result].every((id) => prev.has(id))) {
          return prev;
        }
        return result;
      });
    };

    check();
    const interval = setInterval(check, 60000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidatesKey]);

  return alertIds;
}
