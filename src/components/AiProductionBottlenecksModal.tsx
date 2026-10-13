import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Order } from "@/types/order";
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
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface AiProductionBottlenecksModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orders?: Order[];
  onSelectOrder?: (order: Order) => void;
}

export function AiProductionBottlenecksModal({
  open,
  onOpenChange,
  orders,
  onSelectOrder,
}: AiProductionBottlenecksModalProps) {
  const [internalOrders, setInternalOrders] = useState<Order[]>(orders || []);

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

  return (
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
                Análise em tempo real de prazos, gargalos de operadores e riscos de atraso no parque gráfico.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Telemetry Summary Cards */}
        <div className="grid grid-cols-4 gap-2.5 my-3">
          <div className="p-3 rounded-xl bg-muted/30 border border-border/50 text-center">
            <span className="text-[10px] text-muted-foreground uppercase font-mono-tech block">Total Ativas</span>
            <span className="font-mono-tech text-xl font-bold text-foreground mt-0.5 block">
              {briefing.totalActive}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-red-950/20 border border-red-500/30 text-center">
            <span className="text-[10px] text-red-400 uppercase font-mono-tech block">Atrasadas</span>
            <span className="font-mono-tech text-xl font-bold text-red-400 mt-0.5 block">
              {briefing.delayedCount}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-500/30 text-center">
            <span className="text-[10px] text-amber-400 uppercase font-mono-tech block">Para Hoje</span>
            <span className="font-mono-tech text-xl font-bold text-amber-400 mt-0.5 block">
              {briefing.dueTodayCount}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-cyan-950/20 border border-cyan-500/30 text-center">
            <span className="text-[10px] text-cyan-400 uppercase font-mono-tech block">Urgentes</span>
            <span className="font-mono-tech text-xl font-bold text-cyan-400 mt-0.5 block">
              {briefing.urgentCount}
            </span>
          </div>
        </div>

        {/* Actionable Insights List */}
        <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1 scrollbar-tech">
          <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-primary" /> Alertas e Recomendações do Sistema
          </span>

          {briefing.insights.length === 0 ? (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center text-xs text-emerald-400 flex items-center justify-center gap-2">
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

        {/* Top Critical Orders */}
        {briefing.topCriticalOrders.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border/50">
            <span className="text-xs font-bold text-foreground block mb-2">
              O.S. com Maior Risco de Atraso:
            </span>
            <div className="space-y-1.5">
              {briefing.topCriticalOrders.map((o) => (
                <div
                  key={o.id}
                  onClick={() => {
                    if (onSelectOrder) {
                      onOpenChange(false);
                      onSelectOrder(o);
                    }
                  }}
                  className="flex items-center justify-between p-2 rounded-lg bg-muted/30 hover:bg-accent/40 border border-border/40 cursor-pointer text-xs transition-all"
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className="font-mono-tech font-bold text-primary">#{o.titulo}</span>
                    <span className="font-semibold text-foreground truncate max-w-[150px]">{o.cliente}</span>
                    <span className="text-muted-foreground truncate hidden sm:inline max-w-[200px]">{o.descricao}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {o.urgente && (
                      <Badge variant="destructive" className="text-[9px] px-1 py-0">Urgente</Badge>
                    )}
                    <span className="text-[11px] font-mono-tech text-muted-foreground">
                      {o.prazo ? format(new Date(o.prazo), "dd/MM HH:mm", { locale: ptBR }) : "Sem prazo"}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
