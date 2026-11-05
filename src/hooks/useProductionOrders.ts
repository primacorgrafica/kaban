import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  subscribeOrdersIncremental,
  subscribeProfilesIncremental,
  subscribeReconcile,
  type OrderPayload,
} from "@/lib/realtimeManager";
import { invalidateApprovalEntry } from "@/lib/approvalEntryCache";
import { toast } from "sonner";
import { Order, Profile } from "@/types/order";
import { Department } from "@/types/production";
import { hasSpecialSuppliesForCompras, setComprasStatusInProcessos } from "@/lib/processos";
import { syncOrderToCompras, syncComprasStatusToParent } from "@/lib/comprasSync";
import { getEffectiveRelatedOrders, registerKnownOrders } from "@/lib/orderRelationsService";
import {
  hasProductionPriority,
  setObservationProductionPriority,
  cleanObservationProductionPriority,
} from "@/lib/productionPriority";

export function useProductionOrders() {
  const { user, authReady } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchProfiles = useCallback(async () => {
    const { data } = await supabase.from("profiles").select("id, user_id, nome, created_at");
    if (data) {
      const map: Record<string, Profile> = {};
      data.forEach((p) => { map[p.user_id] = p as Profile; });
      setProfiles(map);
    }
  }, []);

  const fetchOrders = useCallback(async () => {
    // PERFORMANCE (KAE Pilar 2):
    // Carrega ordens de produção ativas (arquivado = false).
    // Bate no índice idx_orders_active_setor_status_posicao e carrega em ~50ms.
    const PAGE_SIZE = 1000;
    const all: Order[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .not("setor", "is", null)
        .eq("arquivado", false)
        .order("posicao", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) {
        // ETAPA 6: NÃO limpar o state em caso de erro — preserva dados existentes
        console.error("Erro ao carregar ordens de produção (dados preservados):", error);
        return;
      }
      const batch = (data as Order[]) || [];
      all.push(...batch.map((r) => {
        const effectiveRelated = getEffectiveRelatedOrders(r);
        const hasPrio = hasProductionPriority(r);
        return {
          ...r,
          prioridade_producao: hasPrio,
          related_order_ids: (r.related_order_ids && r.related_order_ids.length > 0) ? r.related_order_ids : effectiveRelated,
        };
      }));
      if (batch.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    // Se for a rota exclusiva de faturamento, busca os arquivados de faturamento
    const isFaturamentoRoute = typeof window !== "undefined" && window.location.pathname.includes("faturamento");
    if (isFaturamentoRoute) {
      try {
        const { data: fatArchived } = await supabase
          .from("orders")
          .select("*")
          .eq("setor", "faturamento")
          .eq("arquivado", true)
          .order("updated_at", { ascending: false })
          .limit(200);
        if (fatArchived) {
          all.push(...(fatArchived as Order[]));
        }
      } catch (e) {
        console.warn("Erro ao buscar arquivados do faturamento:", e);
      }
    }

    setOrders(all);
    registerKnownOrders(all);
  }, [user]);


  // PERFORMANCE: merge incremental (ver useOrders.ts).
  const applyOrderPayload = useCallback((payload: OrderPayload | null) => {
    if (!payload) return;
    const eventType = (payload as any).eventType as "INSERT" | "UPDATE" | "DELETE";
    const newRow = (payload as any).new as Order | undefined;
    const oldRow = (payload as any).old as Order | undefined;

    if (eventType === "DELETE" && oldRow?.id) {
      setOrders((prev) => prev.filter((o) => o.id !== oldRow.id));
      return;
    }
    if (!newRow?.id) return;
    const effectiveRelated = getEffectiveRelatedOrders(newRow);
    const hasPrio = hasProductionPriority(newRow);
    const normalizedRow: Order = {
      ...newRow,
      prioridade_producao: hasPrio,
      related_order_ids: (newRow.related_order_ids && newRow.related_order_ids.length > 0) ? newRow.related_order_ids : effectiveRelated,
    };

    if (oldRow?.status !== newRow.status) {
      invalidateApprovalEntry(newRow.id);
    }

    setOrders((prev) => {
      const idx = prev.findIndex((o) => o.id === newRow.id);
      if (newRow.setor == null) {
        return idx === -1 ? prev : prev.filter((o) => o.id !== newRow.id);
      }
      if (idx === -1) return [...prev, normalizedRow];
      const copy = [...prev];
      copy[idx] = { ...copy[idx], ...normalizedRow };
      return copy;
    });
  }, []);

  useEffect(() => {
    if (!authReady || !user) {
      if (authReady) setLoading(false);
      return;
    }

    let isMounted = true;

    const loadInitialData = async () => {
      await Promise.all([fetchOrders(), fetchProfiles()]);
      if (isMounted) setLoading(false);
    };

    setLoading(true);
    void loadInitialData();

    const unsubOrders = subscribeOrdersIncremental(applyOrderPayload);
    const unsubProfiles = subscribeProfilesIncremental(() => { void fetchProfiles(); });
    const unsubReconcile = subscribeReconcile(() => {
      void fetchOrders();
      void fetchProfiles();
    });

    const handleRelationsUpdated = (e: Event) => {
      const custom = e as CustomEvent<{ orderId: string; relatedOrderIds: string[] }>;
      if (custom.detail?.orderId) {
        setOrders((prev) =>
          prev.map((o) => {
            if (o.id === custom.detail.orderId) {
              return { ...o, related_order_ids: custom.detail.relatedOrderIds };
            }
            return o;
          })
        );
      }
    };

    window.addEventListener("orders-relations-updated", handleRelationsUpdated);

    return () => {
      isMounted = false;
      window.removeEventListener("orders-relations-updated", handleRelationsUpdated);
      unsubOrders();
      unsubProfiles();
      unsubReconcile();
    };
  }, [authReady, user, applyOrderPayload]);

  const getProfileName = useCallback((userId: string | null) => {
    if (!userId) return null;
    return profiles[userId]?.nome || null;
  }, [profiles]);

  const sendToProduction = useCallback(async (orderId: string, department: Department) => {
    const order = orders.find(o => o.id === orderId);
    const isUrgent = order && (order.urgente_prova || order.urgente_impressao || order.urgente_acabamento || order.urgente_expedicao);
    const cleanObs = cleanObservationProductionPriority(order?.observacao);
    const prodPayload: any = {
      setor: department,
      setor_status: "entrada",
      maquina: null,
      posicao: isUrgent ? 0 : 9999,
      prioridade_producao: false,
      observacao: cleanObs,
      atualizado_por: user?.id || null,
    };

    let { error } = await supabase
      .from("orders")
      .update(prodPayload)
      .eq("id", orderId);

    if (error && (error.message?.includes("prioridade_producao") || (error as any).code === "42703" || (error as any).code === "PGRST204")) {
      delete prodPayload.prioridade_producao;
      const retry = await supabase.from("orders").update(prodPayload).eq("id", orderId);
      error = retry.error;
    }

    if (error) {
      if ((error as any).code === "23505") {
        toast.error(`Esta OS. já possui uma cópia ativa em ${department.toUpperCase()}.`);
      } else {
        toast.error("Erro ao enviar para produção");
      }
      console.error(error);
    } else {
      toast.success("OS. enviada para produção");
    }
  }, [user, orders]);

  const moveInDepartment = useCallback(async (orderId: string, newStatus: string, newIndex?: number) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    // Normaliza status alvo e busca demais ordens do mesmo departamento e status
    const targetStatus = newStatus || (order as any).setor_status || "entrada";

    const destOrders = orders
      .filter(o => 
        o.setor === order.setor && 
        ((o as any).setor_status || "entrada") === targetStatus && 
        o.id !== orderId &&
        (order.maquina ? o.maquina === order.maquina : true)
      )
      .sort((a, b) => {
        const posA = typeof a.posicao === "number" ? a.posicao : 9999;
        const posB = typeof b.posicao === "number" ? b.posicao : 9999;
        if (posA !== posB) return posA - posB;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });

    const targetIdx = newIndex !== undefined ? Math.min(Math.max(0, newIndex), destOrders.length) : destOrders.length;
    destOrders.splice(targetIdx, 0, { ...order, id: orderId, setor_status: targetStatus });

    const previousSnapshot = [...orders];

    let updatedProcsOnMovedCard = order.processos ? [...order.processos] : [];
    if (order.setor === "compras") {
      updatedProcsOnMovedCard = setComprasStatusInProcessos(updatedProcsOnMovedCard, targetStatus);
      if (targetStatus === "lancamento_ge" || targetStatus === "saida") {
        if (!updatedProcsOnMovedCard.some(p => p.startsWith("COMPRADO"))) {
          updatedProcsOnMovedCard.push(`COMPRADO:${Date.now()}:Compras`);
        }
      } else if (["entrada", "cotacao", "pedido"].includes(targetStatus)) {
        updatedProcsOnMovedCard = updatedProcsOnMovedCard.filter(p => !p.startsWith("COMPRADO") && !p.startsWith("COMPRA:ok"));
      }
    }

    // 1. Atualização otimista imediata no estado da interface
    setOrders(prev =>
      prev.map(o => {
        const foundIdx = destOrders.findIndex(d => d.id === o.id);
        if (foundIdx !== -1) {
          return {
            ...o,
            setor_status: targetStatus,
            posicao: foundIdx,
            processos: o.id === orderId && order.setor === "compras" ? updatedProcsOnMovedCard : o.processos,
          };
        }
        if (order.setor === "compras" && order.parent_order_id && o.id === order.parent_order_id) {
          let procs = setComprasStatusInProcessos(o.processos, targetStatus);
          if (targetStatus === "lancamento_ge" || targetStatus === "saida") {
            if (!procs.some(p => p.startsWith("COMPRADO"))) {
              procs.push(`COMPRADO:${Date.now()}:Compras`);
            }
          } else if (["entrada", "cotacao", "pedido"].includes(targetStatus)) {
            procs = procs.filter(p => !p.startsWith("COMPRADO") && !p.startsWith("COMPRA:ok"));
          }
          return { ...o, processos: procs };
        }
        return o;
      })
    );

    // Se o card for do setor de compras e tiver OS pai vinculada, sincroniza o status de compras no pai
    if (order.setor === "compras" && order.parent_order_id) {
      void syncComprasStatusToParent(order.parent_order_id, targetStatus, user?.id);
    }

    // 2. Persistência de todas as posições da coluna no Supabase
    const updates: PromiseLike<{ error: any }>[] = [];
    for (let i = 0; i < destOrders.length; i++) {
      const item = destOrders[i];
      if (item.id === orderId) {
        const payloadToUpdate: any = {
          setor_status: targetStatus,
          posicao: i,
          atualizado_por: user?.id || null,
        };
        if (order.setor === "compras") {
          payloadToUpdate.processos = updatedProcsOnMovedCard;
        }
        updates.push(
          supabase.from("orders").update(payloadToUpdate).eq("id", orderId)
        );
      } else {
        updates.push(
          supabase.from("orders").update({ posicao: i }).eq("id", item.id)
        );
      }
    }

    const results = await Promise.all(updates);
    const failed = results.find(r => r.error);
    if (failed) {
      console.error("Falha ao mover OS no setor. Revertendo:", failed.error);
      setOrders(previousSnapshot);
      toast.error("Erro ao mover OS. Posição restaurada.");
    }
  }, [user, orders]);

  const sendToDepartment = useCallback(async (orderId: string, department: Department, machine?: string) => {
    const order = orders.find(o => o.id === orderId);
    const isUrgent = order && (order.urgente_prova || order.urgente_impressao || order.urgente_acabamento || order.urgente_expedicao);
    const { error } = await supabase
      .from("orders")
      .update({
        setor: department,
        setor_status: "entrada",
        maquina: machine || null,
        posicao: isUrgent ? 0 : 9999,
        atualizado_por: user?.id || null,
      })
      .eq("id", orderId);

    if (error) {
      if ((error as any).code === "23505") {
        toast.error(`Esta OS. já possui uma cópia ativa em ${department.toUpperCase()}.`);
      } else {
        toast.error("Erro ao enviar para departamento");
      }
      console.error(error);
    } else {
      toast.success(`OS. enviada para ${department}`);
    }
  }, [user, orders]);

  const setMachine = useCallback(async (orderId: string, machine: string) => {
    const { error } = await supabase
      .from("orders")
      .update({ maquina: machine, atualizado_por: user?.id || null })
      .eq("id", orderId);
    if (error) toast.error("Erro ao definir máquina");
  }, [user]);

  const sendBackToPrePress = useCallback(async (id: string) => {
    const order = orders.find(o => o.id === id);
    const isUrgent = order && (order.urgente_prova || order.urgente_impressao || order.urgente_acabamento || order.urgente_expedicao);
    const cleanedObs = cleanObservationProductionPriority(order?.observacao);

    const payload: any = {
      setor: null,
      setor_status: null,
      maquina: null,
      status: "fila_de_entrada",
      posicao: isUrgent ? 0 : 9999,
      atualizado_por: user?.id || null,
      prioridade_producao: false,
      observacao: cleanedObs,
    };

    let { error } = await (supabase.from("orders") as any).update(payload).eq("id", id);
    if (error && ((error as any).code === "42703" || (error as any).code === "PGRST204" || error.message?.includes("prioridade_producao"))) {
      delete payload.prioridade_producao;
      const retry = await (supabase.from("orders") as any).update(payload).eq("id", id);
      error = retry.error;
    }

    if (error) {
      toast.error("Erro ao devolver para Pré-Impressão");
      console.error(error);
    } else {
      setOrders(prev => prev.filter(o => o.id !== id));
      toast.success("OS. devolvida para Pré-Impressão");
    }
  }, [user, orders]);

  const archiveOrder = useCallback(async (id: string) => {
    const { error } = await supabase.from("orders").update({ 
      arquivado: true, 
      atualizado_por: user?.id || null 
    }).eq("id", id);
    if (error) {
      toast.error("Erro ao arquivar");
      return;
    }
    // Arquivar sub-ordens (F, Q, P, M, C, NC) vinculadas a esta OS pai
    const { error: childError } = await supabase
      .from("orders")
      .update({ arquivado: true, atualizado_por: user?.id || null })
      .eq("parent_order_id", id);
    if (childError) console.error("Erro ao arquivar sub-ordens:", childError);
    toast.success("O.S. movida para O.S Concluídas!");
  }, [user]);

  const deleteOrder = useCallback(async (id: string) => {
    // 1. Tenta exclusão atômica via RPC delete_order_cascade
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc("delete_order_cascade" as any, {
        p_order_id: id,
      });

      if (!rpcError && rpcData && (rpcData as any)?.success && (rpcData as any)?.deleted_count > 0) {
        setOrders((prev) => prev.filter((o) => o.id !== id && o.parent_order_id !== id));
        toast.success("OS excluída com sucesso");
        return;
      }
    } catch {
      // Continua para fallback
    }

    // 2. Fallback: tentativa de DELETE físico direto
    try {
      await supabase.from("orders").delete().eq("parent_order_id", id);
      const { data: deletedRows, error } = await supabase
        .from("orders")
        .delete()
        .eq("id", id)
        .select("id");

      if (!error && deletedRows && deletedRows.length > 0) {
        setOrders((prev) => prev.filter((o) => o.id !== id && o.parent_order_id !== id));
        toast.success("OS excluída com sucesso");
        return;
      }
    } catch {
      // Continua para fallback resiliente
    }

    // 3. Fallback de remoção garantida:
    // Se a RLS do Supabase barrar o DELETE físico no banco remoto, realiza o arquivamento forçado imediato
    // (a permissão de UPDATE em orders é 100% liberada no Supabase para qualquer usuário autenticado)
    const { error: archiveError } = await supabase
      .from("orders")
      .update({
        arquivado: true,
        status: "arquivo_liberado",
        observacao: "[Removido] " + (orders.find((o) => o.id === id)?.observacao || ""),
        atualizado_por: user?.id || null,
      })
      .eq("id", id);

    await supabase
      .from("orders")
      .update({
        arquivado: true,
        status: "arquivo_liberado",
        atualizado_por: user?.id || null,
      })
      .eq("parent_order_id", id);

    if (archiveError) {
      toast.error("Erro ao remover OS no Supabase: " + archiveError.message);
    } else {
      setOrders((prev) => prev.filter((o) => o.id !== id && o.parent_order_id !== id));
      toast.success("OS removida do quadro!");
    }
  }, [user, orders]);

  const updateOrder = useCallback(
    async (id: string, data: Partial<Order>) => {
      const currentOrder = orders.find((o) => o.id === id);
      const updatePayload: any = { ...data, atualizado_por: user?.id || null };

      if (data.prioridade_producao !== undefined) {
        const targetObs = updatePayload.observacao !== undefined ? updatePayload.observacao : (currentOrder?.observacao || "");
        updatePayload.observacao = setObservationProductionPriority(targetObs, Boolean(data.prioridade_producao));
      }

      // Atualização otimista imediata no estado local
      setOrders((prev) =>
        prev.map((o) => {
          if (o.id === id) {
            return {
              ...o,
              ...data,
              ...(updatePayload.observacao !== undefined ? { observacao: updatePayload.observacao } : {}),
            };
          }
          return o;
        })
      );

      let { error } = await (supabase.from("orders") as any).update(updatePayload).eq("id", id);
      if (error && (error.message?.includes("prioridade_producao") || (error as any).code === "42703" || (error as any).code === "PGRST204")) {
        delete updatePayload.prioridade_producao;
        const retry = await (supabase.from("orders") as any).update(updatePayload).eq("id", id);
        error = retry.error;
      }
      if (error && (error.message?.includes("related_order_ids") || (error as any).code === "42703" || (error as any).code === "PGRST204")) {
        delete updatePayload.related_order_ids;
        const retry = await (supabase.from("orders") as any).update(updatePayload).eq("id", id);
        error = retry.error;
      }
      if (error) {
        toast.error("Erro ao atualizar OS.");
        console.error(error);
      }
    },
    [user, orders]
  );

  const filteredOrders = orders.filter((o) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      o.titulo.toLowerCase().includes(q) ||
      o.cliente.toLowerCase().includes(q) ||
      (o.observacao && o.observacao.toLowerCase().includes(q)) ||
      (o.vendedor && o.vendedor.toLowerCase().includes(q))
    );
  });

  const getOrdersByDepartment = useCallback((department: Department, machine?: string) => {
    return filteredOrders.filter(o => {
      if (o.setor !== department) return false;
      if (o.arquivado) return false;
      if (machine && o.maquina !== machine) return false;
      // Regra de Compras: Ordens de Serviço só chegam/aparecem em Compras se houver PANTONE ou OUTROS habilitados (ordens manuais avulsas sem parent_order_id continuam visíveis)
      if (department === "compras" && o.parent_order_id) {
        if (!hasSpecialSuppliesForCompras(o.processos)) return false;
      }
      return true;
    });
  }, [filteredOrders]);

  const getArchivedByDepartment = useCallback((department: Department) => {
    return filteredOrders.filter(o => o.setor === department && o.arquivado);
  }, [filteredOrders]);

  const unarchiveOrder = useCallback(async (id: string) => {
    const { error } = await supabase.from("orders").update({ arquivado: false, atualizado_por: user?.id || null }).eq("id", id);
    if (error) toast.error("Erro ao desarquivar");
  }, [user]);

  const getDepartmentCounts = useCallback(() => {
    const counts: Record<string, number> = {};
    filteredOrders.filter(o => !o.arquivado).forEach(o => {
      if (o.setor) {
        if (o.setor === "compras" && o.parent_order_id && !hasSpecialSuppliesForCompras(o.processos)) {
          return;
        }
        counts[o.setor] = (counts[o.setor] || 0) + 1;
      }
    });
    return counts;
  }, [filteredOrders]);

  return {
    orders: filteredOrders,
    profiles,
    loading,
    getProfileName,
    searchQuery,
    setSearchQuery,
    sendToProduction,
    moveInDepartment,
    sendToDepartment,
    sendBackToPrePress,
    setMachine,
    archiveOrder,
    unarchiveOrder,
    deleteOrder,
    updateOrder,
    getOrdersByDepartment,
    getArchivedByDepartment,
    getDepartmentCounts,
  };
}
