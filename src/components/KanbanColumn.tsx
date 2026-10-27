import { Order, OrderStatus, STATUS_CONFIG } from "@/types/order";
import { Department } from "@/types/production";
import { OrderCard } from "./OrderCard";
import { Droppable, Draggable } from "@hello-pangea/dnd";
import {
  LucideIcon,
  FileEdit,
  Printer,
  Clock,
  FileQuestion,
  CheckCircle2,
  ArrowRight,
  Wrench,
  AlertTriangle,
  Mail,
} from "lucide-react";
import { useMemo } from "react";
import { useUnreadEmailReplies } from "@/hooks/useUnreadEmailReplies";
import { createPortal } from "react-dom";

const PRE_PRESS_STATUS_ICONS: Record<OrderStatus, LucideIcon> = {
  fila_de_entrada: ArrowRight,
  paralisado: AlertTriangle,
  preparando_arquivo: Wrench,
  aguardando_novo_arquivo: AlertTriangle,
  operador_2: FileEdit,
  operador_3: FileEdit,
  aguardando_prova: Printer,
  aguardando_aprovacao: Clock,
  arquivo_liberado: CheckCircle2,
};

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

interface KanbanColumnProps {
  status: OrderStatus;
  orders: Order[];
  onUpdate: (id: string, data: Partial<Order>) => void;
  onMove: (id: string, status: OrderStatus, newIndex?: number) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate?: (order: Order) => void;
  onSendToProduction?: (
    id: string,
    department: Department,
    machine?: string
  ) => void;
  onSendToMultipleProduction?: (
    id: string,
    departments: { department: Department; machine?: string }[]
  ) => void;
  onSendToExpedicao?: (id: string) => void;
  onSendToCompras?: (id: string, processos?: string[]) => void;
  getProfileName: (userId: string | null) => string | null;
  permissions: Permissions;
  departmentContext?: string;
  slowAlertIds?: Set<string>;
}

/**
 * Quando isDragging=true, teletransporta o nó filho (incluindo o innerRef)
 * para document.body. Isso remove a influência do backdrop-filter das colunas,
 * que criava um novo "containing block" para position:fixed e deslocava o card.
 * A classe drag-portal-item garante fundo sólido (sem transparência).
 */
function PortalDrag({
  isDragging,
  children,
}: {
  isDragging: boolean;
  children: React.ReactNode;
}) {
  if (isDragging) {
    return createPortal(
      <div className="drag-portal-item">{children}</div>,
      document.body
    );
  }
  return <>{children}</>;
}

export function KanbanColumn({
  status,
  orders,
  onUpdate,
  onMove,
  onArchive,
  onDelete,
  onDuplicate,
  onSendToProduction,
  onSendToMultipleProduction,
  onSendToExpedicao,
  onSendToCompras,
  getProfileName,
  permissions,
  departmentContext,
  slowAlertIds,
}: KanbanColumnProps) {
  const config = STATUS_CONFIG[status];
  const canDrag =
    !permissions.isViewOnly &&
    (permissions.canReorderEntry || permissions.canAdvanceCards);
  const StatusIcon = PRE_PRESS_STATUS_ICONS[status];

  const { getUnreadCountForOrders, getVerifiedCountForOrders } = useUnreadEmailReplies();
  const columnOrderIds = useMemo(() => orders.map((o) => o.id), [orders]);
  const unreadEmailCount = getUnreadCountForOrders(columnOrderIds);
  const verifiedEmailCount = getVerifiedCountForOrders(columnOrderIds);

  return (
    <div className="flex-shrink-0 w-[82vw] sm:w-[290px] flex flex-col rounded-2xl glass-bento transition-all min-h-full h-fit">
      <div className="flex items-center gap-2.5 px-3.5 py-3 border-b border-border/60 dark:border-[#4A5C6A]/25 flex-shrink-0 rounded-t-2xl bg-muted/30 dark:bg-[#11212D]/40">
        <div
          className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border"
          style={{
            backgroundColor: `hsl(var(--status-${config.colorKey}) / 0.12)`,
            borderColor: `hsl(var(--status-${config.colorKey}) / 0.25)`,
          }}
        >
          <StatusIcon
            className="w-3.5 h-3.5"
            style={{ color: `hsl(var(--status-${config.colorKey}))` }}
          />
        </div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-foreground font-mono-tech truncate flex-1">
          {config.label}
        </h3>

        {/* Indicador de respostas de e-mail na coluna: Âmbar quando não lida, VERDE quando verificada */}
        {unreadEmailCount > 0 ? (
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-500 border border-amber-500/40 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.5)] shrink-0"
            title={`${unreadEmailCount} O.S. com resposta de e-mail não lida nesta coluna`}
          >
            <Mail className="h-3 w-3 fill-amber-500/30" />
            <span>{unreadEmailCount}</span>
          </span>
        ) : verifiedEmailCount > 0 ? (
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 shadow-[0_0_8px_rgba(16,185,129,0.3)] shrink-0"
            title={`${verifiedEmailCount} O.S. com e-mails verificados pelo operador nesta coluna`}
          >
            <Mail className="h-3 w-3 fill-emerald-500/30 text-emerald-600 dark:text-emerald-400" />
            <span>{verifiedEmailCount}</span>
          </span>
        ) : null}

        <span
          className="text-[11px] font-mono-tech font-bold rounded-full px-2 py-0.5 border"
          style={{
            backgroundColor: `hsl(var(--status-${config.colorKey}) / 0.1)`,
            borderColor: `hsl(var(--status-${config.colorKey}) / 0.25)`,
            color: `hsl(var(--status-${config.colorKey}))`,
          }}
        >
          {orders.length}
        </span>
      </div>

      <Droppable droppableId={status}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 space-y-2.5 p-2.5 pb-6 transition-all duration-200 ${
              snapshot.isDraggingOver
                ? "bg-[#253745]/30 ring-2 ring-[#9BA8AB]/40 rounded-b-2xl"
                : ""
            }`}
            style={{ minHeight: "130px" }}
          >
            {orders.length === 0 && !snapshot.isDraggingOver && (
              <div className="h-24 rounded-xl border border-dashed border-border/60 flex items-center justify-center text-[11px] text-muted-foreground/60 select-none">
                Sem ordens
              </div>
            )}
            {orders.map((order, index) => (
              <Draggable
                key={order.id}
                draggableId={order.id}
                index={index}
                isDragDisabled={!canDrag}
              >
                {(provided, snapshot) => (
                  <PortalDrag isDragging={snapshot.isDragging}>
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      style={provided.draggableProps.style}
                    >
                      <OrderCard
                        order={order}
                        onUpdate={onUpdate}
                        onMove={onMove}
                        onArchive={onArchive}
                        onDelete={onDelete}
                        onDuplicate={onDuplicate}
                        onSendToProduction={onSendToProduction}
                        onSendToMultipleProduction={onSendToMultipleProduction}
                        onSendToExpedicao={onSendToExpedicao}
                        onSendToCompras={onSendToCompras}
                        dragHandleProps={
                          canDrag
                            ? (provided.dragHandleProps as unknown as Record<
                                string,
                                unknown
                              >)
                            : undefined
                        }
                        updatedByName={getProfileName(order.atualizado_por)}
                        createdByName={getProfileName(order.criado_por)}
                        permissions={permissions}
                        departmentContext={departmentContext}
                        isSlowAlert={slowAlertIds?.has(order.id)}
                      />
                    </div>
                  </PortalDrag>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}
