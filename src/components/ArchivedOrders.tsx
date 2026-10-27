import { Order } from "@/types/order";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Archive, ArchiveRestore, Trash2, Search, Clock, ArrowRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

interface HistoryEntry {
  id: string;
  order_id: string;
  status_anterior: string | null;
  status_novo: string;
  created_at: string;
}

interface SectorEntry {
  id: string;
  order_id: string;
  setor_anterior: string | null;
  setor_novo: string | null;
  setor_status_novo: string | null;
  created_at: string;
}

interface TimeSummary {
  order_id: string;
  setor: string;
  tempo_ms: number;
}

interface ArchivedOrdersProps {
  orders: Order[];
  onUnarchive: (id: string) => void;
  onDelete: (id: string) => void;
}

const PAGE_SIZE = 50;

const SETOR_LABELS: Record<string, string> = {
  ctp: "CTP",
  desenvolvimento: "Pré-Impressão",
  offset: "Off-Set",
  digital: "Digital",
  acabamento: "Acabamento",
  terceiros: "Terceiros",
  expedicao: "Expedição",
  faturamento: "Faturamento",
  compras: "Compras",
  manutencao: "Manutenção",
  
  qualidade: "Qualidade",
};

function formatDuration(ms: number): string {
  if (ms < 60000) return "< 1min";
  if (ms < 3600000) return `${Math.round(ms / 60000)}min`;
  if (ms < 86400000) {
    const h = Math.floor(ms / 3600000);
    const m = Math.round((ms % 3600000) / 60000);
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  }
  const d = Math.floor(ms / 86400000);
  const h = Math.round((ms % 86400000) / 3600000);
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
}

export function ArchivedOrders({ orders, onUnarchive, onDelete }: ArchivedOrdersProps) {
  const [search, setSearch] = useState("");
  const [historyMap, setHistoryMap] = useState<Record<string, HistoryEntry[]>>({});
  const [sectorHistoryMap, setSectorHistoryMap] = useState<Record<string, SectorEntry[]>>({});
  const [summaryMap, setSummaryMap] = useState<Record<string, TimeSummary[]>>({});
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  // Filter out sub-orders with P or F stamps
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (!order.parent_order_id) return true;
      const isOM = !!(order as any).om_numero;
      const isOC = !!(order as any).oc_numero;
      const isNC = !!(order as any).nc_numero;
      if (!isOM && !isOC && !isNC) return false;
      return true;
    });
  }, [orders]);

  // Sort by updated_at descending
  const sortedOrders = useMemo(() => {
    return [...filteredOrders].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }, [filteredOrders]);

  const searchFiltered = useMemo(() => {
    if (!search) return sortedOrders;
    const q = search.toLowerCase();
    return sortedOrders.filter((o) =>
      o.titulo.toLowerCase().includes(q) || o.cliente.toLowerCase().includes(q) || o.descricao.toLowerCase().includes(q)
    );
  }, [sortedOrders, search]);

  // Reset visible count when search changes
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search]);

  // Paginated slice
  const visibleOrders = useMemo(() => searchFiltered.slice(0, visibleCount), [searchFiltered, visibleCount]);
  const hasMore = visibleCount < searchFiltered.length;

  const loadMore = useCallback(() => {
    setVisibleCount((prev) => prev + PAGE_SIZE);
  }, []);

  const handleDeleteAll = useCallback(async () => {
    if (searchFiltered.length === 0) return;
    setIsDeletingAll(true);

    const ids = searchFiltered.map((o) => o.id);
    const CHUNK_SIZE = 500;
    let deletedCount = 0;
    let hasError = false;

    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunk = ids.slice(i, i + CHUNK_SIZE);
      const { error } = await supabase.from("orders").delete().in("id", chunk);
      if (error) {
        console.error("Erro ao excluir lote:", error);
        hasError = true;
      } else {
        deletedCount += chunk.length;
      }
    }

    setIsDeletingAll(false);
    setShowDeleteAllDialog(false);

    if (hasError) {
      toast.error("Erro ao remover algumas O.S. Verifique o console.");
    } else {
      toast.success(`${deletedCount} O.S. removidas com sucesso!`);
    }
  }, [searchFiltered]);

  // Fetch data for VISIBLE orders: check summary table first, then fallback to detailed history
  useEffect(() => {
    if (visibleOrders.length === 0) return;

    const idsToFetch = visibleOrders
      .filter((o) => !summaryMap[o.id] && !historyMap[o.id] && !sectorHistoryMap[o.id])
      .map((o) => o.id);

    if (idsToFetch.length === 0) return;

    const fetchAll = async () => {
      const newSummaryMap: Record<string, TimeSummary[]> = {};
      const idsNeedingDetailedFetch: string[] = [];

      // Step 1: Check order_time_summary for compacted data
      for (let i = 0; i < idsToFetch.length; i += 50) {
        const chunk = idsToFetch.slice(i, i + 50);
        const { data: summaries } = await supabase
          .from("order_time_summary" as any)
          .select("order_id,setor,tempo_ms")
          .in("order_id", chunk);

        if (summaries) {
          (summaries as any[]).forEach((s: TimeSummary) => {
            if (!newSummaryMap[s.order_id]) newSummaryMap[s.order_id] = [];
            newSummaryMap[s.order_id].push(s);
          });
        }

        // IDs without summary need detailed fetch
        chunk.forEach((id) => {
          if (!newSummaryMap[id]) idsNeedingDetailedFetch.push(id);
        });
      }

      if (Object.keys(newSummaryMap).length > 0) {
        setSummaryMap((prev) => ({ ...prev, ...newSummaryMap }));
      }

      // Step 2: Fetch detailed history only for orders without summary
      if (idsNeedingDetailedFetch.length > 0) {
        const hMap: Record<string, HistoryEntry[]> = {};
        const sMap: Record<string, SectorEntry[]> = {};

        for (let i = 0; i < idsNeedingDetailedFetch.length; i += 50) {
          const chunk = idsNeedingDetailedFetch.slice(i, i + 50);

          const [histRes, secRes] = await Promise.all([
            supabase
              .from("order_status_history")
              .select("id,order_id,status_anterior,status_novo,created_at")
              .in("order_id", chunk)
              .order("created_at", { ascending: true }),
            supabase
              .from("sector_history" as any)
              .select("id,order_id,setor_anterior,setor_novo,setor_status_novo,created_at")
              .in("order_id", chunk)
              .order("created_at", { ascending: true }),
          ]);

          if (histRes.data) {
            (histRes.data as HistoryEntry[]).forEach((entry) => {
              if (!hMap[entry.order_id]) hMap[entry.order_id] = [];
              hMap[entry.order_id].push(entry);
            });
          }
          if (secRes.data) {
            (secRes.data as any[]).forEach((entry: SectorEntry) => {
              if (!sMap[entry.order_id]) sMap[entry.order_id] = [];
              sMap[entry.order_id].push(entry);
            });
          }
        }

        setHistoryMap((prev) => ({ ...prev, ...hMap }));
        setSectorHistoryMap((prev) => ({ ...prev, ...sMap }));
      }
    };
    fetchAll();
  }, [visibleOrders]);

  // Calculate sector times — use compacted summary if available, else detailed history
  const getSectorTimes = (order: Order): { label: string; ms: number }[] => {
    // Fast path: compacted summary available
    const summaries = summaryMap[order.id];
    if (summaries && summaries.length > 0) {
      return summaries.map((s) => ({
        label: s.setor === "pre_impressao" ? "Pré-Impressão" : (SETOR_LABELS[s.setor] || s.setor),
        ms: s.tempo_ms,
      }));
    }

    // Slow path: calculate from detailed history
    const history = historyMap[order.id] || [];
    const sectorHistory = sectorHistoryMap[order.id] || [];
    const result: { label: string; ms: number }[] = [];

    if (history.length > 0) {
      const firstTime = new Date(history[0].created_at).getTime();
      const lastEntry = history.find(h => h.status_novo === "arquivo_liberado");
      const lastTime = lastEntry
        ? new Date(lastEntry.created_at).getTime()
        : new Date(history[history.length - 1].created_at).getTime();
      const preMs = lastTime - firstTime;
      if (preMs > 0) {
        result.push({ label: "Pré-Impressão", ms: preMs });
      }
    }

    if (sectorHistory.length > 0) {
      for (let i = 0; i < sectorHistory.length; i++) {
        const entry = sectorHistory[i];
        if (!entry.setor_novo) continue;

        const entryTime = new Date(entry.created_at).getTime();
        const nextTime = i < sectorHistory.length - 1
          ? new Date(sectorHistory[i + 1].created_at).getTime()
          : new Date(order.updated_at).getTime();

        const ms = nextTime - entryTime;
        if (ms > 0) {
          const label = SETOR_LABELS[entry.setor_novo] || entry.setor_novo;
          const existing = result.find(r => r.label === label);
          if (existing) {
            existing.ms += ms;
          } else {
            result.push({ label, ms });
          }
        }
      }
    } else if (order.setor && history.length > 0) {
      const lastHistoryTime = new Date(history[history.length - 1].created_at).getTime();
      const updatedTime = new Date(order.updated_at).getTime();
      const sectorMs = updatedTime - lastHistoryTime;
      if (sectorMs > 0) {
        const setorLabel = SETOR_LABELS[order.setor] || order.setor;
        result.push({ label: setorLabel, ms: sectorMs });
      }
    }

    return result;
  };

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto overflow-auto h-full">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Archive className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-xl font-semibold">Trabalhos Concluídos</h2>
          <span className="text-sm text-muted-foreground">({searchFiltered.length})</span>
        </div>
        <div className="flex items-center gap-3">
          <AlertDialog open={showDeleteAllDialog} onOpenChange={setShowDeleteAllDialog}>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="destructive" disabled={searchFiltered.length === 0}>
                <Trash2 className="h-4 w-4 mr-1" />
                Remover todos
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remover todas as O.S.?</AlertDialogTitle>
                <AlertDialogDescription>
                  Tem certeza? Isso excluirá permanentemente {searchFiltered.length} O.S. listadas.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeletingAll}>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteAll}
                  disabled={isDeletingAll}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isDeletingAll ? "Removendo..." : "Confirmar remoção"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>
      </div>

      {searchFiltered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Archive className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Nenhuma OS. arquivada</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleOrders.map((order) => {
            const isOM = !!(order as any).om_numero;
            const isFromOS = (order as any).categoria_compra === "os" || !!order.parent_order_id || (!!order.titulo && order.titulo !== "OC");
            const isOC = !!(order as any).oc_numero && !isFromOS;
            const isNC = !!(order as any).nc_numero;
            const sectorTimes = getSectorTimes(order);

            let titleDisplay: string;
            if (isOM) {
              titleDisplay = `OM. ${String((order as any).om_numero).padStart(4, "0")}`;
            } else if (isOC) {
              titleDisplay = `OC. ${String((order as any).oc_numero).padStart(4, "0")}`;
            } else if (isNC) {
              titleDisplay = `NC. ${String((order as any).nc_numero).padStart(4, "0")}`;
            } else {
              titleDisplay = `OS. #${order.titulo.replace(/^#/, "")}`;
            }

            return (
              <div key={order.id} className="bg-card border rounded-lg p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-card-foreground">{titleDisplay}</span>
                      <span className="text-sm text-muted-foreground">—</span>
                      <span className="text-sm font-medium text-card-foreground uppercase">{order.cliente}</span>
                      {order.descricao && order.descricao !== "-" && (
                        <>
                          <span className="text-sm text-muted-foreground">—</span>
                          <span className="text-sm text-muted-foreground truncate">{order.descricao}</span>
                        </>
                      )}
                    </div>

                    {sectorTimes.length > 0 && (
                      <div className="flex items-center gap-1 mt-2 flex-wrap text-[10px]">
                        {sectorTimes.map((st, idx) => (
                          <div key={idx} className="flex items-center gap-1">
                            {idx > 0 && <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/40 shrink-0" />}
                            <span className="inline-flex items-center gap-0.5 bg-muted px-1.5 py-0.5 rounded text-muted-foreground whitespace-nowrap">
                              {st.label}
                              <Clock className="h-2.5 w-2.5 ml-0.5" />
                              <span className="font-medium">{formatDuration(st.ms)}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {sectorTimes.length === 0 && (
                      <p className="text-[10px] text-muted-foreground/50 mt-1 italic">
                        Arquivado em {format(new Date(order.updated_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-1.5 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => onUnarchive(order.id)}>
                      <ArchiveRestore className="h-4 w-4 mr-1" /> Restaurar
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => onDelete(order.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}

          {hasMore && (
            <div className="flex justify-center pt-4 pb-2">
              <Button variant="outline" onClick={loadMore} className="gap-2">
                <ChevronDown className="h-4 w-4" />
                Carregar mais ({searchFiltered.length - visibleCount} restantes)
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
