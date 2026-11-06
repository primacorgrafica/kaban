import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  Truck,
  Bike,
  Store,
  Layers,
  ArrowRight,
  Filter,
  Plus,
  RefreshCw,
  Star,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  DeliveryRouteColumn,
} from "./DeliveryRouteColumn";
import type { DeliveryStopGroup } from "./DeliveryStopCard";
import { DeliveryPauseRouteModal } from "./DeliveryPauseRouteModal";
import { DeliveryRetiraCompleteModal } from "./DeliveryRetiraCompleteModal";
import { GroupOrdersModal } from "./GroupOrdersModal";
import { DeliveryCompletedDetailsModal } from "../DeliveryCompletedDetailsModal";
import {
  assignOrderToRoute,
  reorderRouteStops,
  toggleDeliveryPriority,
  ungroupOrderFromStop,
  saveEntregador,
} from "@/lib/deliveryService";
import {
  ROTAS_DISPONIVEIS,
  type RotaId,
  type Entregador,
  type MotivoPausaRota,
} from "@/types/delivery";
import type { Order } from "@/types/order";
import { cleanOsNumber } from "@/components/ProductionCard";
import { supabase } from "@/integrations/supabase/client";

interface DeliveryRoutesBoardProps {
  orders: Order[];
  entregadores: Entregador[];
  driverMap: Map<string, string>;
  onRefresh: () => void;
  onOpenDriverManagement: () => void;
}

export function DeliveryRoutesBoard({
  orders,
  entregadores,
  driverMap,
  onRefresh,
  onOpenDriverManagement,
}: DeliveryRoutesBoardProps) {
  const [search, setSearch] = useState("");
  const [selectedRouteForPause, setSelectedRouteForPause] = useState<RotaId | null>(null);
  const [retiraOrderToComplete, setRetiraOrderToComplete] = useState<Order | null>(null);
  const [baseOrderForGrouping, setBaseOrderForGrouping] = useState<Order | null>(null);
  const [selectedDeliveredOrder, setSelectedDeliveredOrder] = useState<Order | null>(null);

  // Filtra ordens ativas (não arquivadas)
  const activeOrders = useMemo(() => {
    if (!search.trim()) return orders;
    const q = search.toLowerCase();
    return orders.filter(
      (o) =>
        o.titulo.toLowerCase().includes(q) ||
        o.cliente.toLowerCase().includes(q) ||
        o.descricao.toLowerCase().includes(q) ||
        (o.entrega_endereco || "").toLowerCase().includes(q)
    );
  }, [orders, search]);

  // Separação por rota
  const ordersByRoute = useMemo(() => {
    const map = new Map<RotaId, Order[]>();
    ROTAS_DISPONIVEIS.forEach((r) => map.set(r.id, []));

    activeOrders.forEach((o) => {
      const rId = o.rota_numero as RotaId | undefined;
      if (rId && map.has(rId)) {
        map.get(rId)!.push(o);
      }
    });

    return map;
  }, [activeOrders]);

  // Backlog de entregas sem rota atribuída
  const unassignedOrders = useMemo(() => {
    return activeOrders.filter(
      (o) => !o.rota_numero && o.status_entrega !== "entregue"
    );
  }, [activeOrders]);

  // Manipulador de Atribuição de Rota
  const handleChangeRoute = async (orderIds: string[], newRouteId: RotaId | null) => {
    try {
      for (const id of orderIds) {
        await assignOrderToRoute(id, newRouteId);
      }
      toast.success(
        newRouteId
          ? `${orderIds.length} entrega(s) alocada(s) na ${newRouteId === "RETIRA" ? "RETIRA" : `Rota ${newRouteId}`}!`
          : "Entrega removida da rota e retornada ao backlog."
      );
      onRefresh();
    } catch (err: any) {
      toast.error(`Erro ao mover entrega: ${err.message || err}`);
    }
  };

  // Manipulador de Prioridade
  const handleTogglePriority = async (orderId: string, current: boolean) => {
    const res = await toggleDeliveryPriority(orderId, !current);
    if (res.success) {
      toast.info(!current ? "Prioridade marcada!" : "Prioridade removida.");
      onRefresh();
    } else {
      toast.error(`Erro ao alternar prioridade: ${res.error}`);
    }
  };

  // Manipulador de Desagrupamento
  const handleUngroup = async (orderId: string) => {
    const res = await ungroupOrderFromStop(orderId);
    if (res.success) {
      toast.success("O.S. desagrupada em parada independente.");
      onRefresh();
    } else {
      toast.error(`Erro ao desagrupar: ${res.error}`);
    }
  };

  // Manipulador de Reordenação de Paradas
  const handleReorder = async (
    rotaId: RotaId,
    targetStop: DeliveryStopGroup,
    direction: "up" | "down"
  ) => {
    const routeOrders = ordersByRoute.get(rotaId) || [];
    // Constrói lista atual de paradas da rota
    const stopMap = new Map<string, DeliveryStopGroup>();
    routeOrders.forEach((o) => {
      const key = o.parada_agrupada_id ? `group_${o.parada_agrupada_id}` : `single_${o.id}`;
      if (!stopMap.has(key)) {
        stopMap.set(key, {
          stopKey: key,
          paradaAgrupadaId: o.parada_agrupada_id || null,
          cliente: o.cliente,
          endereco: o.entrega_endereco || o.endereco_entrega || "",
          sequencia: o.rota_sequencia ?? 999,
          prioridade: !!(o.rota_prioridade || o.urgente),
          orders: [o],
        });
      } else {
        stopMap.get(key)!.orders.push(o);
      }
    });

    const stopsArray = Array.from(stopMap.values()).sort((a, b) => a.sequencia - b.sequencia);
    const currentIndex = stopsArray.findIndex((s) => s.stopKey === targetStop.stopKey);
    if (currentIndex === -1) return;

    const newIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= stopsArray.length) return;

    // Troca de posição
    const temp = stopsArray[currentIndex];
    stopsArray[currentIndex] = stopsArray[newIndex];
    stopsArray[newIndex] = temp;

    // Gera lista para o backend
    const itemsToUpdate: { orderId: string; sequencia: number }[] = [];
    stopsArray.forEach((stop, idx) => {
      const seq = idx + 1;
      stop.orders.forEach((o) => {
        itemsToUpdate.push({ orderId: o.id, sequencia: seq });
      });
    });

    const res = await reorderRouteStops(rotaId, itemsToUpdate);
    if (res.success) {
      toast.success("Sequência de paradas atualizada!");
      onRefresh();
    } else {
      toast.error(`Erro ao salvar reordenação: ${res.error}`);
    }
  };

  // Manipulador para Atribuir Motorista à Rota Inteira
  const handleAssignDriverToRoute = async (rotaId: RotaId, driverUserId: string | null) => {
    try {
      const routeOrders = ordersByRoute.get(rotaId) || [];
      const activeRouteOrders = routeOrders.filter((o) => o.status_entrega !== "entregue");

      // 1. Atualiza ordens ativas da rota
      if (activeRouteOrders.length > 0) {
        await supabase
          .from("orders")
          .update({
            entregador_id: driverUserId,
            status_entrega: driverUserId ? "atribuido" : "pendente",
          })
          .in(
            "id",
            activeRouteOrders.map((o) => o.id)
          );
      }

      // 2. Se for atribuir motorista, salva vínculo na tabela entregadores
      if (driverUserId) {
        const driver = entregadores.find((e) => e.user_id === driverUserId);
        if (driver) {
          await saveEntregador({
            ...driver,
            user_id: driver.user_id,
            nome_completo: driver.nome_completo,
            rota_atribuida: rotaId,
          });
        }
      }

      toast.success(
        driverUserId
          ? `Motorista atribuído à Rota ${rotaId} e suas ${activeRouteOrders.length} entregas!`
          : `Motorista desvinculado da Rota ${rotaId}.`
      );
      onRefresh();
    } catch (err: any) {
      toast.error(`Erro ao vincular motorista à rota: ${err.message || err}`);
    }
  };

  // Detalhes da rota selecionada para pausa
  const routeForPauseOrders = selectedRouteForPause
    ? ordersByRoute.get(selectedRouteForPause) || []
    : [];
  const pauseCandidateOrder = routeForPauseOrders.find((o) => o.rota_pausada);

  return (
    <div className="flex flex-col h-full gap-3 overflow-hidden">
      {/* BARRA SUPERIOR DO QUADRO DE ROTAS */}
      <div className="flex items-center justify-between gap-3 bg-muted/40 p-2.5 rounded-xl border border-border">
        <div className="flex items-center gap-3">
          <div className="relative w-72">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar O.S., cliente ou endereço..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs bg-card"
            />
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Layers className="h-3.5 w-3.5 text-primary" />
              <strong>{activeOrders.length}</strong> entregas ativas
            </span>
            <span>•</span>
            <span className="flex items-center gap-1 text-amber-500 font-medium">
              <Truck className="h-3.5 w-3.5" />
              {unassignedOrders.length} sem rota
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1.5"
            onClick={onOpenDriverManagement}
            title="Cadastrar e gerenciar motoristas da frota"
          >
            <Users className="h-3.5 w-3.5 text-primary" />
            Gestão de Entregadores
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={onRefresh}
            title="Atualizar dados"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* CONTAINER DAS COLUNAS: HORIZONTAL SCROLL */}
      <div className="flex-1 flex gap-3 overflow-x-auto pb-3 pt-1 scrollbar-light">
        {/* COLUNA 0: BACKLOG DE ENTREGAS SEM ROTA */}
        <div className="flex flex-col w-[280px] shrink-0 rounded-2xl border border-dashed border-amber-500/40 bg-amber-500/5">
          <div className="p-3 border-b border-amber-500/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400">
                <Truck className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-bold text-xs text-foreground flex items-center gap-1.5">
                  Sem Rota / Backlog
                </h3>
                <span className="text-[10px] text-muted-foreground">
                  {unassignedOrders.length} entregas aguardando alocação
                </span>
              </div>
            </div>
            <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-500">
              {unassignedOrders.length}
            </Badge>
          </div>

          <div className="p-2 flex-1 flex flex-col gap-2 overflow-y-auto max-h-[calc(100vh-270px)] min-h-[160px] scrollbar-thin">
            {unassignedOrders.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
                <span className="text-xs">Tudo alocado!</span>
                <span className="text-[10px] text-muted-foreground/70 mt-0.5">
                  Nenhuma entrega pendente sem rota
                </span>
              </div>
            ) : (
              unassignedOrders.map((ord) => {
                const isUrg = ord.urgente || ord.rota_prioridade;
                return (
                  <div
                    key={ord.id}
                    className={`p-2.5 rounded-xl border bg-card text-xs flex flex-col gap-1.5 transition-all shadow-2xs ${
                      isUrg ? "border-amber-500/60 ring-1 ring-amber-500/20 bg-amber-500/5" : "border-border"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 overflow-hidden">
                        <span className="font-mono font-bold text-foreground">
                          OS #{cleanOsNumber(ord.titulo)}
                        </span>
                        {isUrg && (
                          <Badge variant="destructive" className="text-[9px] px-1 py-0 uppercase">
                            Urgente
                          </Badge>
                        )}
                      </div>

                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5 text-muted-foreground hover:text-amber-500"
                        onClick={() => handleTogglePriority(ord.id, isUrg || false)}
                      >
                        <Star className={`h-3 w-3 ${isUrg ? "fill-amber-500 text-amber-500" : ""}`} />
                      </Button>
                    </div>

                    <div className="font-semibold text-foreground truncate">{ord.cliente}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{ord.descricao}</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {ord.entrega_endereco || ord.endereco_entrega || "Sem endereço cadastrado"}
                    </div>

                    <div className="pt-1.5 border-t border-border/50 flex justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="sm"
                            className="h-6 text-[10px] gap-1 bg-primary text-primary-foreground font-semibold"
                          >
                            Alocar Rota
                            <ArrowRight className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="text-xs w-36">
                          {ROTAS_DISPONIVEIS.map((r) => (
                            <DropdownMenuItem
                              key={r.id}
                              onClick={() => handleChangeRoute([ord.id], r.id)}
                              className="text-xs cursor-pointer"
                            >
                              {r.isRetira ? "🏬 " : "🚚 "}
                              {r.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* AS 6 ROTAS NUMERADAS (1 a 6) */}
        {ROTAS_DISPONIVEIS.filter((r) => !r.isRetira).map((r) => (
          <DeliveryRouteColumn
            key={r.id}
            rotaId={r.id}
            orders={ordersByRoute.get(r.id) || []}
            entregadores={entregadores}
            driverMap={driverMap}
            onRefresh={onRefresh}
            onAssignDriverToRoute={handleAssignDriverToRoute}
            onPauseRoute={(id) => setSelectedRouteForPause(id)}
            onMoveUp={(stop) => handleReorder(r.id, stop, "up")}
            onMoveDown={(stop) => handleReorder(r.id, stop, "down")}
            onChangeRoute={handleChangeRoute}
            onTogglePriority={handleTogglePriority}
            onUngroupOrder={handleUngroup}
            onOpenGroupModal={(order) => setBaseOrderForGrouping(order)}
            onCompleteRetira={(order) => setRetiraOrderToComplete(order)}
            onViewDeliveredDetails={(order) => setSelectedDeliveredOrder(order)}
          />
        ))}

        {/* ROTA ESPECIAL RETIRA */}
        <DeliveryRouteColumn
          rotaId="RETIRA"
          orders={ordersByRoute.get("RETIRA") || []}
          entregadores={entregadores}
          driverMap={driverMap}
          onRefresh={onRefresh}
          onAssignDriverToRoute={handleAssignDriverToRoute}
          onPauseRoute={(id) => setSelectedRouteForPause(id)}
          onMoveUp={(stop) => handleReorder("RETIRA", stop, "up")}
          onMoveDown={(stop) => handleReorder("RETIRA", stop, "down")}
          onChangeRoute={handleChangeRoute}
          onTogglePriority={handleTogglePriority}
          onUngroupOrder={handleUngroup}
          onOpenGroupModal={(order) => setBaseOrderForGrouping(order)}
          onCompleteRetira={(order) => setRetiraOrderToComplete(order)}
          onViewDeliveredDetails={(order) => setSelectedDeliveredOrder(order)}
        />
      </div>

      {/* MODAL DE PAUSA DE ROTA */}
      {selectedRouteForPause && (
        <DeliveryPauseRouteModal
          open={!!selectedRouteForPause}
          onOpenChange={(open) => !open && setSelectedRouteForPause(null)}
          rotaId={selectedRouteForPause}
          orders={ordersByRoute.get(selectedRouteForPause) || []}
          isPaused={!!pauseCandidateOrder}
          currentMotivo={pauseCandidateOrder?.rota_pausa_motivo as MotivoPausaRota | undefined}
          currentObs={pauseCandidateOrder?.rota_pausa_obs}
          pausedAt={pauseCandidateOrder?.rota_pausa_em}
          onSuccess={() => {
            setSelectedRouteForPause(null);
            onRefresh();
          }}
        />
      )}

      {/* MODAL DE CONCLUSÃO DE RETIRADA COM COMPROVANTE */}
      <DeliveryRetiraCompleteModal
        order={retiraOrderToComplete}
        open={!!retiraOrderToComplete}
        onOpenChange={(open) => !open && setRetiraOrderToComplete(null)}
        onSuccess={() => {
          setRetiraOrderToComplete(null);
          onRefresh();
        }}
      />

      {/* MODAL DE AGRUPAMENTO DE ORDENS DO MESMO CLIENTE */}
      <GroupOrdersModal
        baseOrder={baseOrderForGrouping}
        allOrders={orders}
        open={!!baseOrderForGrouping}
        onOpenChange={(open) => !open && setBaseOrderForGrouping(null)}
        onSuccess={() => {
          setBaseOrderForGrouping(null);
          onRefresh();
        }}
      />

      {/* MODAL DE DETALHES DA ENTREGA / PROTOCOLO SHAREPOINT */}
      <DeliveryCompletedDetailsModal
        order={selectedDeliveredOrder}
        open={!!selectedDeliveredOrder}
        onOpenChange={(open) => !open && setSelectedDeliveredOrder(null)}
        driverName={
          selectedDeliveredOrder ? driverMap.get(selectedDeliveredOrder.entregador_id || "") : undefined
        }
        onReopenDelivery={() => {
          setSelectedDeliveredOrder(null);
          onRefresh();
        }}
      />
    </div>
  );
}
