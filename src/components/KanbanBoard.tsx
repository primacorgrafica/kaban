import { getOrderRevision, isReturnToPreparation } from "@/lib/orderRevision";
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
import { Truck, AlertTriangle, RotateCcw, ShieldAlert, Check } from "lucide-react";
import { isSpecialSupplySent, isSpecialSupplyActive, toggleSpecialSupplySent } from "@/lib/processos";
import { toast } from "sonner";

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
  onMove: (id: string, status: OrderStatus, newIndex?: number, newRevisao?: number) => void;
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

export function KanbanBoard({ orders, onUpdate, onMove, onArchive, onDelete, onDuplicate, onSendToProduction, onSendToMultipleProduction, onSendToExpedicao, onSendToCompras, getProfileName, permissions, departmentContext, slowAlertIds }: KanbanBoardProps) {
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
  const [applyRevision, setApplyRevision] = useState(true);
  const [agreedSaidaSupplies, setAgreedSaidaSupplies] = useState(false);
  const [markFacaSent, setMarkFacaSent] = useState(false);
  const [markClicheSent, setMarkClicheSent] = useState(false);

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
      setApplyRevision(true);
      setAgreedSaidaSupplies(false);
      setMarkFacaSent(false);
      setMarkClicheSent(false);

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
      const isReturn = isReturnToPreparation(pendingMove.fromStatus, pendingMove.toStatus);
      const currentOrder = orders.find(o => o.id === pendingMove.id);
      const currentRev = getOrderRevision(currentOrder);
      const nextRev = currentRev + 1;
      const targetRev = isReturn && applyRevision ? nextRev : undefined;

      const isTargetSaida = pendingMove.toStatus === "arquivo_liberado" || (pendingMove.toStatus as string) === "saida";

      if (isTargetSaida && (markFacaSent || markClicheSent)) {
        let updatedProcessos = currentOrder?.processos ? [...currentOrder.processos] : [];
        const opName = currentOrder?.operador || undefined;

        if (markFacaSent && !isSpecialSupplySent(updatedProcessos, "FACA")) {
          updatedProcessos = toggleSpecialSupplySent(updatedProcessos, "FACA", opName);
        }
        if (markClicheSent && !isSpecialSupplySent(updatedProcessos, "CLICHE")) {
          updatedProcessos = toggleSpecialSupplySent(updatedProcessos, "CLICHE", opName);
        }

        onUpdate(pendingMove.id, { processos: updatedProcessos });
        toast.success("Suprimentos especiais marcados como enviados!");
      }

      if (isTargetSaida && onSendToCompras) {
        onSendToCompras(pendingMove.id);
      }

      if (pendingMove.toStatus === "aguardando_novo_arquivo" || pendingMove.toStatus === "paralisado") {
        onUpdate(pendingMove.id, { observacao: motivoParada.trim() || null });
      }
      onMove(pendingMove.id, pendingMove.toStatus, pendingMove.newIndex, targetRev);
      if (sendToExpedicao && pendingMove.toStatus === "aguardando_prova" && onSendToExpedicao) {
        onSendToExpedicao(pendingMove.id);
      }
      setSendToExpedicao(false);
      setMotivoParada("");
      setApplyRevision(true);
      setAgreedSaidaSupplies(false);
      setMarkFacaSent(false);
      setMarkClicheSent(false);
      setPendingMove(null);
    }
  };

  const cancelMove = () => {
    setSendToExpedicao(false);
    setMotivoParada("");
    setApplyRevision(true);
    setAgreedSaidaSupplies(false);
    setMarkFacaSent(false);
    setMarkClicheSent(false);
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
                    {isReturnToPreparation(pendingMove.fromStatus, pendingMove.toStatus) && (() => {
                      const currentOrder = orders.find(o => o.id === pendingMove.id);
                      const currentRev = getOrderRevision(currentOrder);
                      const nextRev = currentRev + 1;
                      return (
                        <div className="mt-4 p-3.5 rounded-xl border border-amber-500/40 bg-amber-500/10 space-y-2 text-left">
                          <div className="flex items-center gap-2">
                            <RotateCcw className="h-4 w-4 text-amber-500 shrink-0" />
                            <Label className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wide">
                              Retorno para Preparação Detectado
                            </Label>
                          </div>
                          <p className="text-xs text-foreground font-medium leading-relaxed">
                            Esta O.S. está retornando para Preparação. Ela será sinalizada com o flag{" "}
                            <span className="font-mono-tech font-extrabold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40">
                              REV{nextRev}
                            </span>{" "}
                            (Revisão {nextRev}).
                          </p>
                          <div className="flex items-center gap-2 pt-1">
                            <Checkbox
                              id="apply-rev"
                              checked={applyRevision}
                              onCheckedChange={(v) => setApplyRevision(!!v)}
                            />
                            <Label htmlFor="apply-rev" className="text-xs cursor-pointer font-medium">
                              Atualizar revisão para <strong>REV{nextRev}</strong>
                            </Label>
                          </div>
                        </div>
                      );
                    })()}

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

                    {(() => {
                      const isTargetSaida = pendingMove.toStatus === "arquivo_liberado" || (pendingMove.toStatus as string) === "saida";
                      if (!isTargetSaida) return null;

                      const currentOrder = orders.find((o) => o.id === pendingMove.id);
                      const processos = currentOrder?.processos || [];
                      const facaSent = isSpecialSupplySent(processos, "FACA");
                      const clicheSent = isSpecialSupplySent(processos, "CLICHE");
                      const facaActive = isSpecialSupplyActive(processos, "FACA");
                      const clicheActive = isSpecialSupplyActive(processos, "CLICHE");

                      if (facaSent && clicheSent) {
                        return (
                          <div className="mt-4 p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 flex items-center gap-2 text-xs font-semibold">
                            <Check className="h-4 w-4 shrink-0 text-emerald-500" />
                            <span>FACA e CLICHÊ já foram registrados como enviados ao fornecedor.</span>
                          </div>
                        );
                      }

                      return (
                        <div className="mt-4 p-3.5 rounded-xl border-2 border-rose-500/60 bg-rose-500/10 dark:bg-rose-950/25 space-y-3 text-left animate-in fade-in-50 duration-200">
                          <div className="flex items-center gap-2">
                            <ShieldAlert className="h-5 w-5 text-rose-500 shrink-0" />
                            <div>
                              <Label className="text-xs font-black text-rose-800 dark:text-rose-400 uppercase tracking-wider block">
                                Aviso de Envio Obrigatório: Faca & Clichê
                              </Label>
                              <span className="text-[11px] text-muted-foreground">
                                Liberação bloqueada até concordar com o status de envio.
                              </span>
                            </div>
                          </div>

                          <p className="text-xs text-foreground font-medium leading-relaxed">
                            A O.S. está sendo movida para a coluna <strong>SAÍDA</strong>. Verifique o envio de <strong>FACA</strong> e <strong>CLICHÊ</strong> aos fornecedores para não travar o acabamento da produção.
                          </p>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                            {/* Faca box */}
                            <div className={`p-2.5 rounded-lg border text-xs flex flex-col justify-between gap-1.5 transition-colors ${
                              facaSent || markFacaSent
                                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-800 dark:text-emerald-300"
                                : facaActive
                                ? "bg-amber-500/20 border-amber-500/50 text-amber-900 dark:text-amber-200"
                                : "bg-card/70 border-border text-muted-foreground"
                            }`}>
                              <div className="flex items-center justify-between font-bold">
                                <span className="flex items-center gap-1 font-mono-tech">
                                  <span>FACA</span>
                                  {facaActive && <span className="text-[10px] opacity-75 font-normal">(Cadastrada)</span>}
                                </span>
                                <span className="text-[11px]">
                                  {facaSent || markFacaSent ? "ENVIADA ✓" : facaActive ? "⚠️ PENDENTE" : "NÃO MARCADA"}
                                </span>
                              </div>
                              {!facaSent && (
                                <div className="flex items-center gap-2 pt-1 border-t border-border/50">
                                  <Checkbox
                                    id="saida-faca-sent"
                                    checked={markFacaSent}
                                    onCheckedChange={(v) => setMarkFacaSent(!!v)}
                                  />
                                  <Label htmlFor="saida-faca-sent" className="text-[11px] font-semibold text-foreground cursor-pointer">
                                    Marcar FACA como enviada
                                  </Label>
                                </div>
                              )}
                            </div>

                            {/* Clichê box */}
                            <div className={`p-2.5 rounded-lg border text-xs flex flex-col justify-between gap-1.5 transition-colors ${
                              clicheSent || markClicheSent
                                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-800 dark:text-emerald-300"
                                : clicheActive
                                ? "bg-amber-500/20 border-amber-500/50 text-amber-900 dark:text-amber-200"
                                : "bg-card/70 border-border text-muted-foreground"
                            }`}>
                              <div className="flex items-center justify-between font-bold">
                                <span className="flex items-center gap-1 font-mono-tech">
                                  <span>CLICHÊ</span>
                                  {clicheActive && <span className="text-[10px] opacity-75 font-normal">(Cadastrado)</span>}
                                </span>
                                <span className="text-[11px]">
                                  {clicheSent || markClicheSent ? "ENVIADO ✓" : clicheActive ? "⚠️ PENDENTE" : "NÃO MARCADO"}
                                </span>
                              </div>
                              {!clicheSent && (
                                <div className="flex items-center gap-2 pt-1 border-t border-border/50">
                                  <Checkbox
                                    id="saida-cliche-sent"
                                    checked={markClicheSent}
                                    onCheckedChange={(v) => setMarkClicheSent(!!v)}
                                  />
                                  <Label htmlFor="saida-cliche-sent" className="text-[11px] font-semibold text-foreground cursor-pointer">
                                    Marcar CLICHÊ como enviado
                                  </Label>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-start gap-2 pt-2 border-t border-rose-500/30">
                            <Checkbox
                              id="saida-agree-supplies"
                              checked={agreedSaidaSupplies}
                              onCheckedChange={(v) => setAgreedSaidaSupplies(!!v)}
                              className="mt-0.5 border-rose-500 data-[state=checked]:bg-rose-600 data-[state=checked]:border-rose-600"
                            />
                            <Label htmlFor="saida-agree-supplies" className="text-xs font-bold text-foreground cursor-pointer leading-snug">
                              Concordo e confirmo que verifiquei se enviou ou não a FACA e o CLICHÊ (enviados ou não aplicáveis para esta O.S.) para liberar para SAÍDA.
                            </Label>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelMove}>Cancelar</AlertDialogCancel>
            {(() => {
              const isTargetSaida = pendingMove?.toStatus === "arquivo_liberado" || (pendingMove?.toStatus as string) === "saida";
              const currentOrder = orders.find((o) => o.id === pendingMove?.id);
              const facaSent = isSpecialSupplySent(currentOrder?.processos, "FACA");
              const clicheSent = isSpecialSupplySent(currentOrder?.processos, "CLICHE");
              const requiresAgreement = isTargetSaida && (!facaSent || !clicheSent);
              const isDisabled = requiresAgreement && !agreedSaidaSupplies;

              return (
                <AlertDialogAction
                  onClick={confirmMove}
                  disabled={isDisabled}
                  className={isDisabled ? "opacity-50 cursor-not-allowed" : ""}
                >
                  Confirmar
                </AlertDialogAction>
              );
            })()}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DragDropContext>
  );
}
