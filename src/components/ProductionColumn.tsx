import { Order } from "@/types/order";
import {
  DepartmentStatusConfig,
  DepartmentConfig,
  Department,
} from "@/types/production";
import { ProductionCard } from "./ProductionCard";
import { ManutencaoCard } from "./ManutencaoCard";
import { ComprasCard } from "./ComprasCard";

import { Droppable, Draggable } from "@hello-pangea/dnd";
import {
  LucideIcon,
  Inbox,
  Layers,
  Search,
  CircleDot,
  Film,
  LogOut,
  Lightbulb,
  Hammer,
  CheckCircle,
  Printer as PrinterIcon,
  Scissors,
  FoldVertical,
  BookOpen,
  Ruler,
  Hand,
  Droplets,
  Flame,
  Grid3X3,
  Users,
  Star,
  Box,
  Wrench,
  Sun,
  Sunset,
  ArrowRight,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { OffsetIcon } from "./icons/OffsetIcon";
import { createPortal } from "react-dom";

const STATUS_ICONS: Record<string, LucideIcon> = {
  entrada: ArrowRight,
  paralisado: AlertTriangle,
  preparacao: Wrench,
  aguardando_novo_arquivo: AlertTriangle,
  aguardando_prova: PrinterIcon,
  aguardando_aprovacao: Clock,
  gravando: CircleDot,
  gravacao: CircleDot,
  imposicao: Layers,
  conferencia: Search,
  filme_faca_cliche: Film,
  saida: LogOut,
  desenvolvimento: Lightbulb,
  confeccao: Hammer,
  finalizado: CheckCircle,
  ryobi_524: OffsetIcon as any,
  ryobi_685: OffsetIcon as any,
  ryobi_754: OffsetIcon as any,
  komori_s29: OffsetIcon as any,
  digital_color: PrinterIcon,
  pb: PrinterIcon,
  plotter: Scissors,
  impressao: PrinterIcon,
  alceadeira: Layers,
  dobra: FoldVertical,
  capa_dura: BookOpen,
  vincadeira: Ruler,
  manual: Hand,
  laminacao: Droplets,
  hot_stamping: Flame,
  corte_vinco: Grid3X3,
  corte_vinco_auto: Grid3X3,
  terceiros: Users,
  destaque: Star,
  cartucheira: Box,
  cola_pur: Droplets,
  producao: Wrench,
  rota_manha: Sun,
  rota_tarde: Sunset,
};

interface ProductionColumnProps {
  statusConfig: DepartmentStatusConfig;
  orders: Order[];
  department: DepartmentConfig;
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

export function ProductionColumn({
  statusConfig,
  orders,
  department,
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
}: ProductionColumnProps) {
  const droppableId = `${department.id}__${statusConfig.id}`;
  const StatusIcon = STATUS_ICONS[statusConfig.id] || Inbox;

  return (
    <div className="flex-shrink-0 w-[80vw] sm:w-72 flex flex-col rounded-2xl bg-slate-100/75 dark:bg-slate-900/40 backdrop-blur-xl border border-slate-200/90 dark:border-slate-800/80 shadow-xs dark:shadow-lg min-h-full h-fit">
      <div
        className="flex items-center gap-2.5 px-3.5 py-3 border-b flex-shrink-0 rounded-t-2xl"
        style={{
          backgroundColor: `hsl(var(--status-${statusConfig.colorKey}-bg))`,
          borderColor: `hsl(var(--status-${statusConfig.colorKey}) / 0.15)`,
        }}
      >
        <StatusIcon
          className="w-4 h-4 shrink-0"
          style={{ color: `hsl(var(--status-${statusConfig.colorKey}))` }}
        />
        <h3
          className="text-sm font-semibold uppercase"
          style={{ color: `hsl(var(--status-${statusConfig.colorKey}))` }}
        >
          {statusConfig.label}
        </h3>
        <span
          className="text-xs ml-auto rounded-full px-2 py-0.5 font-bold"
          style={{
            backgroundColor: `hsl(var(--status-${statusConfig.colorKey}) / 0.15)`,
            color: `hsl(var(--status-${statusConfig.colorKey}))`,
          }}
        >
          {orders.length}
        </span>
      </div>

      <Droppable droppableId={droppableId}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 space-y-2 p-2.5 pb-6 transition-colors duration-200 ${
              snapshot.isDraggingOver ? "bg-primary/5" : ""
            }`}
            style={{ minHeight: "120px" }}
          >
            {orders.map((order, index) => (
              <Draggable
                key={order.id}
                draggableId={order.id}
                index={index}
                isDragDisabled={readOnly}
              >
                {(provided, snapshot) => (
                  <PortalDrag isDragging={snapshot.isDragging}>
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      style={provided.draggableProps.style}
                    >
                      {department.id === "compras" ? (
                        <ComprasCard
                          order={order}
                          department={department}
                          currentStatus={statusConfig}
                          onUpdate={onUpdate}
                          onMove={onMove}
                          onSendToDepartment={onSendToDepartment}
                          onSendBackToPrePress={onSendBackToPrePress}
                          onArchive={onArchive}
                          onDelete={onDelete}
                          dragHandleProps={
                            readOnly
                              ? undefined
                              : (provided.dragHandleProps as unknown as Record<
                                  string,
                                  unknown
                                >)
                          }
                          updatedByName={getProfileName(order.atualizado_por)}
                          createdByName={getProfileName(order.criado_por)}
                          readOnly={readOnly}
                        />
                      ) : department.id === "manutencao" ? (
                        <ManutencaoCard
                          order={order}
                          department={department}
                          currentStatus={statusConfig}
                          onUpdate={onUpdate}
                          onMove={onMove}
                          onSendToDepartment={onSendToDepartment}
                          onSendBackToPrePress={onSendBackToPrePress}
                          onArchive={onArchive}
                          onDelete={onDelete}
                          dragHandleProps={
                            readOnly
                              ? undefined
                              : (provided.dragHandleProps as unknown as Record<
                                  string,
                                  unknown
                                >)
                          }
                          updatedByName={getProfileName(order.atualizado_por)}
                          createdByName={getProfileName(order.criado_por)}
                          readOnly={readOnly}
                        />
                      ) : (
                        <ProductionCard
                          order={order}
                          department={department}
                          currentStatus={statusConfig}
                          onUpdate={onUpdate}
                          onMove={onMove}
                          onSendToDepartment={onSendToDepartment}
                          onSendBackToPrePress={onSendBackToPrePress}
                          onArchive={onArchive}
                          onDelete={onDelete}
                          dragHandleProps={
                            readOnly
                              ? undefined
                              : (provided.dragHandleProps as unknown as Record<
                                  string,
                                  unknown
                                >)
                          }
                          updatedByName={getProfileName(order.atualizado_por)}
                          createdByName={getProfileName(order.criado_por)}
                          readOnly={readOnly}
                          hasFaturamentoPendencia={
                            !!faturamentoPendenciaIds?.has(order.id)
                          }
                          parentSector={
                            parentSectorMap && order.parent_order_id
                              ? parentSectorMap[order.parent_order_id]
                              : undefined
                          }
                        />
                      )}
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
