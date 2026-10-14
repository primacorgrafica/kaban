import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { DragDropContext, DropResult } from "@hello-pangea/dnd";
import { CrmOpportunity, CrmStage, isFollowUpLate, isFollowUpToday, formatCurrency } from "@/types/crm";
import { CrmKanbanColumn } from "./CrmKanbanColumn";
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
import {
  Search,
  Plus,
  Filter,
  AlertTriangle,
  Clock,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  SlidersHorizontal,
  X,
} from "lucide-react";

interface CrmKanbanBoardProps {
  stages: CrmStage[];
  opportunities: CrmOpportunity[];
  onMoveStage: (opportunityId: string, targetStageId: string, newPos: number) => void;
  onSelectOpportunity: (opportunity: CrmOpportunity) => void;
  onNewOpportunity: (defaultStageId?: string) => void;
  onMarkWon?: (id: string) => void;
  onMarkLost?: (opportunity: CrmOpportunity) => void;
  onScheduleActivity?: (opportunity: CrmOpportunity) => void;
}

export function CrmKanbanBoard({
  stages,
  opportunities,
  onMoveStage,
  onSelectOpportunity,
  onNewOpportunity,
  onMarkWon,
  onMarkLost,
  onScheduleActivity,
}: CrmKanbanBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  // Filtros locais da visualização
  const [search, setSearch] = useState("");
  const [selectedVendedor, setSelectedVendedor] = useState<string>("todos");
  const [selectedPrioridade, setSelectedPrioridade] = useState<string>("todas");
  const [onlyAlerts, setOnlyAlerts] = useState<"todos" | "atrasados" | "hoje">("todos");

  // Lista de vendedores únicos presentes nas oportunidades
  const vendedoresList = useMemo(() => {
    const set = new Set<string>();
    opportunities.forEach((o) => {
      if (o.vendedor_nome) set.add(o.vendedor_nome);
    });
    return Array.from(set).sort();
  }, [opportunities]);

  // Aplicar filtros
  const filteredOpportunities = useMemo(() => {
    return opportunities.filter((o) => {
      // 1. Busca por texto
      if (search) {
        const q = search.toLowerCase();
        const matchTitle = o.titulo.toLowerCase().includes(q);
        const matchClient = o.cliente_nome.toLowerCase().includes(q);
        const matchService = o.servico_solicitado.toLowerCase().includes(q);
        const matchCode = (o.codigo_identificador || "").toLowerCase().includes(q);
        if (!matchTitle && !matchClient && !matchService && !matchCode) return false;
      }

      // 2. Vendedor
      if (selectedVendedor !== "todos" && o.vendedor_nome !== selectedVendedor) {
        return false;
      }

      // 3. Prioridade
      if (selectedPrioridade !== "todas" && o.prioridade !== selectedPrioridade) {
        return false;
      }

      // 4. Alertas de follow-up
      if (onlyAlerts === "atrasados") {
        if (!isFollowUpLate(o.proxima_acao_data) || o.status !== "aberta") return false;
      } else if (onlyAlerts === "hoje") {
        if (!isFollowUpToday(o.proxima_acao_data) || o.status !== "aberta") return false;
      }

      return true;
    });
  }, [opportunities, search, selectedVendedor, selectedPrioridade, onlyAlerts]);

  // Agrupamento por etapa
  const opportunitiesByStage = useMemo(() => {
    const map: Record<string, CrmOpportunity[]> = {};
    stages.forEach((st) => {
      map[st.id] = [];
    });
    filteredOpportunities.forEach((opp) => {
      if (map[opp.etapa_id]) {
        map[opp.etapa_id].push(opp);
      } else if (stages[0]) {
        map[stages[0].id].push(opp);
      }
    });

    // Ordenar pela posição dentro de cada etapa
    stages.forEach((st) => {
      map[st.id].sort((a, b) => a.posicao - b.posicao);
    });

    return map;
  }, [stages, filteredOpportunities]);

  // Resumos do topo
  const summary = useMemo(() => {
    const abertas = opportunities.filter((o) => o.status === "aberta");
    const totalPipeline = abertas.reduce((acc, o) => acc + (Number(o.valor_estimado) || 0), 0);
    const atrasadas = abertas.filter((o) => isFollowUpLate(o.proxima_acao_data)).length;
    const deHoje = abertas.filter((o) => isFollowUpToday(o.proxima_acao_data)).length;

    return {
      total: opportunities.length,
      abertasCount: abertas.length,
      totalPipeline,
      atrasadas,
      deHoje,
    };
  }, [opportunities]);

  // Manipulador de drag and drop
  const handleDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    onMoveStage(draggableId, destination.droppableId, destination.index);
  };

  // Scroll horizontal suave
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
  }, [updateScrollIndicators, stages]);

  const scrollLeft = () => {
    containerRef.current?.scrollBy({ left: -340, behavior: "smooth" });
  };

  const scrollRight = () => {
    containerRef.current?.scrollBy({ left: 340, behavior: "smooth" });
  };

  const hasActiveFilters =
    search !== "" ||
    selectedVendedor !== "todos" ||
    selectedPrioridade !== "todas" ||
    onlyAlerts !== "todos";

  const clearFilters = () => {
    setSearch("");
    setSelectedVendedor("todos");
    setSelectedPrioridade("todas");
    setOnlyAlerts("todos");
  };

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* 1. Barra de Métricas Rápidas & Ações */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl border border-border/70 bg-card shadow-2xs">
        <div className="flex items-center gap-3 sm:gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-cyan-500/10 text-cyan-500 border border-cyan-500/20">
              <TrendingUp className="h-4 w-4" />
            </span>
            <div>
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">
                Pipeline Aberto
              </span>
              <span className="text-base sm:text-lg font-bold font-mono-tech text-foreground">
                {formatCurrency(summary.totalPipeline)}
              </span>
            </div>
          </div>

          <div className="h-8 w-px bg-border/60 hidden sm:block" />

          <div className="flex items-center gap-4 text-xs font-mono-tech">
            <div>
              <span className="text-muted-foreground block text-[10px]">Oportunidades</span>
              <span className="font-bold text-foreground text-sm">{summary.abertasCount} ativas</span>
            </div>

            {summary.atrasadas > 0 && (
              <button
                type="button"
                onClick={() => setOnlyAlerts(onlyAlerts === "atrasados" ? "todos" : "atrasados")}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all ${
                  onlyAlerts === "atrasados"
                    ? "bg-rose-500 text-white border-rose-600 shadow-xs"
                    : "bg-rose-500/15 text-rose-500 dark:text-rose-400 border-rose-500/30 hover:bg-rose-500/25"
                }`}
              >
                <AlertTriangle className="h-3.5 w-3.5 animate-pulse" />
                <span>{summary.atrasadas} Atrasados</span>
              </button>
            )}

            {summary.deHoje > 0 && (
              <button
                type="button"
                onClick={() => setOnlyAlerts(onlyAlerts === "hoje" ? "todos" : "hoje")}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-all ${
                  onlyAlerts === "hoje"
                    ? "bg-amber-500 text-white border-amber-600 shadow-xs"
                    : "bg-amber-500/15 text-amber-500 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/25"
                }`}
              >
                <Clock className="h-3.5 w-3.5" />
                <span>{summary.deHoje} Hoje</span>
              </button>
            )}
          </div>
        </div>

        {/* Botão Principal: Nova Oportunidade */}
        <Button
          onClick={() => onNewOpportunity()}
          className="gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-medium shadow-md shadow-cyan-500/20 border border-cyan-400/30 rounded-xl"
        >
          <Plus className="h-4 w-4" />
          <span>Nova Oportunidade</span>
        </Button>
      </div>

      {/* 2. Barra de Filtros do Kanban */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por cliente, título ou OS..."
            className="h-9 pl-9 text-xs rounded-xl bg-card border-border text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-primary"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Filtro de Vendedor */}
        <Select value={selectedVendedor} onValueChange={setSelectedVendedor}>
          <SelectTrigger className="h-9 w-44 text-xs rounded-xl bg-card border-border text-foreground">
            <SelectValue placeholder="Vendedor" />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border">
            <SelectItem value="todos">Todos os vendedores</SelectItem>
            {vendedoresList.map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Filtro de Prioridade */}
        <Select value={selectedPrioridade} onValueChange={setSelectedPrioridade}>
          <SelectTrigger className="h-9 w-36 text-xs rounded-xl bg-card border-border text-foreground">
            <SelectValue placeholder="Prioridade" />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border">
            <SelectItem value="todas">Todas prioridades</SelectItem>
            <SelectItem value="baixa">Baixa</SelectItem>
            <SelectItem value="media">Média</SelectItem>
            <SelectItem value="alta">Alta</SelectItem>
            <SelectItem value="urgente">Urgente</SelectItem>
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-9 text-xs text-muted-foreground hover:text-foreground"
          >
            Limpar Filtros
          </Button>
        )}

        {/* Controles de Navegação Horizontal */}
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            onClick={scrollLeft}
            disabled={!canScrollLeft}
            className="h-8 w-8 rounded-lg border-border bg-card text-foreground disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={scrollRight}
            disabled={!canScrollRight}
            className="h-8 w-8 rounded-lg border-border bg-card text-foreground disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 3. Área das Colunas do Funil Kanban com DragDropContext */}
      <div className="flex-1 min-h-0 relative">
        <DragDropContext onDragEnd={handleDragEnd}>
          <div
            ref={containerRef}
            className="flex items-start gap-3.5 overflow-x-auto h-full pb-3 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent select-none"
          >
            {stages.map((stage) => (
              <CrmKanbanColumn
                key={stage.id}
                stage={stage}
                opportunities={opportunitiesByStage[stage.id] || []}
                onSelectOpportunity={onSelectOpportunity}
                onAddOpportunityAtStage={() => onNewOpportunity(stage.id)}
                onMarkWon={onMarkWon}
                onMarkLost={onMarkLost}
                onScheduleActivity={onScheduleActivity}
              />
            ))}
          </div>
        </DragDropContext>
      </div>
    </div>
  );
}
