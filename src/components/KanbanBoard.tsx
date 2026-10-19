import { Order, OrderStatus, STATUS_ORDER, STATUS_CONFIG } from "@/types/order";
import { Department } from "@/types/production";
import { KanbanColumn } from "./KanbanColumn";
import { DragDropContext, DropResult } from "@hello-pangea/dnd";
import { useRef, useCallback, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Truck, AlertTriangle } from "lucide-react";

interface Permissions {
  canEditCard: boolean;
  canAdvanceCards: boolean;
  canPauseCards: boolean;
  canArchive: boolean;
  canDelete: boolean;
  canSendToProduction: boolean;
  canReorderEntry: boolean;
  isViewOnly: boolean;
}

interface KanbanBoardProps {
  orders: Order[];
  onUpdate: (id: string, data: Partial<Order>) => void;
  onMove: (id: string, status: OrderStatus, newIndex?: number) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate?: (order: Order) => void;
  onSendToProduction?: (id: string, department: Department, machine?: string) => void;
  onSendToMultipleProduction?: (id: string, departments: { department: Department; machine?: string }[]) => void;
  onSendToExpedicao?: (id: string) => void;
  getProfileName: (userId: string | null) => string | null;
  permissions: Permissions;
  departmentContext?: string;
  slowAlertIds?: Set<string>;
}

export function KanbanBoard({ orders, onUpdate, onMove, onArchive, onDelete, onDuplicate, onSendToProduction, onSendToMultipleProduction, onSendToExpedicao, getProfileName, permissions, departmentContext, slowAlertIds }: KanbanBoardProps) {
  const ordersByStatus = STATUS_ORDER.reduce((acc, status) => {
    acc[status] = [];
    return acc;
  }, {} as Record<OrderStatus, Order[]>);

  const DEPRECATED_SECTORS = ["ctp", "offset", "digital", "acabamento", "terceiros", "embalagens", "desenvolvimento"];
  orders.forEach((o) => {
    let s = o.status;
    if (o.setor && DEPRECATED_SECTORS.includes(o.setor) && (o as any).setor_status) {
      const ss = (o as any).setor_status;
      if (ss === "entrada") s = "fila_de_entrada";
      else if (ss === "preparacao" || ss === "desenvolvendo" || ss === "em_producao" || ss === "processando") s = "preparando_arquivo";
      else if (ss === "aguardando_novo_arquivo" || ss === "paralisado" || ss === "pausado") s = "aguardando_novo_arquivo";
      else if (ss === "aguardando_prova") s = "aguardando_prova";
      else if (ss === "aguardando_aprovacao") s = "aguardando_aprovacao";
      else if (ss === "saida" || ss === "concluido") s = "arquivo_liberado";
    }
    if (s === "paralisado") {
      s = "aguardando_novo_arquivo";
    } else if (s === "operador_2" || s === "operador_3") {
      s = "preparando_arquivo";
    }
    if (ordersByStatus[s]) {
      ordersByStatus[s].push(o);
    } else if (ordersByStatus["fila_de_entrada"]) {
      ordersByStatus["fila_de_entrada"].push(o);
    }
  });

  STATUS_ORDER.forEach((status) => {
    ordersByStatus[status].sort((a, b) => a.posicao - b.posicao);
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

  // Track mouse position globally during drag
  useEffect(() => {
    if (!isDndActive) return;

    const handler = (e: MouseEvent) => {
      mouseXRef.current = e.clientX;
      mouseYRef.current = e.clientY;
    };
    const touchHandler = (e: TouchEvent) => {
      if (e.touches[0]) {
        mouseXRef.current = e.touches[0].clientX;
        mouseYRef.current = e.touches[0].clientY;
      }
    };
    document.addEventListener("mousemove", handler, { capture: true, passive: true });
    document.addEventListener("pointermove", handler as EventListener, { capture: true, passive: true });
    document.addEventListener("touchmove", touchHandler, { capture: true, passive: true });
    return () => {
      document.removeEventListener("mousemove", handler, { capture: true } as EventListenerOptions);
      document.removeEventListener("pointermove", handler as EventListener, { capture: true } as EventListenerOptions);
      document.removeEventListener("touchmove", touchHandler, { capture: true } as EventListenerOptions);
    };
  }, [isDndActive]);

  // RAF-based auto-scroll during drag — uses small increments to let the library
  // recalculate droppable positions on each native scroll event
  useEffect(() => {
    if (!isDndActive) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const EDGE_ZONE = 200;
    const MAX_SPEED = 12; // Moderate speed so library can keep up with position recalc

    const tick = () => {
      const el = containerRef.current;
      if (!el) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const rect = el.getBoundingClientRect();
      const mouseX = mouseXRef.current;
      const mouseY = mouseYRef.current;

      // Horizontal auto-scroll
      if (mouseY >= rect.top && mouseY <= rect.bottom) {
        const relX = mouseX - rect.left;
        const width = rect.width;

        if (relX < EDGE_ZONE && relX >= -50) {
          const ratio = Math.max(0, Math.min(1, 1 - relX / EDGE_ZONE));
          const speed = Math.ceil(MAX_SPEED * Math.pow(ratio, 1.5));
          if (el.scrollLeft > 0) {
            el.scrollLeft -= speed;
          }
        } else if (relX > width - EDGE_ZONE && relX <= width + 50) {
          const ratio = Math.max(0, Math.min(1, 1 - (width - relX) / EDGE_ZONE));
          const speed = Math.ceil(MAX_SPEED * Math.pow(ratio, 1.5));
          if (el.scrollLeft < el.scrollWidth - el.clientWidth) {
            el.scrollLeft += speed;
          }
        }
      }

      // Vertical auto-scroll
      if (mouseX >= rect.left && mouseX <= rect.right) {
        const relY = mouseY - rect.top;
        const height = rect.height;

        if (relY < EDGE_ZONE && relY >= -50) {
          const ratio = Math.max(0, Math.min(1, 1 - relY / EDGE_ZONE));
          const speed = Math.ceil(MAX_SPEED * Math.pow(ratio, 1.5));
          if (el.scrollTop > 0) {
            el.scrollTop -= speed;
          }
        } else if (relY > height - EDGE_ZONE && relY <= height + 50) {
          const ratio = Math.max(0, Math.min(1, 1 - (height - relY) / EDGE_ZONE));
          const speed = Math.ceil(MAX_SPEED * Math.pow(ratio, 1.5));
          if (el.scrollTop < el.scrollHeight - el.clientHeight) {
            el.scrollTop += speed;
          }
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isDndActive]);

  const handleDragStart = useCallback(() => {
    setIsDndActive(true);
  }, []);

  const [pendingMove, setPendingMove] = useState<{
    id: string;
    orderTitle: string;
    fromStatus: OrderStatus;
    toStatus: OrderStatus;
    newIndex: number;
  } | null>(null);
  const [sendToExpedicao, setSendToExpedicao] = useState(false);
  const [motivoParada, setMotivoParada] = useState("");

  const handleDragEnd = (result: DropResult) => {
    setIsDndActive(false);
    if (permissions.isViewOnly) return;
    if (!result.destination) return;
    const newStatus = result.destination.droppableId as OrderStatus;
    const newIndex = result.destination.index;
    const sourceStatus = result.source.droppableId as OrderStatus;

    // Find the order being moved
    const order = orders.find((o) => o.id === result.draggableId);
    const orderTitle = order?.titulo || "Card";

    // If status changed or position changed, ask for confirmation
    if (sourceStatus !== newStatus || result.source.index !== newIndex) {
      // Ao arrastar card para paralisado ou qualquer coluna, sempre vir zerado
      setMotivoParada("");

      setPendingMove({
        id: result.draggableId,
        orderTitle,
        fromStatus: sourceStatus,
        toStatus: newStatus,
        newIndex,
      });
    }
  };

  const confirmMove = () => {
    if (pendingMove) {
      if (pendingMove.toStatus === "aguardando_novo_arquivo" || pendingMove.toStatus === "paralisado") {
        onUpdate(pendingMove.id, { observacao: motivoParada.trim() || null });
      }
      onMove(pendingMove.id, pendingMove.toStatus, pendingMove.newIndex);
      if (sendToExpedicao && pendingMove.toStatus === "aguardando_prova" && onSendToExpedicao) {
        onSendToExpedicao(pendingMove.id);
      }
      setSendToExpedicao(false);
      setMotivoParada("");
      setPendingMove(null);
    }
  };

  const cancelMove = () => {
    setSendToExpedicao(false);
    setMotivoParada("");
    setPendingMove(null);
  };

  const scrollTo = useCallback((direction: "left" | "right") => {
    const el = containerRef.current;
    if (!el) return;
    const amount = direction === "left" ? -300 : 300;
    el.scrollBy({ left: amount, behavior: "smooth" });
  }, []);

  return (
    <DragDropContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="relative h-full">
        {/* Left fade + arrow */}
        <div
          className={`absolute left-0 top-0 bottom-4 w-8 z-10 pointer-events-none transition-opacity duration-300 ${
            canScrollLeft ? "opacity-100" : "opacity-0"
          }`}
          style={{ background: "linear-gradient(to right, hsl(var(--background)), transparent)" }}
        />
        {canScrollLeft && (
          <button
            onClick={() => scrollTo("left")}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full bg-card border border-border shadow-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}

        {/* Right fade + arrow */}
        <div
          className={`absolute right-0 top-0 bottom-4 w-8 z-10 pointer-events-none transition-opacity duration-300 ${
            canScrollRight ? "opacity-100" : "opacity-0"
          }`}
          style={{ background: "linear-gradient(to left, hsl(var(--background)), transparent)" }}
        />
        {canScrollRight && (
          <button
            onClick={() => scrollTo("right")}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full bg-card border border-border shadow-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}

        <div
          ref={containerRef}
          className="flex gap-7 min-h-full items-stretch overflow-x-auto pb-8 px-1 scrollbar-hide select-none"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {STATUS_ORDER.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              orders={ordersByStatus[status]}
              onUpdate={onUpdate}
              onMove={onMove}
              onArchive={onArchive}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
              onSendToProduction={onSendToProduction}
              onSendToMultipleProduction={onSendToMultipleProduction}
              onSendToExpedicao={onSendToExpedicao}
              getProfileName={getProfileName}
               permissions={permissions}
               departmentContext={departmentContext}
               slowAlertIds={slowAlertIds}
            />
          ))}
        </div>
      </div>

      <AlertDialog open={!!pendingMove} onOpenChange={(open) => !open && cancelMove()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar movimentação</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                {pendingMove && (
                  <>
                    <p>
                      Mover <strong>{pendingMove.orderTitle}</strong> de{" "}
                      <strong>{STATUS_CONFIG[pendingMove.fromStatus].label}</strong> para{" "}
                      <strong>{STATUS_CONFIG[pendingMove.toStatus].label}</strong>
                      {pendingMove.fromStatus === pendingMove.toStatus && " (reordenar)"}?
                    </p>
                    {(pendingMove.toStatus === "aguardando_novo_arquivo" || pendingMove.toStatus === "paralisado") && (
                      <div className="mt-4 p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 space-y-2 text-left">
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
                    {pendingMove.toStatus === "aguardando_prova" && onSendToExpedicao && (
                      <div className="flex items-center gap-2 mt-4 p-3 rounded-lg border border-border bg-muted/50">
                        <Checkbox
                          id="send-expedicao"
                          checked={sendToExpedicao}
                          onCheckedChange={(v) => setSendToExpedicao(!!v)}
                        />
                        <Label htmlFor="send-expedicao" className="text-sm font-medium cursor-pointer flex items-center gap-1.5">
                          <Truck className="h-4 w-4 text-primary" />
                          Enviar também para Expedição (Entrada)
                        </Label>
                      </div>
                    )}
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelMove}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmMove}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DragDropContext>
  );
}
