import React from "react";
import { createPortal } from "react-dom";
import { Draggable } from "@hello-pangea/dnd";
import {
  CrmOpportunity,
  PRIORITY_CONFIG,
  STATUS_CONFIG_CRM,
  formatCurrency,
  isFollowUpLate,
  isFollowUpToday,
} from "@/types/crm";
import {
  Building,
  User,
  Calendar,
  AlertTriangle,
  Clock,
  Phone,
  ArrowRight,
  MoreVertical,
  CheckCircle2,
  XCircle,
  FileText,
  DollarSign,
  MessageCircle,
  Archive,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface CrmOpportunityCardProps {
  opportunity: CrmOpportunity;
  index: number;
  onSelect: (opportunity: CrmOpportunity) => void;
  onMarkWon?: (id: string) => void;
  onMarkLost?: (opportunity: CrmOpportunity) => void;
  onScheduleActivity?: (opportunity: CrmOpportunity) => void;
  onArchive?: (id: string, arquivado: boolean) => void;
  onDelete?: (opportunity: CrmOpportunity) => void;
}

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

export function CrmOpportunityCard({
  opportunity,
  index,
  onSelect,
  onMarkWon,
  onMarkLost,
  onScheduleActivity,
  onArchive,
  onDelete,
}: CrmOpportunityCardProps) {
  const isLate = isFollowUpLate(opportunity.proxima_acao_data);
  const isToday = isFollowUpToday(opportunity.proxima_acao_data);
  const priority = PRIORITY_CONFIG[opportunity.prioridade] || PRIORITY_CONFIG.media;

  const cleanPhone = opportunity.contato_telefone
    ? opportunity.contato_telefone.replace(/\D/g, "")
    : "";

  return (
    <Draggable draggableId={opportunity.id} index={index}>
      {(provided, snapshot) => (
        <PortalDrag isDragging={snapshot.isDragging}>
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            style={provided.draggableProps.style}
            onClick={() => onSelect(opportunity)}
            className={`group relative rounded-xl border p-3.5 shadow-xs transition-all duration-200 cursor-pointer select-none ${
              snapshot.isDragging
                ? "!opacity-100 !bg-slate-900 dark:!bg-slate-900 bg-card ring-2 ring-primary shadow-2xl scale-[1.02] z-[9999]"
                : "bg-card hover:border-primary/50 hover:shadow-md"
            } ${
              isLate && opportunity.status === "aberta"
                ? "border-rose-500/50 dark:border-rose-500/40 bg-rose-500/[0.02]"
                : "border-border/80"
            }`}
          >
          {/* Top Header: Código + Prioridade + Menu */}
          <div className="flex items-center justify-between gap-1.5 mb-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[11px] font-mono-tech font-bold text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded border border-border/50">
                {opportunity.codigo_identificador || `OPT-${opportunity.numero_sequencial}`}
              </span>
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 font-medium ${priority.badgeClass}`}
              >
                {priority.label}
              </Badge>
              {opportunity.arquivado && (
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 font-medium bg-slate-500/15 text-slate-400 border-slate-500/30 gap-1"
                >
                  <Archive className="h-2.5 w-2.5" />
                  Concluída
                </Badge>
              )}
              {opportunity.origem_lead && (
                <span className="text-[10px] text-muted-foreground/80 truncate hidden sm:inline">
                  • {opportunity.origem_lead}
                </span>
              )}
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground opacity-60 group-hover:opacity-100 transition-opacity"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 bg-popover border-border">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(opportunity);
                  }}
                >
                  <FileText className="h-4 w-4 mr-2 text-cyan-400" />
                  Abrir Detalhes
                </DropdownMenuItem>
                {onScheduleActivity && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onScheduleActivity(opportunity);
                    }}
                  >
                    <Clock className="h-4 w-4 mr-2 text-amber-400" />
                    Agendar Follow-up
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                {onMarkWon && opportunity.status !== "fechada_ganha" && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onMarkWon(opportunity.id);
                    }}
                    className="text-emerald-500 focus:text-emerald-400"
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Marcar como Ganha
                  </DropdownMenuItem>
                )}
                {onMarkLost && opportunity.status !== "fechada_perdida" && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onMarkLost(opportunity);
                    }}
                    className="text-rose-500 focus:text-rose-400"
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Marcar como Perdida
                  </DropdownMenuItem>
                )}

                {/* Arquivar / Restaurar */}
                {onArchive && (opportunity.status === "fechada_ganha" || opportunity.convertida_os_id || opportunity.arquivado) && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onArchive(opportunity.id, !opportunity.arquivado);
                    }}
                    className="text-cyan-400 focus:text-cyan-300"
                  >
                    <Archive className="h-4 w-4 mr-2" />
                    {opportunity.arquivado ? "Restaurar ao Funil" : "Arquivar Venda"}
                  </DropdownMenuItem>
                )}

                {/* Excluir Card */}
                {onDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(opportunity);
                      }}
                      className="text-rose-500 focus:text-rose-400"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Excluir Oportunidade
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Título da Oportunidade */}
          <h4 className="text-sm font-semibold text-foreground line-clamp-1 group-hover:text-primary transition-colors">
            {opportunity.titulo}
          </h4>

          {/* Cliente e Contato */}
          <div className="mt-1 space-y-0.5">
            <div className="flex items-center gap-1.5 text-xs text-foreground/90 font-medium truncate">
              <Building className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="truncate">{opportunity.cliente_nome}</span>
            </div>

            {opportunity.contato_nome && (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground truncate">
                <User className="h-3 w-3 shrink-0" />
                <span className="truncate">{opportunity.contato_nome}</span>
                {opportunity.contato_telefone && (
                  <a
                    href={`https://wa.me/55${cleanPhone}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="ml-auto inline-flex items-center gap-1 text-[10px] text-emerald-500 hover:text-emerald-400 font-mono-tech"
                    title="Abrir WhatsApp"
                  >
                    <MessageCircle className="h-3 w-3" />
                    <span>WhatsApp</span>
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Serviço Gráfico Solicitado */}
          <p className="mt-2 text-xs text-muted-foreground line-clamp-1 bg-muted/40 px-2 py-1 rounded border border-border/40 font-mono-tech">
            {opportunity.servico_solicitado}
          </p>

          {/* Próximo Contato / Follow-up Alert */}
          {opportunity.status === "aberta" && (
            <div className="mt-2.5 pt-2 border-t border-border/40">
              {opportunity.proxima_acao_data ? (
                <div
                  className={`flex items-center justify-between text-[11px] rounded-lg px-2 py-1 ${
                    isLate
                      ? "bg-rose-500/15 text-rose-400 border border-rose-500/30 font-semibold animate-pulse"
                      : isToday
                      ? "bg-amber-500/15 text-amber-400 border border-amber-500/30 font-medium"
                      : "bg-muted/50 text-muted-foreground border border-border/40"
                  }`}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    {isLate ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                    ) : isToday ? (
                      <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    ) : (
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    )}
                    <span className="truncate">
                      {isLate ? "Atrasado: " : isToday ? "Hoje: " : "Próximo: "}
                      {opportunity.proxima_acao_descricao || "Follow-up"}
                    </span>
                  </div>
                  <span className="font-mono-tech shrink-0 ml-1">
                    {format(new Date(opportunity.proxima_acao_data), "dd/MM HH:mm")}
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-between text-[11px] text-muted-foreground/60 py-0.5">
                  <span className="italic text-[10px]">Sem follow-up agendado</span>
                  {onScheduleActivity && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onScheduleActivity(opportunity);
                      }}
                      className="text-[10px] text-primary hover:underline font-medium"
                    >
                      + Agendar
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Footer: Valor Estimado + Vendedor */}
          <div className="mt-3 pt-2.5 border-t border-border/60 flex items-center justify-between gap-2">
            <div>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">
                Valor Estimado
              </span>
              <span className="text-sm font-bold font-mono-tech text-foreground group-hover:text-primary transition-colors">
                {formatCurrency(opportunity.valor_estimado)}
              </span>
            </div>

            <div className="text-right">
              <span className="text-[10px] text-muted-foreground block truncate max-w-[100px]">
                {opportunity.vendedor_nome || "Não atribuído"}
              </span>
              {opportunity.prazo_fechamento_previsto && (
                <span className="text-[10px] font-mono-tech text-muted-foreground/80 block">
                  Prev: {format(new Date(opportunity.prazo_fechamento_previsto), "dd/MM/yy")}
                </span>
              )}
            </div>
          </div>
        </PortalDrag>
      )}
    </Draggable>
  );
}
