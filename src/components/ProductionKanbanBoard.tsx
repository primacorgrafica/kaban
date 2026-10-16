import { Order } from "@/types/order";
import { toast } from "sonner";
import { DepartmentConfig, Department } from "@/types/production";
import { ProductionColumn } from "./ProductionColumn";
import { DragDropContext, DropResult } from "@hello-pangea/dnd";
import { useRef, useCallback, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Car, Bike, AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface ProductionKanbanBoardProps {
  department: DepartmentConfig;
  orders: Order[];
  onUpdate: (id: string, data: Partial<Order>) => void;
  onMove: (id: string, newStatus: string, newIndex?: number) => void;
  onSendToDepartment: (id: string, dept: Department, machine?: string) => void;
  onSendBackToPrePress?: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  getProfileName: (userId: string | null) => string | null;
  readOnly?: boolean;
  faturamentoPendenciaIds?: Set<string>;
  parentSectorMap?: Record<string, string | null>;
}

export function ProductionKanbanBoard({
  department,
  orders,
  onUpdate,
  onMove,
  onSendToDepartment,
  onSendBackToPrePress,
  onArchive,
  onDelete,
  getProfileName,
  readOnly = false,
  faturamentoPendenciaIds,
  parentSectorMap,
}: ProductionKanbanBoardProps) {
  const ordersByStatus: Record<string, Order[]> = {};
  department.statuses.forEach(s => {
    ordersByStatus[s.id] = [];
  });

  orders.forEach(o => {
    let status = (o as any).setor_status || "entrada";
    // Compatibilidade CTP: se vier com status antigo do CTP, agrupa em gravando
    if (department.id === "ctp") {
      if (status === "gravacao" || status === "imposicao" || status === "filme_faca_cliche") {
        status = "gravando";
      }
    }
    // Compatibilidade Embalagens: se vier com status antigo desenvolvendo -> preparacao, se vier paralisado -> aguardando_novo_arquivo
    if (department.id === "desenvolvimento") {
      if (status === "desenvolvendo") {
        status = "preparacao";
      } else if (status === "paralisado") {
        status = "aguardando_novo_arquivo";
      }
    }
    if (ordersByStatus[status]) {
      ordersByStatus[status].push(o);
    } else if (department.statuses[0]) {
      ordersByStatus[department.statuses[0].id].push(o);
    }
  });

  department.statuses.forEach(s => {
    ordersByStatus[s.id].sort((a, b) => a.posicao - b.posicao);
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [isDndActive, setIsDndActive] = useState(false);
  const mouseXRef = useRef(0);
  const mouseYRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const updateScrollIndicators = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    updateScrollIndicators();
    el.addEventListener("scroll", updateScrollIndicators, { passive: true });
    window.addEventListener("resize", updateScrollIndicators);
    return () => {
      el.removeEventListener("scroll", updateScrollIndicators);
      window.removeEventListener("resize", updateScrollIndicators);
    };
  }, [updateScrollIndicators]);

  useEffect(() => {
    if (!isDndActive) return;
    const handler = (e: MouseEvent) => { mouseXRef.current = e.clientX; mouseYRef.current = e.clientY; };
    const touchHandler = (e: TouchEvent) => { if (e.touches[0]) { mouseXRef.current = e.touches[0].clientX; mouseYRef.current = e.touches[0].clientY; } };
    document.addEventListener("mousemove", handler, { capture: true, passive: true });
    document.addEventListener("touchmove", touchHandler, { capture: true, passive: true });
    return () => {
      document.removeEventListener("mousemove", handler, { capture: true } as EventListenerOptions);
      document.removeEventListener("touchmove", touchHandler, { capture: true } as EventListenerOptions);
    };
  }, [isDndActive]);

  useEffect(() => {
    if (!isDndActive) { if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; } return; }
    const EDGE_ZONE = 200;
    const MAX_SPEED = 12;
    const tick = () => {
      const el = containerRef.current;
      if (!el) { rafRef.current = requestAnimationFrame(tick); return; }
      const rect = el.getBoundingClientRect();
      const mouseX = mouseXRef.current;
      const mouseY = mouseYRef.current;

      // Horizontal auto-scroll
      if (mouseY >= rect.top && mouseY <= rect.bottom) {
        const relX = mouseX - rect.left;
        if (relX < EDGE_ZONE && relX >= -50) {
          const ratio = Math.max(0, Math.min(1, 1 - relX / EDGE_ZONE));
          el.scrollLeft -= Math.ceil(MAX_SPEED * Math.pow(ratio, 1.5));
        } else if (relX > rect.width - EDGE_ZONE && relX <= rect.width + 50) {
          const ratio = Math.max(0, Math.min(1, 1 - (rect.width - relX) / EDGE_ZONE));
          el.scrollLeft += Math.ceil(MAX_SPEED * Math.pow(ratio, 1.5));
        }
      }

      // Vertical auto-scroll
      if (mouseX >= rect.left && mouseX <= rect.right) {
        const relY = mouseY - rect.top;
        const height = rect.height;
        if (relY < EDGE_ZONE && relY >= -50) {
          const ratio = Math.max(0, Math.min(1, 1 - relY / EDGE_ZONE));
          if (el.scrollTop > 0) el.scrollTop -= Math.ceil(MAX_SPEED * Math.pow(ratio, 1.5));
        } else if (relY > height - EDGE_ZONE && relY <= height + 50) {
          const ratio = Math.max(0, Math.min(1, 1 - (height - relY) / EDGE_ZONE));
          if (el.scrollTop < el.scrollHeight - el.clientHeight) el.scrollTop += Math.ceil(MAX_SPEED * Math.pow(ratio, 1.5));
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; } };
  }, [isDndActive]);

  const [pendingMove, setPendingMove] = useState<{
    id: string; orderTitle: string; fromStatus: string; toStatus: string; newIndex: number;
  } | null>(null);

  const [fatPendenciaWarning, setFatPendenciaWarning] = useState<{
    id: string; orderTitle: string; fromStatus: string; toStatus: string; newIndex: number;
  } | null>(null);

  const [vehicleDialogOpen, setVehicleDialogOpen] = useState(false);
  const [vehiclePendingMove, setVehiclePendingMove] = useState<{
    id: string; toStatus: string; newIndex: number;
  } | null>(null);

  const [motivoParada, setMotivoParada] = useState("");

  const isRouteStatus = (status: string) => ["rota_manha", "rota_tarde"].includes(status);

  const handleDragEnd = (result: DropResult) => {
    setIsDndActive(false);
    if (readOnly || !result.destination) return;
    const toStatus = result.destination.droppableId.split("__")[1];
    const fromStatus = result.source.droppableId.split("__")[1];
    const newIndex = result.destination.index;
    const order = orders.find(o => o.id === result.draggableId);
    if (fromStatus !== toStatus || result.source.index !== newIndex) {
      // Ao arrastar card para paralisado ou qualquer coluna, sempre vir zerado
      setMotivoParada("");
      const moveData = {
        id: result.draggableId,
        orderTitle: order?.titulo || "Card",
        fromStatus,
        toStatus,
        newIndex,
      };
      // Check faturamento pendencia when moving FROM entrada in Expedição
      if (department.id === "expedicao" && fromStatus === "entrada" && toStatus !== "entrada" && order && !order.parent_order_id && faturamentoPendenciaIds?.has(order.id)) {
        setFatPendenciaWarning(moveData);
      } else {
        setPendingMove(moveData);
      }
    }
  };

  const isFatChecklistComplete = (order: Order) => {
    return order.fat_cnpj_ok && order.fat_retencao_iss_ok && order.fat_retencoes_federais_ok &&
      order.fat_limite_emissao_ok && order.fat_envio_nf_ok && order.fat_ocpp_ok && order.fat_restricao_credito_ok;
  };

  const confirmMove = () => {
    if (!pendingMove) return;
    // Block move to emissao_nf if checklist is incomplete
    if (department.id === "faturamento" && pendingMove.toStatus === "emissao_nf") {
      const order = orders.find(o => o.id === pendingMove.id);
      if (order && !isFatChecklistComplete(order)) {
        toast.error("Todos os itens do checklist devem estar marcados como OK antes de mover para Emissão NF.");
        setPendingMove(null);
        return;
      }
    }
    if (pendingMove.toStatus === "aguardando_novo_arquivo" || pendingMove.toStatus === "paralisado") {
      onUpdate(pendingMove.id, { observacao: motivoParada.trim() || null });
    }
    onMove(pendingMove.id, pendingMove.toStatus, pendingMove.newIndex);
    setMotivoParada("");
    setPendingMove(null);
  };

  const confirmVehicle = (vehicle: string) => {
    if (!vehiclePendingMove) return;
    onUpdate(vehiclePendingMove.id, { maquina: vehicle });
    onMove(vehiclePendingMove.id, vehiclePendingMove.toStatus, vehiclePendingMove.newIndex);
    setVehicleDialogOpen(false);
    setVehiclePendingMove(null);
  };

  const scrollTo = useCallback((direction: "left" | "right") => {
    containerRef.current?.scrollBy({ left: direction === "left" ? -300 : 300, behavior: "smooth" });
  }, []);

  return (
    <DragDropContext onDragStart={() => setIsDndActive(true)} onDragEnd={handleDragEnd}>
      <div className="relative min-h-full">
        <div className={`absolute left-0 top-0 bottom-4 w-8 z-10 pointer-events-none transition-opacity duration-300 ${canScrollLeft ? "opacity-100" : "opacity-0"}`} style={{ background: "linear-gradient(to right, hsl(var(--background)), transparent)" }} />
        {canScrollLeft && (
          <button onClick={() => scrollTo("left")} className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full bg-card border border-border shadow-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
        <div className={`absolute right-0 top-0 bottom-4 w-8 z-10 pointer-events-none transition-opacity duration-300 ${canScrollRight ? "opacity-100" : "opacity-0"}`} style={{ background: "linear-gradient(to left, hsl(var(--background)), transparent)" }} />
        {canScrollRight && (
          <button onClick={() => scrollTo("right")} className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full bg-card border border-border shadow-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        )}

        <div ref={containerRef} className="flex gap-7 min-h-full items-stretch overflow-x-auto pb-8 px-1 scrollbar-hide select-none" style={{ WebkitOverflowScrolling: "touch" }}>
          {department.statuses.map((statusConfig) => (
            <ProductionColumn
              key={statusConfig.id}
              statusConfig={statusConfig}
              orders={ordersByStatus[statusConfig.id] || []}
              department={department}
              onUpdate={onUpdate}
              onMove={onMove}
              onSendToDepartment={onSendToDepartment}
              onSendBackToPrePress={onSendBackToPrePress}
              onArchive={onArchive}
              onDelete={onDelete}
              getProfileName={getProfileName}
              readOnly={readOnly}
              faturamentoPendenciaIds={faturamentoPendenciaIds}
              parentSectorMap={parentSectorMap}
            />
          ))}
        </div>
      </div>

      <AlertDialog open={!!pendingMove} onOpenChange={(open) => { if (!open) { setMotivoParada(""); setPendingMove(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar movimentação</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingMove && (
                <>
                  Mover <strong>{pendingMove.orderTitle}</strong> de{" "}
                  <strong>{department.statuses.find(s => s.id === pendingMove.fromStatus)?.label}</strong> para{" "}
                  <strong>{department.statuses.find(s => s.id === pendingMove.toStatus)?.label}</strong>
                  {pendingMove.fromStatus === pendingMove.toStatus && " (reordenar)"}?
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {(pendingMove?.toStatus === "aguardando_novo_arquivo" || pendingMove?.toStatus === "paralisado") && (
            <div className="p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 space-y-2 text-left my-2">
              <Label className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5 uppercase">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                Motivo da Parada
              </Label>
              <Textarea
                value={motivoParada}
                onChange={(e) => setMotivoParada(e.target.value)}
                placeholder="Informe o motivo da parada (ex: Aguardando novo arquivo do cliente, faca com problema, cliente pediu alteração...)"
                className="text-xs bg-background min-h-[65px] text-foreground resize-none"
              />
              <p className="text-[11px] text-muted-foreground">
                Este motivo ficará em destaque visual no card da O.S.
              </p>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setMotivoParada(""); setPendingMove(null); }}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmMove}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Vehicle selection dialog for Expedição routes */}
      <Dialog open={vehicleDialogOpen} onOpenChange={(open) => { if (!open) { setVehicleDialogOpen(false); setVehiclePendingMove(null); } }}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Tipo de veículo</DialogTitle>
          </DialogHeader>
          <div className="flex gap-3">
            <Button
              className="flex-1 h-20 flex-col gap-2"
              variant="outline"
              onClick={() => confirmVehicle("Carro")}
            >
              <Car className="h-6 w-6" />
              Carro
            </Button>
            <Button
              className="flex-1 h-20 flex-col gap-2"
              variant="outline"
              onClick={() => confirmVehicle("Moto")}
            >
              <Bike className="h-6 w-6" />
              Moto
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Faturamento pendencia warning dialog */}
      <AlertDialog open={!!fatPendenciaWarning} onOpenChange={(open) => !open && setFatPendenciaWarning(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center h-6 w-6 rounded bg-red-600 text-white text-xs font-bold">F</span>
              Pendência Faturamento
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta OS possui pendência no setor de Faturamento. Deseja continuar com a movimentação?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setFatPendenciaWarning(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (fatPendenciaWarning) {
                setPendingMove(fatPendenciaWarning);
                setFatPendenciaWarning(null);
              }
            }}>Continuar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DragDropContext>
  );
}
