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
  Archive,
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
  onArchiveOpportunity?: (id: string, arquivado: boolean) => void;
  onDeleteOpportunity?: (opportunity: CrmOpportunity) => void;
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
  onArchiveOpportunity,
  onDeleteOpportunity,
}: CrmKanbanBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [isDndActive, setIsDndActive] = useState(false);
  const mouseXRef = useRef(0);
  const mouseYRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  // Filtros locais da visualização
  const [search, setSearch] = useState("");
  const [selectedVendedor, setSelectedVendedor] = useState<string>("todos");
  const [selectedPrioridade, setSelectedPrioridade] = useState<string>("todas");
  const [onlyAlerts, setOnlyAlerts] = useState<"todos" | "atrasados" | "hoje">("todos");
  const [showArchived, setShowArchived] = useState<boolean>(false);

  // Contagem de vendas concluídas/arquivadas
  const archivedCount = useMemo(() => {
    return opportunities.filter((o) => Boolean(o.arquivado)).length;
  }, [opportunities]);

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
      // 0. Vendas Concluídas / Arquivadas (ocultas por padrão)
      const isArchived = Boolean(o.arquivado);
      if (!showArchived && isArchived) {
        return false;
      }

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
  }, [opportunities, search, selectedVendedor, selectedPrioridade, onlyAlerts, showArchived]);

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

  // Indicadores de scroll horizontal
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

  const scrollTo = useCallback((direction: "left" | "right") => {
    const el = containerRef.current;
    if (!el) return;
    const amount = direction === "left" ? -340 : 340;
    el.scrollBy({ left: amount, behavior: "smooth" });
  }, []);

  // Rastreamento global do mouse durante drag para auto-scroll (mesmo esquema da pré-impressão)
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

  // RAF-based auto-scroll durante o drag
  useEffect(() => {
    if (!isDndActive) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const EDGE_ZONE = 200;
    const MAX_SPEED = 12;

    const tick = () => {
      const el = containerRef.current;
      if (!el) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const rect = el.getBoundingClientRect();
      const mouseX = mouseXRef.current;
      const mouseY = mouseYRef.current;

      // Auto-scroll horizontal
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

      // Auto-scroll vertical
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

  // Manipulador de drag and drop
  const handleDragEnd = (result: DropResult) => {
    setIsDndActive(false);
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
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
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
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
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
          className="gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-medium shadow-md shadow-cyan-500/20 border border-cyan-400/30 rounded-xl cursor-pointer"
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
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
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

        {/* Toggle para Vendas Concluídas */}
        <Button
          type="button"
          variant={showArchived ? "secondary" : "outline"}
          size="sm"
          onClick={() => setShowArchived((prev) => !prev)}
          className={`h-9 text-xs rounded-xl gap-1.5 transition-colors cursor-pointer ${
            showArchived
              ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/40 font-semibold"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          <Archive className="h-3.5 w-3.5" />
          <span>{showArchived ? "Ocultar Concluídas" : "Exibir Concluídas"}</span>
          {archivedCount > 0 && (
            <Badge
              variant="secondary"
              className="ml-0.5 px-1.5 py-0 h-4 text-[10px] font-mono-tech bg-muted"
            >
              {archivedCount}
            </Badge>
          )}
        </Button>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-9 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          >
            Limpar Filtros
          </Button>
        )}

        {/* Controles de Navegação Horizontal */}
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            onClick={() => scrollTo("left")}
            disabled={!canScrollLeft}
            className="h-8 w-8 rounded-lg border-border bg-card text-foreground disabled:opacity-30 cursor-pointer"
            title="Rolar para esquerda"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => scrollTo("right")}
            disabled={!canScrollRight}
            className="h-8 w-8 rounded-lg border-border bg-card text-foreground disabled:opacity-30 cursor-pointer"
            title="Rolar para direita"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 3. Área das Colunas do Funil Kanban com DragDropContext e Auto-scroll (Esquema da Pré-Impressão) */}
      <DragDropContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="relative flex-1 min-h-0">
          {/* Fade esquerdo + seta flutuante */}
          <div
            className={`absolute left-0 top-0 bottom-4 w-8 z-10 pointer-events-none transition-opacity duration-300 ${
              canScrollLeft ? "opacity-100" : "opacity-0"
            }`}
            style={{ background: "linear-gradient(to right, hsl(var(--background)), transparent)" }}
          />
          {canScrollLeft && (
            <button
              type="button"
              onClick={() => scrollTo("left")}
              className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-card border border-border shadow-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
              title="Rolar para esquerda"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}

          {/* Fade direito + seta flutuante */}
          <div
            className={`absolute right-0 top-0 bottom-4 w-8 z-10 pointer-events-none transition-opacity duration-300 ${
              canScrollRight ? "opacity-100" : "opacity-0"
            }`}
            style={{ background: "linear-gradient(to left, hsl(var(--background)), transparent)" }}
          />
          {canScrollRight && (
            <button
              type="button"
              onClick={() => scrollTo("right")}
              className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-card border border-border shadow-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
              title="Rolar para direita"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          )}

          <div
            ref={containerRef}
            className="flex gap-7 min-h-full items-stretch overflow-x-auto pb-8 px-1 scrollbar-hide select-none"
            style={{ WebkitOverflowScrolling: "touch" }}
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
                onArchive={onArchiveOpportunity}
                onDelete={onDeleteOpportunity}
              />
            ))}
          </div>
        </div>
      </DragDropContext>
    </div>
  );
}
