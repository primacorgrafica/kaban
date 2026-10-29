import { useState, useMemo, useCallback } from "react";
import { useOrders } from "@/hooks/useOrders";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import { ProductionTable } from "@/components/ProductionTable";
import { Order } from "@/types/order";
import {
  Factory,
  Search,
  AlertTriangle,
  Layers,
  Filter,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { startOfDay, endOfDay } from "date-fns";
import { isSpecialSupplyActive } from "@/lib/processos";

const NON_PRODUCTION_SECTORS = ["faturamento", "compras", "manutencao"];

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
    getProfileName,
  } = useOrders();

  const [selectedSector, setSelectedSector] = useState<string>("todos");
  const [onlyUrgent, setOnlyUrgent] = useState<boolean>(false);
  const [onlySpecialSupplies, setOnlySpecialSupplies] = useState<boolean>(false);

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

  // Aplica filtros adicionais de busca, setor específico e urgência
  const filteredOrders = useMemo(() => {
    return producaoEntradaOrders.filter((o) => {
      // Filtro de setor
      if (selectedSector !== "todos") {
        if (!o.setor || o.setor.toLowerCase() !== selectedSector.toLowerCase()) {
          return false;
        }
      }

      // Filtro apenas urgentes
      if (onlyUrgent && !o.urgente) {
        return false;
      }

      // Filtro suprimentos especiais (Pantone, Faca, Clichê, Filme, Outros)
      if (onlySpecialSupplies) {
        const hasSpecial =
          isSpecialSupplyActive(o.processos, "PANTONE") ||
          isSpecialSupplyActive(o.processos, "FACA") ||
          isSpecialSupplyActive(o.processos, "CLICHE") ||
          isSpecialSupplyActive(o.processos, "FILME") ||
          isSpecialSupplyActive(o.processos, "OUTROS");
        if (!hasSpecial) return false;
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
  }, [producaoEntradaOrders, selectedSector, onlyUrgent, onlySpecialSupplies, searchQuery]);

  // Estatísticas rápidas da Fila de Entrada
  const stats = useMemo(() => {
    const total = producaoEntradaOrders.length;
    const urgentes = producaoEntradaOrders.filter((o) => o.urgente).length;
    const comSuprimento = producaoEntradaOrders.filter(
      (o) =>
        isSpecialSupplyActive(o.processos, "PANTONE") ||
        isSpecialSupplyActive(o.processos, "FACA") ||
        isSpecialSupplyActive(o.processos, "CLICHE") ||
        isSpecialSupplyActive(o.processos, "FILME") ||
        isSpecialSupplyActive(o.processos, "OUTROS")
    ).length;
    return { total, urgentes, comSuprimento };
  }, [producaoEntradaOrders]);

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
        {/* Cabeçalho da Produção: Título e Contadores */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card/60 backdrop-blur-md border border-border/70 p-3 sm:p-4 rounded-2xl shadow-sm">
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
                  Fila de Entrada
                </Badge>
              </div>
              <p className="text-[11px] sm:text-xs text-muted-foreground">
                Visualização consolidada em tabela de todas as ordens de serviço em status de entrada na fábrica
              </p>
            </div>
          </div>

          {/* Métricas rápidas */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="px-3 py-1.5 rounded-xl bg-background/80 border border-border text-xs flex items-center gap-2">
              <span className="text-muted-foreground text-[11px]">Total Entrada:</span>
              <span className="font-bold font-mono-tech text-foreground text-sm">
                {stats.total}
              </span>
            </div>
            {stats.urgentes > 0 && (
              <div className="px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs flex items-center gap-1.5 text-rose-400">
                <AlertTriangle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                <span className="text-[11px]">Urgentes:</span>
                <span className="font-bold font-mono-tech text-rose-300">
                  {stats.urgentes}
                </span>
              </div>
            )}
            {stats.comSuprimento > 0 && (
              <div className="px-3 py-1.5 rounded-xl bg-pink-500/10 border border-pink-500/30 text-xs flex items-center gap-1.5 text-pink-400 hidden md:flex">
                <Sparkles className="h-3.5 w-3.5 text-pink-400 shrink-0" />
                <span className="text-[11px]">Matrizes & Suprimentos:</span>
                <span className="font-bold font-mono-tech text-pink-300">
                  {stats.comSuprimento}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Barra de Filtros: Setores e Modos de Visualização */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 bg-card/40 border border-border/50 px-3 py-2 rounded-xl">
          {/* Pílulas de seleção de setor */}
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

            {availableSectors.map((sec) => {
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
                      ? "bg-sky-500 hover:bg-sky-400 text-zinc-950 shadow-xs font-bold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {sec} ({count})
                </Button>
              );
            })}
          </div>

          {/* Filtros de toggle rápido (Urgentes e Especiais) */}
          <div className="flex items-center gap-1.5 shrink-0 justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOnlyUrgent((prev) => !prev)}
              className={`h-7 px-2.5 text-xs rounded-lg transition-all cursor-pointer ${
                onlyUrgent
                  ? "bg-rose-500/20 text-rose-300 border-rose-500 font-bold"
                  : "text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              <AlertTriangle className="h-3 w-3 mr-1 text-rose-500" />
              Apenas Urgentes
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
          </div>
        </div>

        {/* Conteúdo Principal: Visualização 100% em Tabela (Sem colunas Kanban) */}
        <div className="flex-1 min-h-0">
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
            showSectorColumn={true}
          />
        </div>
      </div>
    </Layout>
  );
}
