import { useMemo } from "react";
import { CrmOpportunity, CrmStage } from "@/types/crm";
import {
  startOfDay,
  startOfWeek,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  subDays,
  isAfter,
  isBefore,
} from "date-fns";

export type MetricPeriod =
  | "hoje"
  | "semana"
  | "mes"
  | "ultimos_30_dias"
  | "trimestre"
  | "ano"
  | "todos";

export function useCrmMetrics(
  opportunities: CrmOpportunity[],
  stages: CrmStage[],
  period: MetricPeriod = "mes",
  customDateRange?: { from?: Date; to?: Date }
) {
  const filteredByPeriod = useMemo(() => {
    const now = new Date();
    let startDate: Date | null = null;
    let endDate: Date | null = null;

    if (customDateRange?.from) {
      startDate = startOfDay(customDateRange.from);
      endDate = customDateRange.to ? customDateRange.to : now;
    } else {
      switch (period) {
        case "hoje":
          startDate = startOfDay(now);
          break;
        case "semana":
          startDate = startOfWeek(now, { weekStartsOn: 1 });
          break;
        case "mes":
          startDate = startOfMonth(now);
          break;
        case "ultimos_30_dias":
          startDate = subDays(now, 30);
          break;
        case "trimestre":
          startDate = startOfQuarter(now);
          break;
        case "ano":
          startDate = startOfYear(now);
          break;
        case "todos":
        default:
          startDate = null;
      }
    }

    if (!startDate) return opportunities;

    return opportunities.filter((o) => {
      const created = new Date(o.created_at);
      if (startDate && isBefore(created, startDate)) return false;
      if (endDate && isAfter(created, endDate)) return false;
      return true;
    });
  }, [opportunities, period, customDateRange]);

  const metrics = useMemo(() => {
    const total = filteredByPeriod.length;

    const ativas = filteredByPeriod.filter(
      (o) => o.status === "aberta" || o.status === "pausada"
    );
    const ganhas = filteredByPeriod.filter((o) => o.status === "fechada_ganha");
    const perdidas = filteredByPeriod.filter((o) => o.status === "fechada_perdida");
    const canceladas = filteredByPeriod.filter((o) => o.status === "cancelada");

    // Pipeline aberto (valor de oportunidades em aberto/negociação)
    const pipelineValue = ativas.reduce((acc, o) => acc + (Number(o.valor_estimado) || 0), 0);

    // Total vendido (ganhas)
    const wonValue = ganhas.reduce((acc, o) => acc + (Number(o.valor_estimado) || 0), 0);

    // Total perdido
    const lostValue = perdidas.reduce((acc, o) => acc + (Number(o.valor_estimado) || 0), 0);

    // Taxa de conversão: Ganhas / (Ganhas + Perdidas) * 100
    const finalizadas = ganhas.length + perdidas.length;
    const conversionRate = finalizadas > 0 ? (ganhas.length / finalizadas) * 100 : 0;

    // Ticket médio de fechamento
    const averageTicket = ganhas.length > 0 ? wonValue / ganhas.length : 0;

    // Distribuição por Etapas do Funil
    const byStage = stages.map((st) => {
      const inStage = filteredByPeriod.filter((o) => o.etapa_id === st.id);
      const totalVal = inStage.reduce((acc, o) => acc + (Number(o.valor_estimado) || 0), 0);
      return {
        stageId: st.id,
        stageName: st.nome,
        stageColor: st.cor,
        count: inStage.length,
        totalValue: totalVal,
      };
    });

    // Motivos de Perda
    const lossReasonsMap: Record<string, number> = {};
    perdidas.forEach((o) => {
      const reason = o.motivo_perda || "Não especificado";
      lossReasonsMap[reason] = (lossReasonsMap[reason] || 0) + 1;
    });
    const lossReasonsList = Object.entries(lossReasonsMap)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);

    // Desempenho por Vendedor
    const sellerMap: Record<
      string,
      { total: number; ganhas: number; perdidas: number; valorGanho: number; valorPipeline: number }
    > = {};

    filteredByPeriod.forEach((o) => {
      const seller = o.vendedor_nome || "Não atribuído";
      if (!sellerMap[seller]) {
        sellerMap[seller] = { total: 0, ganhas: 0, perdidas: 0, valorGanho: 0, valorPipeline: 0 };
      }
      sellerMap[seller].total += 1;
      const val = Number(o.valor_estimado) || 0;
      if (o.status === "fechada_ganha") {
        sellerMap[seller].ganhas += 1;
        sellerMap[seller].valorGanho += val;
      } else if (o.status === "fechada_perdida") {
        sellerMap[seller].perdidas += 1;
      } else if (o.status === "aberta" || o.status === "pausada") {
        sellerMap[seller].valorPipeline += val;
      }
    });

    const sellerRanking = Object.entries(sellerMap)
      .map(([seller, data]) => {
        const finaliz = data.ganhas + data.perdidas;
        const conv = finaliz > 0 ? (data.ganhas / finaliz) * 100 : 0;
        return {
          seller,
          ...data,
          conversionRate: conv,
          ticketMedio: data.ganhas > 0 ? data.valorGanho / data.ganhas : 0,
        };
      })
      .sort((a, b) => b.valorGanho - a.valorGanho);

    // Distribuição por Origem do Lead
    const originMap: Record<string, { count: number; valorTotal: number; ganhas: number }> = {};
    filteredByPeriod.forEach((o) => {
      const orig = o.origem_lead || "Outros";
      if (!originMap[orig]) {
        originMap[orig] = { count: 0, valorTotal: 0, ganhas: 0 };
      }
      originMap[orig].count += 1;
      originMap[orig].valorTotal += Number(o.valor_estimado) || 0;
      if (o.status === "fechada_ganha") {
        originMap[orig].ganhas += 1;
      }
    });

    const originDistribution = Object.entries(originMap)
      .map(([orig, data]) => ({
        origem: orig,
        ...data,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      total,
      ativasCount: ativas.length,
      ganhasCount: ganhas.length,
      perdidasCount: perdidas.length,
      canceladasCount: canceladas.length,
      pipelineValue,
      wonValue,
      lostValue,
      conversionRate,
      averageTicket,
      byStage,
      lossReasonsList,
      sellerRanking,
      originDistribution,
    };
  }, [filteredByPeriod, stages]);

  return metrics;
}
