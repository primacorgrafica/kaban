import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Truck,
  Bike,
  Store,
  Pause,
  Play,
  AlertTriangle,
  UserCheck,
  UserX,
  Package,
} from "lucide-react";
import {
  DeliveryStopCard,
  type DeliveryStopGroup,
} from "./DeliveryStopCard";
import {
  MOTIVOS_PAUSA_CONFIG,
  type RotaId,
  type Entregador,
  type MotivoPausaRota,
} from "@/types/delivery";
import type { Order } from "@/types/order";

interface DeliveryRouteColumnProps {
  rotaId: RotaId;
  orders: Order[];
  entregadores: Entregador[];
  driverMap: Map<string, string>;
  onRefresh: () => void;
  onAssignDriverToRoute: (rotaId: RotaId, driverId: string | null) => void;
  onPauseRoute: (rotaId: RotaId) => void;
  onMoveUp: (stop: DeliveryStopGroup) => void;
  onMoveDown: (stop: DeliveryStopGroup) => void;
  onChangeRoute: (orderIds: string[], newRouteId: RotaId | null) => void;
  onTogglePriority: (orderId: string, current: boolean) => void;
  onUngroupOrder: (orderId: string) => void;
  onOpenGroupModal: (order: Order) => void;
  onCompleteRetira: (order: Order) => void;
  onViewDeliveredDetails: (order: Order) => void;
}

export function DeliveryRouteColumn({
  rotaId,
  orders,
  entregadores,
  driverMap,
  onRefresh,
  onAssignDriverToRoute,
  onPauseRoute,
  onMoveUp,
  onMoveDown,
  onChangeRoute,
  onTogglePriority,
  onUngroupOrder,
  onOpenGroupModal,
  onCompleteRetira,
  onViewDeliveredDetails,
}: DeliveryRouteColumnProps) {
  const isRetira = rotaId === "RETIRA";

  // Identifica se a rota está pausada
  const pausedOrder = orders.find((o) => o.rota_pausada);
  const isPaused = !!pausedOrder;
  const pauseMotivo = pausedOrder?.rota_pausa_motivo as MotivoPausaRota | undefined;

  // Motorista responsável atual da rota
  const currentDriverId = useMemo(() => {
    // 1. Procura motorista explicitamente com rota_atribuida === rotaId
    const dedicated = entregadores.find((e) => e.rota_atribuida === rotaId);
    if (dedicated) return dedicated.user_id;

    // 2. Ou pega o mais frequente entre as ordens da rota
    const freq: Record<string, number> = {};
    orders.forEach((o) => {
      if (o.entregador_id) {
        freq[o.entregador_id] = (freq[o.entregador_id] || 0) + 1;
      }
    });

    const entries = Object.entries(freq);
    if (entries.length > 0) {
      entries.sort((a, b) => b[1] - a[1]);
      return entries[0][0];
    }

    return "none";
  }, [entregadores, orders, rotaId]);

  // Agrupa ordens em paradas (pelo parada_agrupada_id)
  const stops: DeliveryStopGroup[] = useMemo(() => {
    const map = new Map<string, DeliveryStopGroup>();

    orders.forEach((o) => {
      const key = o.parada_agrupada_id
        ? `group_${o.parada_agrupada_id}`
        : `single_${o.id}`;

      if (!map.has(key)) {
        map.set(key, {
          stopKey: key,
          paradaAgrupadaId: o.parada_agrupada_id || null,
          cliente: o.cliente,
          endereco: o.entrega_endereco || o.endereco_entrega || "",
          sequencia: o.rota_sequencia ?? 999,
          prioridade: !!(o.rota_prioridade || o.urgente),
          orders: [o],
        });
      } else {
        const existing = map.get(key)!;
        existing.orders.push(o);
        if (o.rota_prioridade || o.urgente) existing.prioridade = true;
        if ((o.rota_sequencia ?? 999) < existing.sequencia) {
          existing.sequencia = o.rota_sequencia ?? 999;
        }
      }
    });

    return Array.from(map.values()).sort((a, b) => a.sequencia - b.sequencia);
  }, [orders]);

  // Contadores
  const totalStops = stops.length;
  const totalOrders = orders.length;
  const deliveredCount = orders.filter((o) => o.status_entrega === "entregue").length;

  return (
    <div
      className={`flex flex-col w-[300px] shrink-0 rounded-2xl border transition-all ${
        isRetira
          ? "border-purple-500/30 bg-purple-950/10 dark:bg-purple-950/20"
          : isPaused
          ? "border-amber-500/50 bg-amber-950/10 dark:bg-amber-950/20"
          : "border-border bg-muted/20"
      }`}
    >
      {/* CABEÇALHO DA COLUNA */}
      <div className="p-3 border-b border-border/60 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={`p-1.5 rounded-lg ${
                isRetira
                  ? "bg-purple-500/20 text-purple-400"
                  : isPaused
                  ? "bg-amber-500/20 text-amber-500"
                  : "bg-primary/10 text-primary"
              }`}
            >
              {isRetira ? (
                <Store className="h-4 w-4" />
              ) : rotaId === "1" || rotaId === "2" ? (
                <Bike className="h-4 w-4" />
              ) : (
                <Truck className="h-4 w-4" />
              )}
            </div>

            <div>
              <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5">
                {isRetira ? "Balcão RETIRA" : `Rota ${rotaId}`}
                {isPaused && (
                  <Badge variant="destructive" className="text-[9px] px-1 py-0 uppercase">
                    Pausada
                  </Badge>
                )}
              </h3>
              <span className="text-[10px] text-muted-foreground">
                {totalStops} parada{totalStops === 1 ? "" : "s"} • {totalOrders} O.S.
                {deliveredCount > 0 && ` (${deliveredCount} entregues)`}
              </span>
            </div>
          </div>

          {/* Botão de Pausa da Rota */}
          {!isRetira && (
            <Button
              size="icon"
              variant={isPaused ? "destructive" : "ghost"}
              className="h-7 w-7 rounded-lg"
              onClick={() => onPauseRoute(rotaId)}
              title={isPaused ? "Ver detalhes ou retomar rota" : "Pausar rota por imprevisto"}
            >
              {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            </Button>
          )}
        </div>

        {/* Seletor do Entregador Responsável da Rota (oculto para RETIRA) */}
        {!isRetira && (
          <div className="flex items-center gap-1.5 text-xs">
            <Select
              value={currentDriverId}
              onValueChange={(val) => {
                onAssignDriverToRoute(rotaId, val === "none" ? null : val);
              }}
            >
              <SelectTrigger className="h-7 text-xs bg-card/80 border-border/80">
                <SelectValue placeholder="Atribuir motorista..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
                    <UserX className="h-3.5 w-3.5" />
                    Sem motorista atribuído
                  </span>
                </SelectItem>
                {entregadores
                  .filter((e) => e.ativo)
                  .map((e) => (
                    <SelectItem key={e.user_id} value={e.user_id}>
                      <span className="flex items-center gap-1.5 text-xs">
                        {e.categoria_veiculo === "carro" ? (
                          <Truck className="h-3 w-3 text-blue-400" />
                        ) : (
                          <Bike className="h-3 w-3 text-emerald-400" />
                        )}
                        {e.nome_completo}
                      </span>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Banner de Rota Pausada */}
        {isPaused && (
          <div
            onClick={() => onPauseRoute(rotaId)}
            className="p-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-[11px] text-amber-500 flex items-center justify-between gap-1 cursor-pointer hover:bg-amber-500/20 transition-colors"
            title="Clique para ver detalhes ou retomar rota"
          >
            <div className="flex items-center gap-1.5 overflow-hidden">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span className="font-semibold truncate">
                {pauseMotivo ? MOTIVOS_PAUSA_CONFIG[pauseMotivo]?.label : "Imprevisto na via"}
              </span>
            </div>
            <span className="underline text-[10px] shrink-0 font-bold">Retomar</span>
          </div>
        )}
      </div>

      {/* CORPO: LISTA DE PARADAS */}
      <div className="p-2 flex-1 flex flex-col gap-2 overflow-y-auto max-h-[calc(100vh-270px)] min-h-[160px] scrollbar-thin">
        {stops.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 border-2 border-dashed border-border/40 rounded-xl text-center text-muted-foreground">
            <Package className="h-7 w-7 text-muted-foreground/40 mb-2" />
            <span className="text-xs font-medium">Nenhuma parada nesta rota</span>
            <span className="text-[10px] text-muted-foreground/70 mt-0.5">
              {isRetira
                ? "Atribua pedidos retirados no balcão aqui"
                : "Alavanque pedidos a partir da lista ao lado"}
            </span>
          </div>
        ) : (
          stops.map((stop, idx) => (
            <DeliveryStopCard
              key={stop.stopKey}
              stop={stop}
              stopIndex={idx}
              totalStops={stops.length}
              rotaId={rotaId}
              onMoveUp={onMoveUp}
              onMoveDown={onMoveDown}
              onChangeRoute={onChangeRoute}
              onTogglePriority={onTogglePriority}
              onUngroupOrder={onUngroupOrder}
              onOpenGroupModal={onOpenGroupModal}
              onCompleteRetira={onCompleteRetira}
              onViewDeliveredDetails={onViewDeliveredDetails}
            />
          ))
        )}
      </div>
    </div>
  );
}
