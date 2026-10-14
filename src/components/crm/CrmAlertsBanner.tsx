import React from "react";
import { CrmOpportunity, isFollowUpLate, isFollowUpToday, isProposalExpiringSoon } from "@/types/crm";
import { AlertTriangle, Clock, Hourglass, Moon, ArrowRight } from "lucide-react";
import { differenceInDays } from "date-fns";

interface CrmAlertsBannerProps {
  opportunities: CrmOpportunity[];
  proposals?: any[];
  activeFilter: "todos" | "atrasados" | "hoje" | "vencendo" | "estagnadas";
  onFilterChange: (filter: "todos" | "atrasados" | "hoje" | "vencendo" | "estagnadas") => void;
}

export function CrmAlertsBanner({
  opportunities,
  proposals = [],
  activeFilter,
  onFilterChange,
}: CrmAlertsBannerProps) {
  const openOpportunities = opportunities.filter((o) => o.status === "aberta");

  // 1. Contatos atrasados
  const lateCount = openOpportunities.filter((o) => isFollowUpLate(o.proxima_acao_data)).length;

  // 2. Contatos de hoje
  const todayCount = openOpportunities.filter((o) => isFollowUpToday(o.proxima_acao_data)).length;

  // 3. Propostas vencendo em até 48h
  const expiringProposalsCount = proposals.filter((p) =>
    (p.status === "enviada" || p.status === "aguardando_aprovacao") &&
    isProposalExpiringSoon(p.data_validade)
  ).length;

  // 4. Oportunidades estagnadas (> 5 dias sem contato/movimentação)
  const now = new Date();
  const stagnantCount = openOpportunities.filter((o) => {
    const lastDate = o.data_ultimo_contato || o.updated_at || o.created_at;
    return differenceInDays(now, new Date(lastDate)) >= 5;
  }).length;

  const hasAnyAlert = lateCount > 0 || todayCount > 0 || expiringProposalsCount > 0 || stagnantCount > 0;

  if (!hasAnyAlert) return null;

  return (
    <div className="flex items-center gap-2 p-2.5 rounded-2xl border border-border/80 bg-card shadow-xs overflow-x-auto select-none">
      <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-2 shrink-0 flex items-center gap-1.5">
        <span>Lembretes Rápidos:</span>
      </span>

      {/* 1. Atrasados */}
      {lateCount > 0 && (
        <button
          type="button"
          onClick={() => onFilterChange(activeFilter === "atrasados" ? "todos" : "atrasados")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-all ${
            activeFilter === "atrasados"
              ? "bg-rose-500 text-white shadow-xs"
              : "bg-rose-500/15 text-rose-500 dark:text-rose-400 border border-rose-500/30 hover:bg-rose-500/25"
          }`}
        >
          <AlertTriangle className="h-3.5 w-3.5 animate-pulse" />
          <span>{lateCount} Follow-up{lateCount > 1 ? "s" : ""} Atrasado{lateCount > 1 ? "s" : ""}</span>
        </button>
      )}

      {/* 2. Hoje */}
      {todayCount > 0 && (
        <button
          type="button"
          onClick={() => onFilterChange(activeFilter === "hoje" ? "todos" : "hoje")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-all ${
            activeFilter === "hoje"
              ? "bg-amber-500 text-white shadow-xs"
              : "bg-amber-500/15 text-amber-500 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/25"
          }`}
        >
          <Clock className="h-3.5 w-3.5" />
          <span>{todayCount} Contato{todayCount > 1 ? "s" : ""} Hoje</span>
        </button>
      )}

      {/* 3. Propostas Vencendo */}
      {expiringProposalsCount > 0 && (
        <button
          type="button"
          onClick={() => onFilterChange(activeFilter === "vencendo" ? "todos" : "vencendo")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-all ${
            activeFilter === "vencendo"
              ? "bg-purple-600 text-white shadow-xs"
              : "bg-purple-500/15 text-purple-400 border border-purple-500/30 hover:bg-purple-500/25"
          }`}
        >
          <Hourglass className="h-3.5 w-3.5" />
          <span>{expiringProposalsCount} Orçamento{expiringProposalsCount > 1 ? "s" : ""} Vencendo (&lt;48h)</span>
        </button>
      )}

      {/* 4. Estagnadas */}
      {stagnantCount > 0 && (
        <button
          type="button"
          onClick={() => onFilterChange(activeFilter === "estagnadas" ? "todos" : "estagnadas")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium shrink-0 transition-all ${
            activeFilter === "estagnadas"
              ? "bg-slate-700 text-white shadow-xs"
              : "bg-slate-500/15 text-slate-400 border border-slate-500/30 hover:bg-slate-500/25"
          }`}
        >
          <Moon className="h-3.5 w-3.5" />
          <span>{stagnantCount} Sem Movimento (&gt;5d)</span>
        </button>
      )}

      {activeFilter !== "todos" && (
        <button
          type="button"
          onClick={() => onFilterChange("todos")}
          className="ml-auto text-xs text-muted-foreground hover:text-foreground font-medium px-2 py-1 shrink-0"
        >
          Limpar Filtro
        </button>
      )}
    </div>
  );
}
