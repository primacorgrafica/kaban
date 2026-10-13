import { Order, OrderStatus, STATUS_CONFIG } from "@/types/order";
import { Department } from "@/types/production";
import { OrderCard } from "./OrderCard";
import { Droppable, Draggable } from "@hello-pangea/dnd";
import { LucideIcon, Inbox, FileEdit, Printer, Clock, FileQuestion, CheckCircle2, ArrowRight } from "lucide-react";

const PRE_PRESS_STATUS_ICONS: Record<OrderStatus, LucideIcon> = {
  fila_de_entrada: ArrowRight,
  aguardando_novo_arquivo: FileQuestion,
  preparando_arquivo: FileEdit,
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
  onSendToProduction?: (id: string, department: Department, machine?: string) => void;
  onSendToMultipleProduction?: (id: string, departments: { department: Department; machine?: string }[]) => void;
  onSendToExpedicao?: (id: string) => void;
  getProfileName: (userId: string | null) => string | null;
  permissions: Permissions;
  departmentContext?: string;
  slowAlertIds?: Set<string>;
}

export function KanbanColumn({ status, orders, onUpdate, onMove, onArchive, onDelete, onDuplicate, onSendToProduction, onSendToMultipleProduction, onSendToExpedicao, getProfileName, permissions, departmentContext, slowAlertIds }: KanbanColumnProps) {
  const config = STATUS_CONFIG[status];
  const canDrag = !permissions.isViewOnly && (permissions.canReorderEntry || permissions.canAdvanceCards);
  const StatusIcon = PRE_PRESS_STATUS_ICONS[status];

  return (
    <div className="flex-shrink-0 w-[80vw] sm:w-72 flex flex-col rounded-2xl bg-slate-900/40 backdrop-blur-xl border border-slate-800/80 shadow-lg min-h-full h-fit">
      <div
        className="flex items-center gap-2.5 px-3.5 py-3 border-b flex-shrink-0 rounded-t-2xl"
        style={{
          backgroundColor: `hsl(var(--status-${config.colorKey}-bg))`,
          borderColor: `hsl(var(--status-${config.colorKey}) / 0.25)`,
        }}
      >
        <div
          className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: `hsl(var(--status-${config.colorKey}) / 0.15)` }}
        >
          <StatusIcon
            className="w-3.5 h-3.5"
            style={{ color: `hsl(var(--status-${config.colorKey}))` }}
          />
        </div>
        <h3 className="text-xs font-bold uppercase tracking-wider font-mono-tech truncate" style={{ color: `hsl(var(--status-${config.colorKey}))` }}>
          {config.label}
        </h3>
        <span
          className="text-[11px] ml-auto rounded-full px-2 py-0.5 font-bold font-mono-tech border"
          style={{
            backgroundColor: `hsl(var(--status-${config.colorKey}) / 0.15)`,
            borderColor: `hsl(var(--status-${config.colorKey}) / 0.3)`,
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
            className={`flex-1 space-y-2 p-2.5 pb-6 transition-colors duration-200 ${
              snapshot.isDraggingOver ? "bg-cyan-500/5 ring-1 ring-cyan-500/30" : ""
            }`}
            style={{ minHeight: "120px" }}
          >
            {orders.map((order, index) => (
              <Draggable key={order.id} draggableId={order.id} index={index} isDragDisabled={!canDrag}>
                {(provided) => (
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
                      dragHandleProps={canDrag ? (provided.dragHandleProps as unknown as Record<string, unknown>) : undefined}
                      updatedByName={getProfileName(order.atualizado_por)}
                      createdByName={getProfileName(order.criado_por)}
                       permissions={permissions}
                       departmentContext={departmentContext}
                       isSlowAlert={slowAlertIds?.has(order.id)}
                     />
                  </div>
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
