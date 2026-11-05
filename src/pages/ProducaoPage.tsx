import { useState, useMemo, useCallback } from "react";
import { useOrders } from "@/hooks/useOrders";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import { ProductionTable } from "@/components/ProductionTable";
import { OrderDetailDialog } from "@/components/OrderDetailDialog";
import { ProducaoSectorBlock } from "@/components/producao/ProducaoSectorBlock";
import { ProducaoBlockageDialog } from "@/components/producao/ProducaoBlockageDialog";
import { ProducaoSendDeptDialog } from "@/components/producao/ProducaoSendDeptDialog";
import { Order } from "@/types/order";
import {
  Factory,
  Search,
  AlertTriangle,
  Layers,
  Filter,
  RefreshCw,
  Sparkles,
  Star,
  LayoutGrid,
  TableProperties,
  Printer,
  AlertOctagon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { hasProductionPriority } from "@/lib/productionPriority";
import { isSpecialSupplyActive } from "@/lib/processos";

const NON_PRODUCTION_SECTORS = ["faturamento", "compras", "manutencao"];

export function isOrderBlocked(order: Order): boolean {
  return Boolean(
    order.status === "paralisado" ||
    order.status === "aguardando_novo_arquivo" ||
    order.setor_status === "pendencia" ||
    (order.observacao && /motivo da parada|bloqueio|paralisado|pend[eê]ncia/i.test(order.observacao))
  );
}

export function hasSpecialSupply(order: Order): boolean {
  return (
    isSpecialSupplyActive(order.processos, "PANTONE") ||
    isSpecialSupplyActive(order.processos, "FACA") ||
    isSpecialSupplyActive(order.processos, "CLICHE") ||
    isSpecialSupplyActive(order.processos, "FILME") ||
    isSpecialSupplyActive(order.processos, "OUTROS")
  );
}

export default function ProducaoPage() {
  const perms = usePermissions();
  const { user, isAdmin } = useAuth();
  const {
    orders,
    archivedOrders,
    loading,
    searchQuery,
    setSearchQuery,
    addOrder,
    duplicateOrder,
    updateOrder,
    moveOrder,
    archiveOrder,
    deleteOrder,
    sendToProduction,
    sendToExpedicao,
    sendBackToPrePress,
    getProfileName,
  } = useOrders();

  // Modo de exibição: "cards" ou "table", persistido no localStorage
  const [viewMode, setViewMode] = useState<"cards" | "table">(() => {
    try {
      const saved = localStorage.getItem("producao_view_mode");
      if (saved === "table" || saved === "cards") return saved;
    } catch (_) {}
    return "cards";
  });

  const handleSetViewMode = (mode: "cards" | "table") => {
    setViewMode(mode);
    try {
      localStorage.setItem("producao_view_mode", mode);
    } catch (_) {}
  };

  // Filtros de Setor e Toggles rápidos
  const [selectedSector, setSelectedSector] = useState<string>("todos");
  const [onlyPriority, setOnlyPriority] = useState<boolean>(false);
  const [onlySpecialSupplies, setOnlySpecialSupplies] = useState<boolean>(false);
  const [onlyBlocked, setOnlyBlocked] = useState<boolean>(false);

  // Estados dos modais de ação
  const [inspectOrder, setInspectOrder] = useState<Order | null>(null);
  const [slideOverOpen, setSlideOverOpen] = useState(false);

  const [blockageOrder, setBlockageOrder] = useState<Order | null>(null);
  const [blockageDialogOpen, setBlockageDialogOpen] = useState(false);

  const [sendDeptOrder, setSendDeptOrder] = useState<Order | null>(null);
  const [sendDeptDialogOpen, setSendDeptDialogOpen] = useState(false);

  // Filtra estritamente ordens de PRODUÇÃO que estão em status ENTRADA
  const producaoEntradaOrders = useMemo(() => {
    return orders.filter((o) => {
      if (o.arquivado) return false;

      // Exclui setores não produtivos
      if (o.setor && NON_PRODUCTION_SECTORS.includes(o.setor)) return false;

      // Condição estrita de entrada na produção:
      // Se tem setor definido, o status no setor precisa ser 'entrada' (ou vazio default)
      if (o.setor) {
        return o.setor_status === "entrada" || !o.setor_status;
      }

      // Se não tem setor definido ainda, mas foi marcado como entrada no fluxo de produção
      return o.setor_status === "entrada";
    });
  }, [orders]);

  // Lista dinâmica de setores presentes nas ordens de entrada
  const availableSectors = useMemo(() => {
    const set = new Set<string>();
    producaoEntradaOrders.forEach((o) => {
      if (o.setor) set.add(o.setor.toLowerCase());
    });
    return Array.from(set).sort();
  }, [producaoEntradaOrders]);

  // Setores adicionais fora dos 3 tradicionais (CTP, Digital, Produção)
  const extraSectors = useMemo(() => {
    return availableSectors.filter(
      (sec) => !["ctp", "digital", "producao"].includes(sec)
    );
  }, [availableSectors]);

  // Aplica filtros adicionais de busca, setor específico, prioridade, urgência, suprimentos e bloqueios
  const filteredOrders = useMemo(() => {
    return producaoEntradaOrders.filter((o) => {
      const sec = (o.setor || "").toLowerCase();

      // Filtro de setor
      if (selectedSector !== "todos") {
        if (selectedSector === "ctp") {
          if (sec !== "ctp") return false;
        } else if (selectedSector === "digital") {
          if (sec !== "digital") return false;
        } else if (selectedSector === "producao") {
          // Produção abrange 'producao', sem setor explícito ou subdepartamentos produtivos gerais
          if (sec !== "producao" && ["ctp", "digital", ...extraSectors].includes(sec)) {
            return false;
          }
        } else {
          if (sec !== selectedSector.toLowerCase()) return false;
        }
      }

      // Filtro apenas prioritárias
      if (onlyPriority && !hasProductionPriority(o)) {
        return false;
      }

      // Filtro suprimentos especiais (Pantone, Faca, Clichê, Filme, Outros)
      if (onlySpecialSupplies && !hasSpecialSupply(o)) {
        return false;
      }

      // Filtro com bloqueios ou paradas
      if (onlyBlocked && !isOrderBlocked(o)) {
        return false;
      }

      // Filtro textual
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitulo = o.titulo?.toLowerCase().includes(q);
        const matchCliente = o.cliente?.toLowerCase().includes(q);
        const matchDesc = o.descricao?.toLowerCase().includes(q);
        const matchVendedor = o.vendedor?.toLowerCase().includes(q);
        const matchSetor = o.setor?.toLowerCase().includes(q);
        if (!matchTitulo && !matchCliente && !matchDesc && !matchVendedor && !matchSetor) {
          return false;
        }
      }

      return true;
    });
  }, [
    producaoEntradaOrders,
    selectedSector,
    onlyPriority,
    onlySpecialSupplies,
    onlyBlocked,
    searchQuery,
    extraSectors,
  ]);

  // Estatísticas rápidas da Fila de Entrada
  const stats = useMemo(() => {
    const total = producaoEntradaOrders.length;
    const prioritarias = producaoEntradaOrders.filter(hasProductionPriority).length;
    const comSuprimento = producaoEntradaOrders.filter(hasSpecialSupply).length;
    const bloqueadas = producaoEntradaOrders.filter(isOrderBlocked).length;

    const ctpCount = producaoEntradaOrders.filter((o) => o.setor?.toLowerCase() === "ctp").length;
    const digitalCount = producaoEntradaOrders.filter((o) => o.setor?.toLowerCase() === "digital").length;
    const producaoCount = producaoEntradaOrders.filter(
      (o) => !o.setor || o.setor.toLowerCase() === "producao" || (!["ctp", "digital", ...extraSectors].includes(o.setor.toLowerCase()))
    ).length;

    return {
      total,
      prioritarias,
      comSuprimento,
      bloqueadas,
      ctpCount,
      digitalCount,
      producaoCount,
    };
  }, [producaoEntradaOrders, extraSectors]);

  // Grupos de ordens para os blocos da visualização em Cards
  const ctpOrders = useMemo(() => {
    return filteredOrders.filter((o) => o.setor?.toLowerCase() === "ctp");
  }, [filteredOrders]);

  const digitalOrders = useMemo(() => {
    return filteredOrders.filter((o) => o.setor?.toLowerCase() === "digital");
  }, [filteredOrders]);

  const producaoOrders = useMemo(() => {
    return filteredOrders.filter(
      (o) =>
        !o.setor ||
        o.setor.toLowerCase() === "producao" ||
        (!["ctp", "digital", ...extraSectors].includes(o.setor.toLowerCase()))
    );
  }, [filteredOrders, extraSectors]);

  // Handlers para abrir modais
  const handleInspect = useCallback((order: Order) => {
    setInspectOrder(order);
    setSlideOverOpen(true);
  }, []);

  const handleOpenBlockageDialog = useCallback((order: Order) => {
    setBlockageOrder(order);
    setBlockageDialogOpen(true);
  }, []);

  const handleOpenSendDeptDialog = useCallback((order: Order) => {
    setSendDeptOrder(order);
    setSendDeptDialogOpen(true);
  }, []);

  return (
    <Layout
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      onAddOrder={addOrder}
      activeCount={stats.total}
      archivedCount={archivedOrders.length}
      sectorName="Produção"
      countsLoading={loading}
      permissions={perms}
    >
      <div className="flex flex-col h-full gap-3 p-2 sm:p-4 overflow-hidden">
        {/* Cabeçalho da Produção: Título, Métricas Rápidas e Seletor de Modo */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-card/60 backdrop-blur-md border border-border/70 p-3 sm:p-4 rounded-2xl shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-500 flex items-center justify-center shrink-0 shadow-xs">
              <Factory className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-foreground tracking-tight">
                  PRODUÇÃO
                </h1>
                <Badge className="bg-sky-500/20 text-sky-300 border-sky-500/30 text-[10px] px-2 py-0.5 uppercase tracking-wider font-mono-tech">
                  Fila Operacional
                </Badge>
              </div>
              <p className="text-[11px] sm:text-xs text-muted-foreground">
                Painel por blocos de setor com cards compactos, prioridades, suprimentos e controle de paradas
              </p>
            </div>
          </div>

          {/* Métricas rápidas e Switcher Cards vs Tabela */}
          <div className="flex items-center gap-2 flex-wrap justify-between lg:justify-end">
            <div className="flex items-center gap-1.5 flex-wrap">
              <div className="px-3 py-1.5 rounded-xl bg-background/80 border border-border text-xs flex items-center gap-2">
                <span className="text-muted-foreground text-[11px]">Total:</span>
                <span className="font-bold font-mono-tech text-foreground text-sm">
                  {stats.total}
                </span>
              </div>

              {stats.prioritarias > 0 && (
                <div className="px-2.5 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs flex items-center gap-1.5 text-amber-500">
                  <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500 shrink-0" />
                  <span className="text-[11px]">Prioritárias:</span>
                  <span className="font-bold font-mono-tech">{stats.prioritarias}</span>
                </div>
              )}

              {stats.comSuprimento > 0 && (
                <div className="px-2.5 py-1.5 rounded-xl bg-pink-500/10 border border-pink-500/30 text-xs flex items-center gap-1.5 text-pink-400 hidden xl:flex">
                  <Sparkles className="h-3.5 w-3.5 text-pink-400 shrink-0" />
                  <span className="text-[11px]">Suprimentos:</span>
                  <span className="font-bold font-mono-tech text-pink-300">
                    {stats.comSuprimento}
                  </span>
                </div>
              )}

              {stats.bloqueadas > 0 && (
                <div className="px-2.5 py-1.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-xs flex items-center gap-1.5 text-rose-400 animate-pulse hidden xl:flex">
                  <AlertOctagon className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                  <span className="text-[11px]">Paradas:</span>
                  <span className="font-bold font-mono-tech text-rose-300">
                    {stats.bloqueadas}
                  </span>
                </div>
              )}
            </div>

            {/* Alternador de Visualização: Cards vs Tabela */}
            <div className="flex items-center p-0.5 rounded-xl bg-background/80 border border-border shadow-xs shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleSetViewMode("cards")}
                className={`h-7 px-3 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  viewMode === "cards"
                    ? "bg-primary text-primary-foreground shadow-xs font-bold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Visualização em Blocos por Setor com Cards Compactos"
              >
                <LayoutGrid className="h-3.5 w-3.5 mr-1.5" />
                Cards
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleSetViewMode("table")}
                className={`h-7 px-3 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  viewMode === "table"
                    ? "bg-primary text-primary-foreground shadow-xs font-bold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Visualização Consolidada em Tabela"
              >
                <TableProperties className="h-3.5 w-3.5 mr-1.5" />
                Tabela
              </Button>
            </div>
          </div>
        </div>

        {/* Barra de Filtros: Abas de Setores e Filtros Rápidos */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 bg-card/40 border border-border/50 px-3 py-2 rounded-xl">
          {/* Pílulas de seleção de setor (Todos, CTP, Digital, Produção, etc.) */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
            <Button
              type="button"
              variant={selectedSector === "todos" ? "default" : "ghost"}
              size="sm"
              onClick={() => setSelectedSector("todos")}
              className={`h-7 px-2.5 text-xs font-semibold rounded-lg cursor-pointer ${
                selectedSector === "todos"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Todos ({stats.total})
            </Button>

            <Button
              type="button"
              variant={selectedSector === "ctp" ? "default" : "ghost"}
              size="sm"
              onClick={() => setSelectedSector("ctp")}
              className={`h-7 px-2.5 text-xs font-semibold uppercase font-mono-tech rounded-lg cursor-pointer ${
                selectedSector === "ctp"
                  ? "bg-sky-500 hover:bg-sky-400 text-zinc-950 shadow-xs font-bold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              CTP ({stats.ctpCount})
            </Button>

            <Button
              type="button"
              variant={selectedSector === "digital" ? "default" : "ghost"}
              size="sm"
              onClick={() => setSelectedSector("digital")}
              className={`h-7 px-2.5 text-xs font-semibold uppercase font-mono-tech rounded-lg cursor-pointer ${
                selectedSector === "digital"
                  ? "bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-xs font-bold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Digital ({stats.digitalCount})
            </Button>

            <Button
              type="button"
              variant={selectedSector === "producao" ? "default" : "ghost"}
              size="sm"
              onClick={() => setSelectedSector("producao")}
              className={`h-7 px-2.5 text-xs font-semibold uppercase font-mono-tech rounded-lg cursor-pointer ${
                selectedSector === "producao"
                  ? "bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-xs font-bold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Produção ({stats.producaoCount})
            </Button>

            {extraSectors.map((sec) => {
              const count = producaoEntradaOrders.filter(
                (o) => o.setor && o.setor.toLowerCase() === sec
              ).length;
              const isSelected = selectedSector.toLowerCase() === sec;
              return (
                <Button
                  key={sec}
                  type="button"
                  variant={isSelected ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setSelectedSector(sec)}
                  className={`h-7 px-2.5 text-xs font-semibold uppercase font-mono-tech rounded-lg cursor-pointer ${
                    isSelected
                      ? "bg-indigo-500 hover:bg-indigo-400 text-zinc-950 shadow-xs font-bold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {sec} ({count})
                </Button>
              );
            })}
          </div>

          {/* Filtros de toggle rápido (Prioritárias, Suprimentos, Bloqueadas) */}
          <div className="flex items-center gap-1.5 shrink-0 justify-end flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOnlyPriority((prev) => !prev)}
              className={`h-7 px-2.5 text-xs rounded-lg transition-all cursor-pointer ${
                onlyPriority
                  ? "bg-amber-500/20 text-amber-500 border-amber-500 font-bold"
                  : "text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              <Star className={`h-3 w-3 mr-1 ${onlyPriority ? "fill-amber-500 text-amber-500" : ""}`} />
              Prioritárias
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOnlySpecialSupplies((prev) => !prev)}
              className={`h-7 px-2.5 text-xs rounded-lg transition-all cursor-pointer ${
                onlySpecialSupplies
                  ? "bg-pink-500/20 text-pink-300 border-pink-500 font-bold"
                  : "text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              <Sparkles className="h-3 w-3 mr-1 text-pink-400" />
              Suprimentos
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOnlyBlocked((prev) => !prev)}
              className={`h-7 px-2.5 text-xs rounded-lg transition-all cursor-pointer ${
                onlyBlocked
                  ? "bg-rose-500/20 text-rose-300 border-rose-500 font-bold"
                  : "text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              <AlertOctagon className="h-3 w-3 mr-1 text-rose-400" />
              Bloqueios
            </Button>
          </div>
        </div>

        {/* Conteúdo Principal: Visualização em Cards (Blocos por Setor) OU Tabela */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {viewMode === "cards" ? (
            <div className="h-full overflow-y-auto pb-4">
              {selectedSector === "todos" ? (
                /* Grid responsiva com os 3 blocos principais (CTP, Digital, Produção) e eventuais extras */
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 h-full min-h-0">
                  <div className="h-full min-h-[500px]">
                    <ProducaoSectorBlock
                      sectorKey="ctp"
                      sectorLabel="CTP"
                      orders={ctpOrders}
                      onUpdate={updateOrder}
                      onInspect={handleInspect}
                      onOpenBlockageDialog={handleOpenBlockageDialog}
                      onOpenSendDeptDialog={handleOpenSendDeptDialog}
                      onSendBackToPrePress={sendBackToPrePress}
                      onSendToExpedicao={sendToExpedicao}
                      currentUserName={user?.email || "Operador"}
                    />
                  </div>

                  <div className="h-full min-h-[500px]">
                    <ProducaoSectorBlock
                      sectorKey="digital"
                      sectorLabel="Digital"
                      orders={digitalOrders}
                      onUpdate={updateOrder}
                      onInspect={handleInspect}
                      onOpenBlockageDialog={handleOpenBlockageDialog}
                      onOpenSendDeptDialog={handleOpenSendDeptDialog}
                      onSendBackToPrePress={sendBackToPrePress}
                      onSendToExpedicao={sendToExpedicao}
                      currentUserName={user?.email || "Operador"}
                    />
                  </div>

                  <div className="h-full min-h-[500px]">
                    <ProducaoSectorBlock
                      sectorKey="producao"
                      sectorLabel="Produção"
                      orders={producaoOrders}
                      onUpdate={updateOrder}
                      onInspect={handleInspect}
                      onOpenBlockageDialog={handleOpenBlockageDialog}
                      onOpenSendDeptDialog={handleOpenSendDeptDialog}
                      onSendBackToPrePress={sendBackToPrePress}
                      onSendToExpedicao={sendToExpedicao}
                      currentUserName={user?.email || "Operador"}
                    />
                  </div>

                  {extraSectors.map((sec) => (
                    <div key={sec} className="h-full min-h-[500px]">
                      <ProducaoSectorBlock
                        sectorKey={sec}
                        sectorLabel={sec.toUpperCase()}
                        orders={filteredOrders.filter((o) => o.setor?.toLowerCase() === sec)}
                        onUpdate={updateOrder}
                        onInspect={handleInspect}
                        onOpenBlockageDialog={handleOpenBlockageDialog}
                        onOpenSendDeptDialog={handleOpenSendDeptDialog}
                        onSendBackToPrePress={sendBackToPrePress}
                        onSendToExpedicao={sendToExpedicao}
                        currentUserName={user?.email || "Operador"}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                /* Setor específico selecionado: Exibe o bloco do setor em largura total */
                <div className="h-full max-w-4xl mx-auto min-h-[500px]">
                  <ProducaoSectorBlock
                    sectorKey={selectedSector}
                    sectorLabel={
                      selectedSector === "ctp"
                        ? "CTP"
                        : selectedSector === "digital"
                        ? "Digital"
                        : selectedSector === "producao"
                        ? "Produção"
                        : selectedSector.toUpperCase()
                    }
                    orders={filteredOrders}
                    onUpdate={updateOrder}
                    onInspect={handleInspect}
                    onOpenBlockageDialog={handleOpenBlockageDialog}
                    onOpenSendDeptDialog={handleOpenSendDeptDialog}
                    onSendBackToPrePress={sendBackToPrePress}
                    onSendToExpedicao={sendToExpedicao}
                    currentUserName={user?.email || "Operador"}
                  />
                </div>
              )}
            </div>
          ) : (
            /* Modo Alternativo: Tabela consolidada com suporte completo */
            <div className="h-full">
              <ProductionTable
                orders={filteredOrders}
                onUpdate={updateOrder}
                onMove={moveOrder}
                onArchive={archiveOrder}
                onDelete={deleteOrder}
                onDuplicate={duplicateOrder}
                onSendToProduction={sendToProduction}
                onSendToExpedicao={sendToExpedicao}
                getProfileName={getProfileName}
                permissions={perms}
                showSectorColumn={selectedSector === "todos"}
              />
            </div>
          )}
        </div>

        {/* Modal Centralizado de Detalhes da O.S. (Inspecionar / Editar) */}
        <OrderDetailDialog
          order={inspectOrder}
          open={slideOverOpen}
          onOpenChange={setSlideOverOpen}
          onUpdate={updateOrder}
          onArchive={archiveOrder}
          onDelete={deleteOrder}
          onDuplicate={duplicateOrder}
          onSendToProduction={sendToProduction}
          onSendToExpedicao={sendToExpedicao}
          permissions={perms}
          getProfileName={getProfileName}
        />

        {/* Modal de Registro / Resolução de Bloqueio ou Parada */}
        <ProducaoBlockageDialog
          order={blockageOrder}
          open={blockageDialogOpen}
          onOpenChange={setBlockageDialogOpen}
          onUpdate={updateOrder}
        />

        {/* Modal de Envio entre Departamentos da Fábrica */}
        <ProducaoSendDeptDialog
          order={sendDeptOrder}
          open={sendDeptDialogOpen}
          onOpenChange={setSendDeptDialogOpen}
          onSendToProduction={sendToProduction}
          onSendBackToPrePress={sendBackToPrePress}
          onSendToExpedicao={sendToExpedicao}
        />
      </div>
    </Layout>
  );
}