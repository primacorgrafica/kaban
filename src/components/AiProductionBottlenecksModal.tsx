import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Order, STATUS_CONFIG } from "@/types/order";
import {
  generateDailyExecutiveBriefing,
  DailyExecutiveBriefing,
} from "@/lib/aiAssistant";
import {
  Sparkles,
  AlertTriangle,
  Clock,
  TrendingUp,
  CheckCircle2,
  Calendar,
  AlertOctagon,
  ArrowRight,
  Printer,
  ChevronRight,
  ExternalLink,
  Flame,
} from "lucide-react";
import { format, isPast, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { OrderDetailDialog } from "./OrderDetailDialog";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

interface AiProductionBottlenecksModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orders?: Order[];
  onSelectOrder?: (order: Order) => void;
}

type FilterCategory = "critical" | "delayed" | "today" | "urgent" | "all";

export function AiProductionBottlenecksModal({
  open,
  onOpenChange,
  orders,
  onSelectOrder,
}: AiProductionBottlenecksModalProps) {
  const [internalOrders, setInternalOrders] = useState<Order[]>(orders || []);
  const [selectedFilter, setSelectedFilter] = useState<FilterCategory>("critical");
  const [fallbackOrder, setFallbackOrder] = useState<Order | null>(null);

  useEffect(() => {
    if (orders && orders.length > 0) {
      setInternalOrders(orders);
    } else if (open) {
      supabase
        .from("orders")
        .select("*")
        .eq("arquivado", false)
        .then(({ data }) => {
          if (data) setInternalOrders(data as Order[]);
        });
    }
  }, [open, orders]);

  const briefing: DailyExecutiveBriefing = generateDailyExecutiveBriefing(internalOrders);

  // Lista dinâmica conforme filtro selecionado nos cards do topo
  const displayedOrders = useMemo(() => {
    switch (selectedFilter) {
      case "delayed":
        return internalOrders.filter((o) => o.prazo && isPast(new Date(o.prazo)) && !isToday(new Date(o.prazo)));
      case "today":
        return internalOrders.filter((o) => o.prazo && isToday(new Date(o.prazo)));
      case "urgent":
        return internalOrders.filter((o) => o.urgente);
      case "all":
        return internalOrders;
      case "critical":
      default:
        return briefing.topCriticalOrders;
    }
  }, [selectedFilter, internalOrders, briefing.topCriticalOrders]);

  const filterTitle = useMemo(() => {
    switch (selectedFilter) {
      case "delayed":
        return `O.S. Atrasadas (${displayedOrders.length}):`;
      case "today":
        return `O.S. com Prazo para Hoje (${displayedOrders.length}):`;
      case "urgent":
        return `O.S. Marcadas como Urgentes (${displayedOrders.length}):`;
      case "all":
        return `Todas as O.S. Ativas (${displayedOrders.length}):`;
      case "critical":
      default:
        return `O.S. com Maior Risco de Atraso / Gargalo (${displayedOrders.length}):`;
    }
  }, [selectedFilter, displayedOrders.length]);

  const handleOrderClick = (o: Order) => {
    if (onSelectOrder) {
      onOpenChange(false);
      onSelectOrder(o);
    } else {
      setFallbackOrder(o);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl rounded-2xl border-border/80 bg-card/95 backdrop-blur-2xl shadow-2xl p-6">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-400">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-foreground flex items-center gap-2">
                  Diagnóstico de Gargalos & Fluxo de Produção
                  <Badge className="bg-purple-500/15 text-purple-400 border border-purple-500/30 text-[10px] font-mono-tech">
                    IA Analítica
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Análise em tempo real de prazos, gargalos de etapas e riscos de atraso no parque gráfico.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Telemetry Summary Cards com Filtro Clicável */}
          <div className="grid grid-cols-4 gap-2.5 my-3">
            <button
              type="button"
              onClick={() => setSelectedFilter((prev) => (prev === "all" ? "critical" : "all"))}
              className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                selectedFilter === "all"
                  ? "bg-muted/80 border-primary ring-2 ring-primary/40 shadow-md"
                  : "bg-muted/30 border-border/50 hover:bg-muted/60"
              }`}
              title="Clique para listar todas as O.S. ativas"
            >
              <span className="text-[10px] text-muted-foreground uppercase font-mono-tech block">Total Ativas</span>
              <span className="font-mono-tech text-xl font-bold text-foreground mt-0.5 block">
                {briefing.totalActive}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedFilter((prev) => (prev === "delayed" ? "critical" : "delayed"))}
              className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                selectedFilter === "delayed"
                  ? "bg-red-950/40 border-red-500 ring-2 ring-red-500/40 shadow-md"
                  : "bg-red-950/20 border-red-500/30 hover:bg-red-950/35"
              }`}
              title="Clique para filtrar apenas as O.S. atrasadas"
            >
              <span className="text-[10px] text-red-400 uppercase font-mono-tech block">Atrasadas</span>
              <span className="font-mono-tech text-xl font-bold text-red-400 mt-0.5 block">
                {briefing.delayedCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedFilter((prev) => (prev === "today" ? "critical" : "today"))}
              className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                selectedFilter === "today"
                  ? "bg-amber-950/40 border-amber-500 ring-2 ring-amber-500/40 shadow-md"
                  : "bg-amber-950/20 border-amber-500/30 hover:bg-amber-950/35"
              }`}
              title="Clique para filtrar apenas as O.S. com entrega hoje"
            >
              <span className="text-[10px] text-amber-400 uppercase font-mono-tech block">Para Hoje</span>
              <span className="font-mono-tech text-xl font-bold text-amber-400 mt-0.5 block">
                {briefing.dueTodayCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedFilter((prev) => (prev === "urgent" ? "critical" : "urgent"))}
              className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                selectedFilter === "urgent"
                  ? "bg-[#253745] border-[#CCD0CF] ring-2 ring-[#CCD0CF]/40 shadow-md"
                  : "bg-[#11212D] border-[#4A5C6A]/50 hover:bg-[#253745]/50"
              }`}
              title="Clique para filtrar apenas as O.S. urgentes"
            >
              <span className="text-[10px] text-[#9BA8AB] uppercase font-mono-tech block">Urgentes</span>
              <span className="font-mono-tech text-xl font-bold text-[#CCD0CF] mt-0.5 block">
                {briefing.urgentCount}
              </span>
            </button>
          </div>

          {/* Actionable Insights List */}
          <div className="space-y-2.5 max-h-[190px] overflow-y-auto pr-1 scrollbar-tech">
            <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-primary" /> Alertas e Recomendações do Sistema
            </span>

            {briefing.insights.length === 0 ? (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center text-xs text-emerald-400 flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Fluxo de produção equilibrado. Nenhum gargalo crítico detectado!
              </div>
            ) : (
              briefing.insights.map((ins, i) => {
                const isCrit = ins.type === "critical";
                const isWarn = ins.type === "warning";
                return (
                  <div
                    key={i}
                    className={`p-3 rounded-xl border text-xs space-y-1 transition-all ${
                      isCrit
                        ? "bg-red-950/20 border-red-500/30 text-red-200"
                        : isWarn
                        ? "bg-amber-950/20 border-amber-500/30 text-amber-200"
                        : "bg-muted/30 border-border/60 text-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold flex items-center gap-1.5">
                        {isCrit && <AlertOctagon className="w-3.5 h-3.5 text-red-400" />}
                        {isWarn && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                        {ins.title}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{ins.description}</p>
                    {ins.suggestedAction && (
                      <div className="mt-1 pt-1 border-t border-border/30 text-[11px] font-medium text-primary flex items-center gap-1">
                        <ArrowRight className="w-3 h-3 shrink-0" />
                        <span>{ins.suggestedAction}</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Critical / Filtered Orders List (CLICÁVEL) */}
          <div className="mt-3 pt-3 border-t border-border/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-foreground">
                {filterTitle}
              </span>
              <span className="text-[10px] text-primary/80 font-mono-tech flex items-center gap-1">
                <ExternalLink className="w-3 h-3" /> Clique na O.S. para abrir e resolver
              </span>
            </div>

            {displayedOrders.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-border/60 text-center text-xs text-muted-foreground">
                Nenhuma O.S. encontrada para esta categoria.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1 scrollbar-tech">
                {displayedOrders.map((o) => {
                  const statusLabel = STATUS_CONFIG[o.status]?.label || o.status;
                  const isLate = o.prazo && isPast(new Date(o.prazo)) && !isToday(new Date(o.prazo));

                  return (
                    <div
                      key={o.id}
                      onClick={() => handleOrderClick(o)}
                      className="group flex items-center justify-between p-2.5 rounded-xl bg-muted/30 hover:bg-primary/10 border border-border/40 hover:border-primary/50 cursor-pointer text-xs transition-all shadow-xs"
                      title="Clique para abrir os detalhes e resolver esta O.S."
                    >
                      <div className="flex items-center gap-2 overflow-hidden min-w-0">
                        <span className="font-mono-tech font-black text-primary text-xs shrink-0 group-hover:underline">
                          #{o.titulo}
                        </span>
                        <span className="font-bold text-foreground truncate max-w-[140px] sm:max-w-[180px]">
                          {o.cliente}
                        </span>
                        <span className="text-muted-foreground truncate hidden sm:inline max-w-[180px]">
                          {o.descricao}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {statusLabel && (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-border/60 font-mono-tech hidden sm:inline-flex">
                            {statusLabel}
                          </Badge>
                        )}
                        {o.urgente && (
                          <Badge variant="destructive" className="text-[9px] px-1.5 py-0 font-bold flex items-center gap-0.5">
                            <Flame className="w-2.5 h-2.5" /> Urgente
                          </Badge>
                        )}
                        <span
                          className={`text-[11px] font-mono-tech font-semibold ${
                            isLate ? "text-red-400 font-bold" : "text-muted-foreground"
                          }`}
                        >
                          {o.prazo ? format(new Date(o.prazo), "dd/MM HH:mm", { locale: ptBR }) : "Sem prazo"}
                        </span>
                        <div className="flex items-center gap-0.5 text-primary text-[10px] font-bold opacity-75 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all">
                          <span className="hidden md:inline">Abrir</span>
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Fallback OrderDetailDialog quando não houver manipulador externo */}
      {fallbackOrder && (
        <OrderDetailDialog
          order={fallbackOrder}
          open={!!fallbackOrder}
          onOpenChange={(open) => !open && setFallbackOrder(null)}
          onUpdate={async (id, data) => {
            await supabase.from("orders").update(data).eq("id", id);
            setFallbackOrder((prev) => (prev ? { ...prev, ...data } : null));
          }}
        />
      )}
    </>
  );
}
