import { useState, useMemo } from "react";
import { Order } from "@/types/order";
import { Department } from "@/types/production";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Briefcase,
  Calendar,
  Clock,
  User,
  AlertTriangle,
  Star,
  ChevronDown,
  ChevronUp,
  MoreVertical,
  ExternalLink,
  Send,
  RotateCcw,
  CheckCircle2,
  PackageCheck,
  Truck,
  Sparkles,
  Repeat,
  Layers,
  Printer,
  Factory,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RelatedOrdersPopover } from "@/components/orders/RelatedOrdersPopover";
import {
  cleanOsNumber,
  getEffectiveRelatedOrders,
  cleanObservationRelatedOrders,
} from "@/lib/orderRelationsService";
import {
  hasProductionPriority,
  toggleProductionPriority,
  cleanObservationProductionPriority,
  setObservationProductionPriority,
} from "@/lib/productionPriority";
import {
  SPECIAL_SUPPLIES,
  isSpecialSupplyActive,
  isSpecialSupplySent,
  getSpecialSupplyDetails,
  toggleSpecialSupplySent,
  getSpecialSupplyOperationalState,
  getProcessoCor,
  sortAndFilterProcessos,
} from "@/lib/processos";
import { getOrderRevision } from "@/lib/orderRevision";
import { getEffectiveOsAnterior } from "@/lib/orderAnterior";
import { toast } from "sonner";

interface ProducaoBlockCardProps {
  order: Order;
  onUpdate: (id: string, data: Partial<Order>) => void | Promise<any>;
  onInspect: (order: Order) => void;
  onOpenBlockageDialog: (order: Order) => void;
  onOpenSendDeptDialog: (order: Order) => void;
  onSendBackToPrePress?: (id: string) => void | Promise<any>;
  onSendToExpedicao?: (id: string) => void | Promise<any>;
  currentUserName?: string | null;
  readOnly?: boolean;
}

export function ProducaoBlockCard({
  order,
  onUpdate,
  onInspect,
  onOpenBlockageDialog,
  onOpenSendDeptDialog,
  onSendBackToPrePress,
  onSendToExpedicao,
  currentUserName,
  readOnly = false,
}: ProducaoBlockCardProps) {
  const [expanded, setExpanded] = useState(false);

  // Informações fundamentais
  const cleanTitulo = cleanOsNumber(order.titulo) || order.titulo?.replace(/^#+/, "") || "S/N";
  const isPriority = hasProductionPriority(order);
  const effectiveRelatedIds = useMemo(() => {
    return order.related_order_ids && order.related_order_ids.length > 0
      ? order.related_order_ids
      : getEffectiveRelatedOrders(order);
  }, [order.related_order_ids, order.observacao]);

  const revision = getOrderRevision(order);
  const osAnterior = getEffectiveOsAnterior(order);
  const isRepeat = order.tipo_trabalho === "repeticao" || Boolean(osAnterior);

  // Status de bloqueio / parada
  const isBlocked =
    order.status === "paralisado" ||
    order.status === "aguardando_novo_arquivo" ||
    order.setor_status === "pendencia" ||
    (order.observacao && /motivo da parada|bloqueio|paralisado/i.test(order.observacao));

  const cleanObsText = useMemo(() => {
    return cleanObservationProductionPriority(
      cleanObservationRelatedOrders(order.observacao || "")
    ).trim();
  }, [order.observacao]);

  // Suprimentos especiais ativos vinculados a esta OS
  const activeSupplies = useMemo(() => {
    return SPECIAL_SUPPLIES.filter((s) => isSpecialSupplyActive(order.processos, s.id));
  }, [order.processos]);

  // Ação direta: confirmar recebimento de suprimento
  const handleConfirmSupplyReceipt = (supplyId: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (readOnly) return;

    const nextProcessos = toggleSpecialSupplySent(
      order.processos,
      supplyId,
      currentUserName || "Operador Produção"
    );

    void Promise.resolve(onUpdate(order.id, { processos: nextProcessos }));
    toast.success(`Recebimento de ${supplyId} confirmado para a O.S. #${cleanTitulo}! ✅`);
  };

  // Ação direta: resolver bloqueio da OS
  const handleResolveBlockage = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (readOnly) return;

    void Promise.resolve(
      onUpdate(order.id, {
        status: "em_producao",
        setor_status: "entrada",
      })
    );
    toast.success(`Bloqueio da O.S. #${cleanTitulo} resolvido! A O.S. retornou ao fluxo normal.`);
  };

  // Cor e identificador do setor
  const setorKey = (order.setor || "producao").toLowerCase();
  const setorBadgeClass =
    setorKey === "ctp"
      ? "bg-sky-500/20 text-sky-400 border-sky-500/30"
      : setorKey === "digital"
      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
      : "bg-amber-500/20 text-amber-400 border-amber-500/30";

  return (
    <div
      onClick={() => onInspect(order)}
      className={`group relative rounded-xl border p-3.5 transition-all duration-200 cursor-pointer select-none backdrop-blur-md ${
        isPriority
          ? "border-amber-500/60 bg-gradient-to-br from-amber-500/10 via-card/95 to-card border-l-4 border-l-amber-500 shadow-md shadow-amber-500/5 hover:border-amber-400"
          : isBlocked
          ? "border-rose-500/50 bg-gradient-to-br from-rose-500/10 via-card/95 to-card border-l-4 border-l-rose-500 hover:border-rose-400"
          : "border-border/70 bg-card/85 hover:border-[#9BA8AB]/60 hover:bg-card hover:shadow-md"
      }`}
    >
      {/* ── LINHA 1: Topo do Card (Número da OS, Badges e Ações) ── */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className={`font-mono-tech font-extrabold text-sm tracking-tight ${
                isPriority ? "text-amber-500" : "text-foreground"
              }`}
            >
              OS. #{cleanTitulo}
            </span>
          </div>

          {/* Badge de Prioridade */}
          {isPriority && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-extrabold tracking-wide bg-amber-500/20 text-amber-500 border border-amber-500/40 shadow-xs"
              title="O.S. marcada como prioridade na Produção"
            >
              <Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500" />
              <span>PRIORIDADE</span>
            </span>
          )}

          {/* Ícone e Menu de O.S. Relacionadas */}
          {effectiveRelatedIds.length > 0 && (
            <div onClick={(e) => e.stopPropagation()}>
              <RelatedOrdersPopover
                currentOrderId={order.id}
                currentOrderTitle={order.titulo}
                relatedOrderIds={effectiveRelatedIds}
              />
            </div>
          )}
        </div>

        {/* Setor Pill e Controles Rápidos */}
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <Badge
            variant="outline"
            className={`text-[10px] uppercase font-mono-tech font-bold px-2 py-0.5 ${setorBadgeClass}`}
          >
            {order.setor || "Produção"}
          </Badge>

          {/* Botão de Prioridade (1-Click) */}
          {!readOnly && (
            <button
              type="button"
              onClick={() => void toggleProductionPriority(order, (id, data) => onUpdate(id, data))}
              className={`h-7 w-7 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                isPriority
                  ? "bg-amber-500/20 text-amber-500 border border-amber-500/40 hover:bg-amber-500/30"
                  : "text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10"
              }`}
              title={isPriority ? "Remover prioridade da Produção" : "Marcar como prioridade na Produção"}
            >
              <Star className={`h-3.5 w-3.5 ${isPriority ? "fill-amber-500 text-amber-500" : ""}`} />
            </button>
          )}

          {/* Menu de Ações Adicionais */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-popover border-border text-popover-foreground w-48">
              <DropdownMenuItem onClick={() => onInspect(order)} className="text-xs cursor-pointer">
                <ExternalLink className="h-3.5 w-3.5 mr-2 text-primary" />
                Inspecionar O.S.
              </DropdownMenuItem>

              {!readOnly && (
                <>
                  <DropdownMenuItem
                    onClick={() => onOpenBlockageDialog(order)}
                    className="text-xs cursor-pointer text-amber-500 hover:text-amber-400"
                  >
                    <AlertTriangle className="h-3.5 w-3.5 mr-2" />
                    {isBlocked ? "Editar Motivo da Parada" : "Registrar Parada / Bloqueio"}
                  </DropdownMenuItem>

                  {isBlocked && (
                    <DropdownMenuItem
                      onClick={(e) => handleResolveBlockage(e as any)}
                      className="text-xs cursor-pointer text-emerald-500 hover:text-emerald-400"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-2" />
                      Resolver Bloqueio
                    </DropdownMenuItem>
                  )}

                  <DropdownMenuSeparator />

                  <DropdownMenuItem
                    onClick={() => onOpenSendDeptDialog(order)}
                    className="text-xs cursor-pointer"
                  >
                    <Send className="h-3.5 w-3.5 mr-2 text-sky-400" />
                    Mover de Setor...
                  </DropdownMenuItem>

                  {onSendBackToPrePress && (
                    <DropdownMenuItem
                      onClick={() => onSendBackToPrePress(order.id)}
                      className="text-xs cursor-pointer text-amber-400"
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-2" />
                      Devolver p/ Pré-Impressão
                    </DropdownMenuItem>
                  )}

                  {onSendToExpedicao && (
                    <DropdownMenuItem
                      onClick={() => onSendToExpedicao(order.id)}
                      className="text-xs cursor-pointer text-emerald-400"
                    >
                      <Truck className="h-3.5 w-3.5 mr-2" />
                      Enviar p/ Expedição
                    </DropdownMenuItem>
                  )}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── LINHA 2: Cliente ── */}
      <div className="mt-2 flex items-center gap-1.5 min-w-0">
        <Briefcase className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="font-bold text-xs text-foreground uppercase truncate tracking-wide" title={order.cliente}>
          {order.cliente || "CLIENTE NÃO INFORMADO"}
        </span>
      </div>

      {/* ── LINHA 3: Descrição resumida do serviço ── */}
      {order.descricao && order.descricao.trim() && (
        <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed" title={order.descricao}>
          {order.descricao}
        </p>
      )}

      {/* ── ALERTA DE BLOQUEIO / PARALISADO (se ativo) ── */}
      {isBlocked && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="mt-2.5 p-2 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <AlertTriangle className="h-3.5 w-3.5 text-rose-400 shrink-0 animate-pulse" />
            <span className="truncate text-[11px] font-medium leading-tight">
              {cleanObsText || "O.S. paralisada aguardando liberação técnica"}
            </span>
          </div>

          {!readOnly && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleResolveBlockage}
              className="h-6 px-2 text-[10px] font-bold bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border-rose-500/40 shrink-0 cursor-pointer"
            >
              Liberar
            </Button>
          )}
        </div>
      )}

      {/* ── SUPRIMENTOS ESPECIAIS (com confirmação de chegada em 1 clique) ── */}
      {activeSupplies.length > 0 && (
        <div className="mt-2.5 pt-2 border-t border-border/40 flex items-center gap-1.5 flex-wrap" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase font-mono-tech mr-1">
            <Sparkles className="h-3 w-3 text-pink-400" />
            <span>Suprimentos:</span>
          </div>

          {activeSupplies.map((supply) => {
            const details = getSpecialSupplyDetails(order.processos, supply.id);
            const opState = getSpecialSupplyOperationalState(order.processos, supply.id);
            const isReceived = opState === "recebido" || details.sent;

            return (
              <button
                key={supply.id}
                type="button"
                disabled={readOnly}
                onClick={(e) => handleConfirmSupplyReceipt(supply.id, e)}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition-all cursor-pointer shadow-xs border ${
                  isReceived
                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30"
                    : opState === "enviado"
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30 animate-pulse"
                    : "bg-pink-500/20 text-pink-300 border-pink-500/40 hover:bg-pink-500/30"
                }`}
                title={
                  isReceived
                    ? `${supply.label}: Recebido! (Clique para alternar status)`
                    : `${supply.label}: Aguardando. Clique para CONFIRMAR CHEGADA`
                }
              >
                {isReceived ? (
                  <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                ) : (
                  <PackageCheck className="h-3 w-3 text-pink-400 shrink-0" />
                )}
                <span>{supply.label}</span>
                <span className="text-[9px] opacity-80">
                  {isReceived ? "Chegou" : "Aguardando"}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── ÁREA EXPANSÍVEL: DETALHES SECUNDÁRIOS ── */}
      <div className="mt-2.5 pt-1.5 border-t border-border/30" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="w-full flex items-center justify-between text-[11px] text-muted-foreground hover:text-foreground py-0.5 transition-colors cursor-pointer"
        >
          <span className="font-medium text-[10px] uppercase tracking-wider font-mono-tech">
            {expanded ? "Ocultar detalhes secundários" : "Mais detalhes operacionais"}
          </span>
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>

        {expanded && (
          <div className="mt-2 space-y-2 text-xs pt-1 border-t border-dashed border-border/40 animate-in fade-in-50 zoom-in-95">
            {/* Prazo e Vendedor */}
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              {order.prazo && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="h-3 w-3 text-primary shrink-0" />
                  <span className="truncate">
                    Prazo:{" "}
                    <strong className="text-foreground">
                      {format(new Date(order.prazo), "dd/MM/yy HH:mm", { locale: ptBR })}
                    </strong>
                  </span>
                </div>
              )}

              {order.vendedor && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <User className="h-3 w-3 text-primary shrink-0" />
                  <span className="truncate">
                    Vend: <strong className="text-foreground">{order.vendedor}</strong>
                  </span>
                </div>
              )}
            </div>

            {/* Máquina e Quantidade */}
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              {order.maquina && (
                <div className="text-muted-foreground truncate">
                  Máquina: <strong className="text-foreground">{order.maquina}</strong>
                </div>
              )}
              {order.setor_status && (
                <div className="text-muted-foreground truncate">
                  Etapa: <strong className="text-foreground uppercase">{order.setor_status}</strong>
                </div>
              )}
            </div>

            {/* Observação Geral */}
            {cleanObsText && !isBlocked && (
              <div className="p-2 rounded bg-muted/30 border border-border/40 text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground">OBS:</span> {cleanObsText}
              </div>
            )}

            {/* Processos adicionais */}
            {order.processos && order.processos.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap pt-1">
                {sortAndFilterProcessos(order.processos).map((proc) => {
                  const cor = getProcessoCor(proc);
                  return (
                    <span
                      key={proc}
                      className={`text-[9px] font-mono-tech px-1.5 py-0.2 rounded border ${cor}`}
                    >
                      {proc}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
