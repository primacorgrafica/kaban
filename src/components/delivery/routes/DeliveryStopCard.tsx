import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  ChevronUp,
  ChevronDown,
  MapPin,
  ExternalLink,
  Layers,
  ArrowRightLeft,
  Star,
  Store,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  Split,
  Eye,
} from "lucide-react";
import type { Order } from "@/types/order";
import {
  ROTAS_DISPONIVEIS,
  DELIVERY_STATUS_CONFIG,
  type RotaId,
  type DeliveryStatus,
} from "@/types/delivery";
import { cleanOsNumber } from "@/components/ProductionCard";

export interface DeliveryStopGroup {
  stopKey: string;
  paradaAgrupadaId: string | null;
  cliente: string;
  endereco: string;
  sequencia: number;
  prioridade: boolean;
  orders: Order[];
}

interface DeliveryStopCardProps {
  stop: DeliveryStopGroup;
  stopIndex: number;
  totalStops: number;
  rotaId: RotaId;
  onMoveUp: (stop: DeliveryStopGroup) => void;
  onMoveDown: (stop: DeliveryStopGroup) => void;
  onChangeRoute: (orderIds: string[], newRouteId: RotaId | null) => void;
  onTogglePriority: (orderId: string, current: boolean) => void;
  onUngroupOrder: (orderId: string) => void;
  onOpenGroupModal: (order: Order) => void;
  onCompleteRetira: (order: Order) => void;
  onViewDeliveredDetails: (order: Order) => void;
}

export function DeliveryStopCard({
  stop,
  stopIndex,
  totalStops,
  rotaId,
  onMoveUp,
  onMoveDown,
  onChangeRoute,
  onTogglePriority,
  onUngroupOrder,
  onOpenGroupModal,
  onCompleteRetira,
  onViewDeliveredDetails,
}: DeliveryStopCardProps) {
  const isRetira = rotaId === "RETIRA";
  const isGrouped = stop.orders.length > 1;
  const isFirst = stopIndex === 0;
  const isLast = stopIndex === totalStops - 1;

  // Status representativo da parada (se todas entregues, entregue; se alguma em rota, em_rota, etc.)
  const primaryOrder = stop.orders[0];
  const allDelivered = stop.orders.every((o) => o.status_entrega === "entregue");
  const anyPaused = stop.orders.some((o) => o.rota_pausada);
  const isPriority = stop.prioridade || stop.orders.some((o) => o.urgente || o.rota_prioridade);

  const displayStatus = (primaryOrder?.status_entrega || "pendente") as DeliveryStatus;
  const statusCfg = DELIVERY_STATUS_CONFIG[displayStatus] || DELIVERY_STATUS_CONFIG.pendente;

  const encodedAddress = encodeURIComponent(
    stop.endereco || primaryOrder?.entrega_endereco || primaryOrder?.endereco_entrega || ""
  );
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;

  return (
    <div
      className={`rounded-xl border p-3 flex flex-col gap-2.5 transition-all shadow-xs ${
        isPriority
          ? "border-amber-500/60 bg-amber-500/5 ring-1 ring-amber-500/20"
          : allDelivered
          ? "border-emerald-500/30 bg-emerald-500/5 opacity-85"
          : "border-border bg-card hover:border-border/80"
      }`}
    >
      {/* CABEÇALHO DO CARD: SEQUÊNCIA, CLIENTE E BADGES */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 overflow-hidden">
          {/* Número da parada */}
          <div
            className={`h-6 min-w-6 px-1.5 rounded-md flex items-center justify-center font-bold text-xs ${
              isRetira
                ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                : isPriority
                ? "bg-amber-500 text-slate-950 font-black shadow-xs"
                : "bg-muted text-foreground border border-border"
            }`}
            title={`Parada #${stopIndex + 1} da ${isRetira ? "Retirada" : `Rota ${rotaId}`}`}
          >
            {isRetira ? <Store className="h-3.5 w-3.5" /> : `#${stopIndex + 1}`}
          </div>

          <div className="flex flex-col overflow-hidden">
            <span
              className="font-bold text-xs text-foreground truncate block"
              title={stop.cliente}
            >
              {stop.cliente}
            </span>
            {isGrouped && (
              <span className="text-[10px] text-primary font-medium flex items-center gap-1">
                <Layers className="h-3 w-3" />
                {stop.orders.length} O.S. agrupadas
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Botão de alternar prioridade */}
          <Button
            size="icon"
            variant="ghost"
            className={`h-6 w-6 rounded-md ${
              isPriority
                ? "text-amber-500 hover:text-amber-600 bg-amber-500/10"
                : "text-muted-foreground hover:text-amber-500"
            }`}
            onClick={() => onTogglePriority(primaryOrder.id, isPriority)}
            title={isPriority ? "Remover prioridade urgente" : "Marcar como entrega prioritária"}
          >
            <Star className={`h-3.5 w-3.5 ${isPriority ? "fill-amber-500" : ""}`} />
          </Button>

          {/* Badge de Status ou Botão de Retirada */}
          {isRetira ? (
            allDelivered ? (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 bg-emerald-500/20 text-emerald-400 border-emerald-500/40 cursor-pointer"
                onClick={() => onViewDeliveredDetails(primaryOrder)}
              >
                Retirado
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 bg-purple-500/20 text-purple-300 border-purple-500/40"
              >
                Aguardando
              </Badge>
            )
          ) : (
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 font-normal ${statusCfg.badgeClass}`}
            >
              {statusCfg.label}
            </Badge>
          )}
        </div>
      </div>

      {/* LISTA DE O.S. INCLUÍDAS NA PARADA */}
      <div className="flex flex-col gap-1 bg-muted/30 p-2 rounded-lg border border-border/40 text-xs">
        {stop.orders.map((ord) => (
          <div key={ord.id} className="flex items-center justify-between gap-2 overflow-hidden">
            <div className="flex items-center gap-1.5 overflow-hidden">
              <span className="font-mono font-bold text-foreground shrink-0 text-[11px]">
                OS #{cleanOsNumber(ord.titulo)}
              </span>
              <span className="text-[11px] text-muted-foreground truncate" title={ord.descricao}>
                — {ord.descricao}
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {ord.status_entrega === "entregue" ? (
                <button
                  type="button"
                  onClick={() => onViewDeliveredDetails(ord)}
                  className="text-[10px] text-emerald-500 hover:underline flex items-center gap-0.5"
                  title="Ver protocolo assinado"
                >
                  <FileCheck className="h-3 w-3" />
                  Ver
                </button>
              ) : isRetira ? (
                <Button
                  size="sm"
                  className="h-5 px-1.5 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                  onClick={() => onCompleteRetira(ord)}
                >
                  Retirar
                </Button>
              ) : null}

              {isGrouped && ord.status_entrega !== "entregue" && (
                <button
                  type="button"
                  onClick={() => onUngroupOrder(ord.id)}
                  className="text-[10px] text-muted-foreground hover:text-red-500 p-0.5"
                  title="Desagrupar esta O.S. em uma parada separada"
                >
                  <Split className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ENDEREÇO COM LINK DE NAVEGAÇÃO */}
      <div className="flex items-center justify-between gap-1 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1 truncate" title={stop.endereco}>
          <MapPin className="h-3 w-3 shrink-0 text-muted-foreground/70" />
          <span className="truncate">{stop.endereco || "Endereço não informado"}</span>
        </div>

        {stop.endereco && (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:text-primary/80 shrink-0 p-0.5"
            title="Abrir no Google Maps"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {/* BARRA DE AÇÕES INFERIOR: REORDENAÇÃO, MUDANÇA DE ROTA E AGRUPAMENTO */}
      <div className="flex items-center justify-between border-t border-border/50 pt-2 text-xs">
        {/* Reordenação: Subir / Descer */}
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            disabled={isFirst || allDelivered}
            className="h-6 w-6 text-muted-foreground hover:text-foreground disabled:opacity-30"
            onClick={() => onMoveUp(stop)}
            title="Mover parada para cima na sequência"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            disabled={isLast || allDelivered}
            className="h-6 w-6 text-muted-foreground hover:text-foreground disabled:opacity-30"
            onClick={() => onMoveDown(stop)}
            title="Mover parada para baixo na sequência"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          {/* Botão de Agrupar (se for O.S. individual) */}
          {!isGrouped && !allDelivered && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-primary gap-1"
              onClick={() => onOpenGroupModal(primaryOrder)}
              title="Agrupar com outra O.S. do mesmo cliente"
            >
              <Layers className="h-3 w-3" />
              Agrupar
            </Button>
          )}

          {/* Seletor de Rota */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground gap-1"
                title="Transferir parada para outra rota"
              >
                <ArrowRightLeft className="h-3 w-3" />
                Mover
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="text-xs w-40">
              <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground">
                Transferir Parada Para:
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {ROTAS_DISPONIVEIS.map((r) => {
                const isCurrent = r.id === rotaId;
                return (
                  <DropdownMenuItem
                    key={r.id}
                    disabled={isCurrent}
                    onClick={() =>
                      onChangeRoute(
                        stop.orders.map((o) => o.id),
                        r.id
                      )
                    }
                    className="text-xs cursor-pointer"
                  >
                    {r.isRetira ? "🏬 " : "🚚 "}
                    {r.label}
                    {isCurrent ? " (Atual)" : ""}
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() =>
                  onChangeRoute(
                    stop.orders.map((o) => o.id),
                    null
                  )
                }
                className="text-xs text-red-500 cursor-pointer"
              >
                Remover da Rota
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
