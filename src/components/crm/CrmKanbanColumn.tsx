import React, { useMemo } from "react";
import { Droppable } from "@hello-pangea/dnd";
import { CrmOpportunity, CrmStage, formatCurrency } from "@/types/crm";
import { CrmOpportunityCard } from "./CrmOpportunityCard";
import { Plus, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface CrmKanbanColumnProps {
  stage: CrmStage;
  opportunities: CrmOpportunity[];
  onSelectOpportunity: (opportunity: CrmOpportunity) => void;
  onAddOpportunityAtStage?: (stageId: string) => void;
  onMarkWon?: (id: string) => void;
  onMarkLost?: (opportunity: CrmOpportunity) => void;
  onScheduleActivity?: (opportunity: CrmOpportunity) => void;
  onArchive?: (id: string, arquivado: boolean) => void;
  onDelete?: (opportunity: CrmOpportunity) => void;
}

export function CrmKanbanColumn({
  stage,
  opportunities,
  onSelectOpportunity,
  onAddOpportunityAtStage,
  onMarkWon,
  onMarkLost,
  onScheduleActivity,
  onArchive,
  onDelete,
}: CrmKanbanColumnProps) {
  // Total financeiro da coluna
  const totalValue = useMemo(() => {
    return opportunities.reduce((acc, o) => acc + (Number(o.valor_estimado) || 0), 0);
  }, [opportunities]);

  return (
    <div className="flex flex-col flex-shrink-0 w-80 max-h-full rounded-2xl border border-border/80 bg-muted/20 backdrop-blur-md shadow-xs overflow-hidden">
      {/* Coluna Header */}
      <div className="p-3.5 border-b border-border/60 bg-muted/40">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="w-3 h-3 rounded-full shrink-0 shadow-xs"
              style={{ backgroundColor: stage.cor }}
            />
            <h3 className="font-bold text-sm text-foreground truncate" title={stage.nome}>
              {stage.nome}
            </h3>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Badge
              variant="secondary"
              className="text-xs font-mono-tech font-bold px-2 py-0.5 rounded-full"
            >
              {opportunities.length}
            </Badge>
            {onAddOpportunityAtStage && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onAddOpportunityAtStage(stage.id)}
                className="h-6 w-6 text-muted-foreground hover:text-foreground rounded-lg"
                title={`Adicionar oportunidade em ${stage.nome}`}
              >
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Total da etapa em R$ */}
        <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground font-mono-tech">
          <span>Total na etapa:</span>
          <span className="font-bold text-foreground">{formatCurrency(totalValue)}</span>
        </div>
      </div>

      {/* Droppable Card List */}
      <Droppable droppableId={stage.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 p-2.5 space-y-2.5 overflow-y-auto min-h-[160px] transition-colors duration-150 ${
              snapshot.isDraggingOver
                ? "bg-primary/5 ring-1 ring-primary/30 rounded-b-2xl"
                : "bg-transparent"
            }`}
          >
            {opportunities.map((opp, idx) => (
              <CrmOpportunityCard
                key={opp.id}
                opportunity={opp}
                index={idx}
                onSelect={onSelectOpportunity}
                onMarkWon={onMarkWon}
                onMarkLost={onMarkLost}
                onScheduleActivity={onScheduleActivity}
                onArchive={onArchive}
                onDelete={onDelete}
              />
            ))}
            {provided.placeholder}

            {opportunities.length === 0 && !snapshot.isDraggingOver && (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center border-2 border-dashed border-border/40 rounded-xl text-muted-foreground/60">
                <p className="text-xs font-medium">Nenhuma oportunidade</p>
                <p className="text-[11px] mt-0.5">Arraste para cá ou adicione um novo lead</p>
              </div>
            )}
          </div>
        )}
      </Droppable>
    </div>
  );
}
