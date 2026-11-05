import { useMemo } from "react";
import { Order } from "@/types/order";
import { ProducaoBlockCard } from "./ProducaoBlockCard";
import { hasProductionPriority } from "@/lib/productionPriority";
import { isSpecialSupplyActive } from "@/lib/processos";
import { Layers, Printer, Factory, Sparkles, Star, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ProducaoSectorBlockProps {
  sectorKey: string;
  sectorLabel: string;
  orders: Order[];
  onUpdate: (id: string, data: Partial<Order>) => void | Promise<any>;
  onInspect: (order: Order) => void;
  onOpenBlockageDialog: (order: Order) => void;
  onOpenSendDeptDialog: (order: Order) => void;
  onSendBackToPrePress?: (id: string) => void | Promise<any>;
  onSendToExpedicao?: (id: string) => void | Promise<any>;
  currentUserName?: string | null;
  readOnly?: boolean;
}

export function ProducaoSectorBlock({
  sectorKey,
  sectorLabel,
  orders,
  onUpdate,
  onInspect,
  onOpenBlockageDialog,
  onOpenSendDeptDialog,
  onSendBackToPrePress,
  onSendToExpedicao,
  currentUserName,
  readOnly = false,
}: ProducaoSectorBlockProps) {
  // Ordenação inteligente dentro do bloco:
  // 1. Prioridades na Produção primeiro (⭐)
  // 2. Urgentes em seguida (🚨)
  // 3. Ordem de fila (posicao) ou data de criação
  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      const prioA = hasProductionPriority(a);
      const prioB = hasProductionPriority(b);
      if (prioA !== prioB) {
        return prioA ? -1 : 1;
      }

      if (a.urgente !== b.urgente) {
        return a.urgente ? -1 : 1;
      }

      const posA = typeof a.posicao === "number" ? a.posicao : 9999;
      const posB = typeof b.posicao === "number" ? b.posicao : 9999;
      if (posA !== posB) return posA - posB;

      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [orders]);

  // Métricas do bloco
  const count = sortedOrders.length;
  const priorityCount = sortedOrders.filter(hasProductionPriority).length;
  const suppliesCount = sortedOrders.filter((o) =>
    isSpecialSupplyActive(o.processos, "PANTONE") ||
    isSpecialSupplyActive(o.processos, "FACA") ||
    isSpecialSupplyActive(o.processos, "CLICHE") ||
    isSpecialSupplyActive(o.processos, "FILME") ||
    isSpecialSupplyActive(o.processos, "OUTROS")
  ).length;

  const blockedCount = sortedOrders.filter(
    (o) =>
      o.status === "paralisado" ||
      o.status === "aguardando_novo_arquivo" ||
      o.setor_status === "pendencia" ||
      (o.observacao && /motivo da parada|bloqueio|paralisado/i.test(o.observacao))
  ).length;

  // Ícone e estilização baseados no setor
  const { Icon, colorClass, headerBgClass } = useMemo(() => {
    const k = sectorKey.toLowerCase();
    if (k === "ctp") {
      return {
        Icon: Layers,
        colorClass: "text-sky-400",
        headerBgClass: "from-sky-500/15 via-sky-500/5 to-transparent border-sky-500/30",
      };
    }
    if (k === "digital") {
      return {
        Icon: Printer,
        colorClass: "text-emerald-400",
        headerBgClass: "from-emerald-500/15 via-emerald-500/5 to-transparent border-emerald-500/30",
      };
    }
    return {
      Icon: Factory,
      colorClass: "text-amber-400",
      headerBgClass: "from-amber-500/15 via-amber-500/5 to-transparent border-amber-500/30",
    };
  }, [sectorKey]);

  return (
    <div className="flex flex-col h-full rounded-2xl border border-border/80 bg-card/40 backdrop-blur-xl shadow-xs overflow-hidden">
      {/* ── CABEÇALHO DO BLOCO DO SETOR ── */}
      <div className={`p-3.5 border-b bg-gradient-to-r ${headerBgClass} flex items-center justify-between gap-3`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`h-8 w-8 rounded-xl bg-background/80 border border-border flex items-center justify-center shrink-0 ${colorClass}`}>
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-extrabold uppercase font-mono-tech tracking-wider text-foreground">
                {sectorLabel}
              </h2>
              <Badge variant="secondary" className="text-[11px] font-mono-tech font-bold px-2 py-0.2">
                {count} {count === 1 ? "O.S." : "O.S."}
              </Badge>
            </div>
            <p className="text-[10px] text-muted-foreground leading-none mt-0.5">
              Fila operacional de {sectorLabel.toLowerCase()}
            </p>
          </div>
        </div>

        {/* Badges Rápidas de Destaques no Cabeçalho */}
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          {priorityCount > 0 && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/20 text-amber-500 border border-amber-500/40 shadow-xs"
              title={`${priorityCount} O.S. prioritária${priorityCount > 1 ? "s" : ""}`}
            >
              <Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500" />
              <span>{priorityCount}</span>
            </span>
          )}

          {suppliesCount > 0 && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-pink-500/20 text-pink-300 border border-pink-500/30"
              title={`${suppliesCount} O.S. com matrizes ou suprimentos especiais`}
            >
              <Sparkles className="h-2.5 w-2.5 text-pink-400" />
              <span>{suppliesCount}</span>
            </span>
          )}

          {blockedCount > 0 && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse"
              title={`${blockedCount} O.S. com parada ou bloqueio`}
            >
              <AlertTriangle className="h-2.5 w-2.5 text-rose-400" />
              <span>{blockedCount}</span>
            </span>
          )}
        </div>
      </div>

      {/* ── LISTA / GRID DE CARDS DO SETOR ── */}
      <div className="flex-1 p-3 overflow-y-auto space-y-3 min-h-0 scrollbar-thin">
        {count === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center text-muted-foreground border-2 border-dashed border-border/40 rounded-xl my-2">
            <Icon className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-xs font-semibold text-foreground/80">Nenhuma O.S. neste bloco</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Não há ordens de serviço ativas com os filtros selecionados.
            </p>
          </div>
        ) : (
          sortedOrders.map((order) => (
            <ProducaoBlockCard
              key={order.id}
              order={order}
              onUpdate={onUpdate}
              onInspect={onInspect}
              onOpenBlockageDialog={onOpenBlockageDialog}
              onOpenSendDeptDialog={onOpenSendDeptDialog}
              onSendBackToPrePress={onSendBackToPrePress}
              onSendToExpedicao={onSendToExpedicao}
              currentUserName={currentUserName}
              readOnly={readOnly}
            />
          ))
        )}
      </div>
    </div>
  );
}
