import React, { useState, useMemo } from "react";
import {
  CrmOpportunity,
  CrmStage,
  STATUS_CONFIG_CRM,
  PRIORITY_CONFIG,
  formatCurrency,
} from "@/types/crm";
import {
  Archive,
  ArchiveRestore,
  Search,
  Building,
  User,
  Calendar,
  X,
  FileText,
  AlertCircle,
  Trash2,
  TrendingDown,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
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

interface CrmArchivedViewProps {
  opportunities: CrmOpportunity[];
  stages: CrmStage[];
  onSelectOpportunity: (opportunity: CrmOpportunity) => void;
  onUnarchive: (opportunityId: string) => void;
  onDeleteOpportunity?: (opportunity: CrmOpportunity) => void;
  onBackToFunil?: () => void;
}

export function CrmArchivedView({
  opportunities,
  stages,
  onSelectOpportunity,
  onUnarchive,
  onDeleteOpportunity,
  onBackToFunil,
}: CrmArchivedViewProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [vendedorFilter, setVendedorFilter] = useState<string>("todos");
  const [deleteTarget, setDeleteTarget] = useState<CrmOpportunity | null>(null);

  // Filtra apenas as oportunidades arquivadas
  const archivedList = useMemo(() => {
    return opportunities.filter((o) => Boolean(o.arquivado));
  }, [opportunities]);

  // Lista de vendedores únicos nas arquivadas
  const vendedores = useMemo(() => {
    const set = new Set<string>();
    archivedList.forEach((o) => {
      if (o.vendedor_nome) set.add(o.vendedor_nome);
    });
    return Array.from(set).sort();
  }, [archivedList]);

  // Aplicação dos filtros de busca, status e vendedor
  const filteredList = useMemo(() => {
    return archivedList.filter((o) => {
      if (search) {
        const q = search.toLowerCase();
        const matchTitle = o.titulo.toLowerCase().includes(q);
        const matchClient = o.cliente_nome.toLowerCase().includes(q);
        const matchService = o.servico_solicitado.toLowerCase().includes(q);
        const matchCode = (o.codigo_identificador || `OPT-${o.numero_sequencial}`).toLowerCase().includes(q);
        if (!matchTitle && !matchClient && !matchService && !matchCode) return false;
      }

      if (statusFilter !== "todos" && o.status !== statusFilter) {
        return false;
      }

      if (vendedorFilter !== "todos" && o.vendedor_nome !== vendedorFilter) {
        return false;
      }

      return true;
    });
  }, [archivedList, search, statusFilter, vendedorFilter]);

  // Métricas do arquivo
  const metrics = useMemo(() => {
    const totalValor = archivedList.reduce((acc, o) => acc + (Number(o.valor_estimado) || 0), 0);
    const ganhas = archivedList.filter((o) => o.status === "fechada_ganha").length;
    const perdidas = archivedList.filter((o) => o.status === "fechada_perdida").length;
    return {
      total: archivedList.length,
      totalValor,
      ganhas,
      perdidas,
    };
  }, [archivedList]);

  const getStageName = (stageId: string) => {
    const stage = stages.find((s) => s.id === stageId);
    return stage ? stage.nome : "Funil";
  };

  return (
    <div className="flex flex-col h-full space-y-4 font-pcp">
      {/* 1. Header com Totais e Ações Rápidas */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl border border-border/70 bg-card shadow-2xs">
        <div className="flex items-center gap-3 sm:gap-6 flex-wrap">
          <div className="flex items-center gap-2.5">
            <span className="p-2.5 rounded-xl bg-[#253745] text-[#CCD0CF] border border-[#4A5C6A]/50">
              <Archive className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-foreground">
                  Vendas & Cards Arquivados
                </h3>
                <Badge variant="secondary" className="font-pcp text-xs px-2 py-0.5">
                  {metrics.total}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Histórico completo de negociações finalizadas ou arquivadas.
              </p>
            </div>
          </div>

          <div className="h-8 w-px bg-border/60 hidden md:block" />

          <div className="flex items-center gap-4 text-xs font-pcp">
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Volume Total</span>
              <span className="font-bold text-foreground text-sm">{formatCurrency(metrics.totalValor)}</span>
            </div>
            {metrics.ganhas > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>{metrics.ganhas} Ganhas</span>
              </div>
            )}
            {metrics.perdidas > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <XCircle className="h-3.5 w-3.5" />
                <span>{metrics.perdidas} Perdidas</span>
              </div>
            )}
          </div>
        </div>

        {onBackToFunil && (
          <Button
            variant="outline"
            size="sm"
            onClick={onBackToFunil}
            className="rounded-xl text-xs gap-1.5 border-border hover:border-primary/50 cursor-pointer"
          >
            Voltar ao Funil Ativo
          </Button>
        )}
      </div>

      {/* 2. Filtros de Busca */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por cliente, título, serviço ou código..."
            className="h-9 pl-9 text-xs rounded-xl bg-card border-border text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-primary"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-40 text-xs rounded-xl bg-card border-border text-foreground">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border">
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="fechada_ganha">Venda Ganha</SelectItem>
            <SelectItem value="fechada_perdida">Perdida</SelectItem>
            <SelectItem value="aberta">Em Aberto</SelectItem>
            <SelectItem value="pausada">Pausada</SelectItem>
          </SelectContent>
        </Select>

        {vendedores.length > 0 && (
          <Select value={vendedorFilter} onValueChange={setVendedorFilter}>
            <SelectTrigger className="h-9 w-44 text-xs rounded-xl bg-card border-border text-foreground">
              <SelectValue placeholder="Vendedor" />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              <SelectItem value="todos">Todos os vendedores</SelectItem>
              {vendedores.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {(search || statusFilter !== "todos" || vendedorFilter !== "todos") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setStatusFilter("todos");
              setVendedorFilter("todos");
            }}
            className="h-9 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          >
            Limpar Filtros
          </Button>
        )}
      </div>

      {/* 3. Lista de Oportunidades Arquivadas */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-2.5">
        {filteredList.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-border/50 rounded-2xl bg-card/40 my-4">
            <div className="p-3.5 rounded-full bg-muted/60 text-muted-foreground mb-3">
              <Archive className="h-7 w-7 opacity-60" />
            </div>
            <h4 className="text-sm font-semibold text-foreground">
              {archivedList.length === 0
                ? "Nenhuma oportunidade arquivada no momento"
                : "Nenhum resultado encontrado para os filtros aplicados"}
            </h4>
            <p className="text-xs text-muted-foreground max-w-sm mt-1">
              {archivedList.length === 0
                ? "Quando arquivar um card ou venda no funil comercial, ele será listado aqui e poderá ser desarquivado a qualquer instante."
                : "Tente ajustar o termo de busca ou redefinir os filtros acima."}
            </p>
          </div>
        ) : (
          filteredList.map((opp) => {
            const priority = PRIORITY_CONFIG[opp.prioridade] || PRIORITY_CONFIG.media;
            const statusCfg = STATUS_CONFIG_CRM[opp.status] || STATUS_CONFIG_CRM.aberta;
            const isLost = opp.status === "fechada_perdida";

            return (
              <div
                key={opp.id}
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5 p-4 rounded-xl border border-border bg-card hover:border-primary/40 transition-all shadow-2xs"
              >
                {/* Informações Principais */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-pcp font-bold text-muted-foreground bg-muted/80 px-2 py-0.5 rounded border border-border/60">
                      {opp.codigo_identificador || `OPT-${opp.numero_sequencial}`}
                    </span>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusCfg.badgeClass}`}>
                      {statusCfg.label}
                    </Badge>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${priority.badgeClass}`}>
                      {priority.label}
                    </Badge>
                    <span className="text-xs font-pcp text-muted-foreground">
                      Etapa: <strong className="text-foreground">{getStageName(opp.etapa_id)}</strong>
                    </span>
                  </div>

                  <div className="flex items-baseline gap-2 flex-wrap">
                    <h4
                      onClick={() => onSelectOpportunity(opp)}
                      className="text-sm font-bold text-foreground hover:text-primary transition-colors cursor-pointer"
                    >
                      {opp.titulo}
                    </h4>
                    {opp.servico_solicitado && (
                      <span className="text-xs text-muted-foreground">
                        • {opp.servico_solicitado}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                    <div className="flex items-center gap-1 text-foreground font-medium">
                      <Building className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate">{opp.cliente_nome}</span>
                    </div>

                    {opp.vendedor_nome && (
                      <div className="flex items-center gap-1">
                        <User className="h-3.5 w-3.5 shrink-0" />
                        <span>{opp.vendedor_nome}</span>
                      </div>
                    )}

                    {opp.created_at && (
                      <div className="flex items-center gap-1 font-pcp text-[11px]">
                        <Calendar className="h-3 w-3 shrink-0" />
                        <span>{format(new Date(opp.created_at), "dd/MM/yyyy", { locale: ptBR })}</span>
                      </div>
                    )}
                  </div>

                  {/* Alerta de Motivo de Perda se a venda foi perdida */}
                  {isLost && (
                    <div className="mt-2 inline-flex items-center gap-2 p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        <strong>Motivo da perda:</strong> {opp.motivo_perda || "Não informado"}
                        {opp.detalhes_motivo_perda ? ` — ${opp.detalhes_motivo_perda}` : ""}
                      </span>
                    </div>
                  )}
                </div>

                {/* Valor e Botões de Ação */}
                <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/50">
                  <div className="text-left sm:text-right">
                    <span className="text-[10px] text-muted-foreground block font-pcp uppercase">
                      Valor Estimado
                    </span>
                    <span className="text-base font-bold font-pcp text-foreground">
                      {formatCurrency(opp.valor_estimado)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Botão Principal: Desarquivar */}
                    <Button
                      size="sm"
                      onClick={() => onUnarchive(opp.id)}
                      className="gap-1.5 text-xs bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#CCD0CF] dark:hover:bg-white dark:text-[#06141B] font-semibold rounded-xl shadow-xs cursor-pointer"
                      title="Restaurar Oportunidade para o Funil Ativo"
                    >
                      <ArchiveRestore className="h-3.5 w-3.5" />
                      <span>Desarquivar</span>
                    </Button>

                    {/* Botão Ver Detalhes */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onSelectOpportunity(opp)}
                      className="gap-1 text-xs rounded-xl border-border text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Detalhes</span>
                    </Button>

                    {/* Botão Excluir */}
                    {onDeleteOpportunity && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTarget(opp)}
                        className="h-8 w-8 text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 rounded-xl cursor-pointer"
                        title="Excluir Definitivamente"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Confirmação de Exclusão */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="max-w-md bg-card border-border rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-bold text-foreground">
              Excluir Oportunidade Arquivada
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground">
              Tem certeza que deseja excluir permanentemente a oportunidade{" "}
              <strong className="text-foreground">"{deleteTarget?.titulo}"</strong>?
              Esta ação removerá todo o histórico e propostas associadas e não poderá ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-xl text-xs cursor-pointer">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget && onDeleteOpportunity) {
                  onDeleteOpportunity(deleteTarget);
                  setDeleteTarget(null);
                }
              }}
              className="rounded-xl text-xs bg-rose-600 hover:bg-rose-500 text-white cursor-pointer"
            >
              Sim, Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
