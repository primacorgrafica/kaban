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
    // PostgREST aplica um limite máximo (~1000) por requisição, mesmo com .range().
    // Paginamos manualmente para garantir que todas as OS com setor sejam carregadas.
    const PAGE_SIZE = 1000;
    const all: Order[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .not("setor", "is", null)
        .order("posicao", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) {
        // ETAPA 6: NÃO limpar o state em caso de erro — preserva dados existentes
        console.error("Erro ao carregar ordens de produção (dados preservados):", error);
        return;
      }
      const batch = (data as Order[]) || [];
      all.push(...batch);
      if (batch.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
    setOrders(all);
  }, []);


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

    if (oldRow?.status !== newRow.status) {
      invalidateApprovalEntry(newRow.id);
    }

    setOrders((prev) => {
      const idx = prev.findIndex((o) => o.id === newRow.id);
      if (newRow.setor == null) {
        return idx === -1 ? prev : prev.filter((o) => o.id !== newRow.id);
      }
      if (idx === -1) return [...prev, newRow];
      const copy = [...prev];
      copy[idx] = { ...copy[idx], ...newRow };
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

    return () => {
      isMounted = false;
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
    const { error } = await supabase
      .from("orders")
      .update({
        setor: department,
        setor_status: "entrada",
        maquina: null,
        posicao: isUrgent ? 0 : 9999,
        atualizado_por: user?.id || null,
      })
      .eq("id", orderId);

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

    const destOrders = orders
      .filter(o => 
        o.setor === order.setor && 
        (o as any).setor_status === newStatus && 
        o.id !== orderId &&
        (order.maquina ? o.maquina === order.maquina : true)
      )
      .sort((a, b) => a.posicao - b.posicao);

    const idx = newIndex !== undefined ? newIndex : destOrders.length;
    destOrders.splice(idx, 0, { id: orderId } as Order);

    const previousSnapshot = [...orders];

    // 1. Atualização otimista
    setOrders(prev =>
      prev.map(o => {
        if (o.id === orderId) {
          return { ...o, setor_status: newStatus, posicao: idx };
        }
        const foundIdx = destOrders.findIndex(d => d.id === o.id);
        if (foundIdx !== -1) {
          return { ...o, posicao: foundIdx };
        }
        return o;
      })
    );

    const updates: PromiseLike<{ error: any }>[] = [];
    for (let i = 0; i < destOrders.length; i++) {
      if (destOrders[i].id === orderId) {
        updates.push(
          supabase.from("orders").update({
            setor_status: newStatus,
            posicao: i,
            atualizado_por: user?.id || null,
          }).eq("id", orderId)
        );
      } else if (destOrders[i].posicao !== i) {
        updates.push(
          supabase.from("orders").update({ posicao: i }).eq("id", destOrders[i].id)
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
    const { error } = await supabase
      .from("orders")
      .update({
        setor: null,
        setor_status: null,
        maquina: null,
        status: "fila_de_entrada",
        posicao: isUrgent ? 0 : 9999,
        atualizado_por: user?.id || null,
      })
      .eq("id", id);

    if (error) {
      toast.error("Erro ao devolver para Pré-Impressão");
      console.error(error);
    } else {
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
  }, [user]);

  const deleteOrder = useCallback(async (id: string) => {
    // Excluir proativamente sub-ordens vinculadas à OS pai para garantir integridade
    const { error: childError } = await supabase
      .from("orders")
      .delete()
      .eq("parent_order_id", id);
    if (childError) console.error("Erro ao excluir sub-ordens filhas:", childError);

    const { error } = await supabase.from("orders").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir OS: " + (error.message || "Acesso negado"));
    } else {
      toast.success("OS excluída com sucesso");
    }
  }, []);

  const updateOrder = useCallback(
    async (id: string, data: Partial<Order>) => {
      const { error } = await supabase.from("orders").update({ ...data, atualizado_por: user?.id || null }).eq("id", id);
      if (error) {
        toast.error("Erro ao atualizar OS.");
        console.error(error);
      }
    },
    [user]
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
