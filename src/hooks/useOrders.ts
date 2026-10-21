import { getOrderRevision, setObservationRevision, isReturnToPreparation } from "@/lib/orderRevision";
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
import { syncServerTimeOffset } from "@/lib/businessHours";
import { toast } from "sonner";
import { Order, OrderStatus, Profile, STATUS_CONFIG } from "@/types/order";
import { Department } from "@/types/production";

export function useOrders() {
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
    // Paginação: o Supabase limita a 1000 linhas por consulta.
    // Buscamos em páginas de 1000 até esgotar para garantir que nenhuma OS suma.
    const PAGE_SIZE = 1000;
    const all: Order[] = [];
    let from = 0;
    let hadError = false;

    while (true) {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("posicao", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        // ETAPA 6: NÃO limpar o state em caso de erro — preserva dados existentes
        console.error("Erro ao carregar ordens (dados preservados):", error);
        hadError = true;
        break;
      }

      const rows = (data as Order[]) || [];
      all.push(...rows.map(r => ({ ...r, revisao: getOrderRevision(r) })));
      if (rows.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    if (!hadError) {
      setOrders(all);
      if (all.length > 0 && all[0].created_at) {
        syncServerTimeOffset(all[0].created_at);
      }
    }
  }, []);

  // PERFORMANCE: merge incremental do payload em vez de refetch completo.
  // Refetch só roda no load inicial; eventos posteriores aplicam INSERT/UPDATE/DELETE
  // diretamente no array em memória, evitando ~67s de CPU por sessão.
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
    const normalizedRow: Order = { ...newRow, revisao: getOrderRevision(newRow) };

    if (oldRow?.status !== newRow.status) {
      invalidateApprovalEntry(newRow.id);
    }

    setOrders((prev) => {
      const idx = prev.findIndex((o) => o.id === newRow.id);
      if (idx === -1) {
        if (eventType === "INSERT") return [...prev, normalizedRow];
        return prev;
      }
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

  const addOrder = useCallback(
    async (data: {
      titulo: string; descricao: string; cliente: string; observacao?: string; obs_prova?: string;
      saida_direta?: boolean; prova_digital?: boolean; prova_email?: boolean;
      endereco_entrega?: string; destinatario?: string;
      urgente?: boolean; urgente_prova?: boolean; urgente_impressao?: boolean; urgente_acabamento?: boolean; urgente_expedicao?: boolean; digital_color?: boolean; digital_pb?: boolean; prazo?: string; vendedor?: string;
      tipo_trabalho?: string; os_anterior?: string; equipamentos?: string[]; acabamentos?: string[];
      processos?: string[]; nf?: string; protocolo?: string; empresa_entrega?: string; obs_entrega?: string;
      tipo_entrega?: string[]; entrega_para?: string; entrega_endereco?: string; entrega_ac?: string; entrega_data_limite?: string;
      status_destino?: string; setor_destino?: string;
    }) => {
      const isUrgente = data.urgente === true;
      const sendToSetor = data.setor_destino || null;

      if (!sendToSetor && isUrgente) {
        // Tenta acionar RPC de deslocamento atômico no PostgreSQL
        const { error: rpcErr } = await supabase.rpc("shift_orders_for_urgent", { p_status: "fila_de_entrada" });
        if (rpcErr) {
          const { data: existingOrders } = await supabase
            .from("orders")
            .select("id, posicao")
            .eq("status", "fila_de_entrada")
            .eq("arquivado", false)
            .order("posicao", { ascending: true });

          if (existingOrders && existingOrders.length > 0) {
            await Promise.all(
              existingOrders.map((o: any) =>
                supabase.from("orders").update({ posicao: o.posicao + 1 }).eq("id", o.id)
              )
            );
          }
        }
      }

      const newPos = sendToSetor
        ? (isUrgente ? 0 : 9999)
        : isUrgente
        ? 0
        : await (async () => {
            const { data: maxData } = await supabase
              .from("orders")
              .select("posicao")
              .eq("status", "fila_de_entrada")
              .eq("arquivado", false)
              .order("posicao", { ascending: false })
              .limit(1);
            return maxData && maxData.length > 0 ? (maxData[0] as any).posicao + 1 : 0;
          })();

      const insertPayload: any = {
        titulo: data.titulo,
        descricao: data.descricao,
        cliente: data.cliente,
        observacao: data.observacao || null,
        obs_prova: data.obs_prova || null,
        saida_direta: data.saida_direta || false,
        prova_digital: data.prova_digital || false,
        prova_email: data.prova_email || false,
        prioridade: data.urgente ? "alta" : "normal",
        urgente: data.urgente || false,
        urgente_prova: data.urgente_prova || false,
        urgente_impressao: data.urgente_impressao || false,
        urgente_acabamento: data.urgente_acabamento || false,
        urgente_expedicao: data.urgente_expedicao || false,
        digital_color: data.digital_color || false,
        digital_pb: data.digital_pb || false,
        prazo: data.prazo || null,
        endereco_entrega: data.endereco_entrega || null,
        destinatario: data.destinatario || null,
        criado_por: user?.id || null,
        atualizado_por: user?.id || null,
        posicao: newPos,
        setor: sendToSetor,
        setor_status: sendToSetor ? "entrada" : null,
        vendedor: data.vendedor || null,
        tipo_trabalho: data.tipo_trabalho || null,
        os_anterior: data.os_anterior || null,
        equipamentos: data.equipamentos || [],
        acabamentos: data.acabamentos || [],
        processos: data.processos || [],
        nf: data.nf || null,
        protocolo: data.protocolo || null,
        empresa_entrega: data.empresa_entrega || null,
        obs_entrega: data.obs_entrega || null,
        tipo_entrega: data.tipo_entrega || [],
        entrega_para: data.entrega_para || null,
        entrega_endereco: data.entrega_endereco || null,
        entrega_ac: data.entrega_ac || null,
        entrega_data_limite: data.entrega_data_limite || null,
      };

      let { data: created, error } = await supabase
        .from("orders")
        .insert(insertPayload as any)
        .select()
        .single();

      if (error && (error.message?.includes("os_anterior") || error.details?.includes("os_anterior") || (error as any).code === "PGRST204" || (error as any).code === "42703")) {
        delete insertPayload.os_anterior;
        if (data.os_anterior) {
          const prefix = `[N.º O.S ANTERIOR: ${data.os_anterior}]`;
          insertPayload.observacao = insertPayload.observacao ? `${prefix} ${insertPayload.observacao}` : prefix;
        }
        const retry = await supabase.from("orders").insert(insertPayload as any).select().single();
        created = retry.data;
        error = retry.error;
      }

      if (error) {
        toast.error("Erro ao criar OS.");
        console.error(error);
        return null;
      }
      return created as Order;
    },
    [user]
  );

  const duplicateOrder = useCallback(
    async (order: Order) => {
      const { data: maxData } = await supabase
        .from("orders")
        .select("posicao")
        .eq("status", "fila_de_entrada")
        .eq("arquivado", false)
        .order("posicao", { ascending: false })
        .limit(1);
      const newPos = maxData && maxData.length > 0 ? (maxData[0] as any).posicao + 1 : 0;

      const { error } = await supabase.from("orders").insert({
        titulo: order.titulo + " (cópia)",
        descricao: order.descricao,
        cliente: order.cliente,
        observacao: order.observacao || null,
        obs_prova: order.obs_prova || null,
        saida_direta: order.saida_direta || false,
        prova_digital: order.prova_digital || false,
        prova_email: order.prova_email || false,
        prioridade: order.prioridade || "normal",
        urgente: order.urgente || false,
        urgente_prova: order.urgente_prova || false,
        urgente_impressao: order.urgente_impressao || false,
        urgente_acabamento: order.urgente_acabamento || false,
        urgente_expedicao: order.urgente_expedicao || false,
        digital_color: (order as any).digital_color || false,
        digital_pb: (order as any).digital_pb || false,
        prazo: order.prazo || null,
        endereco_entrega: order.endereco_entrega || null,
        destinatario: order.destinatario || null,
        criado_por: user?.id || null,
        atualizado_por: user?.id || null,
        posicao: newPos,
        vendedor: order.vendedor || null,
        tipo_trabalho: order.tipo_trabalho || null,
        os_anterior: order.os_anterior || null,
        equipamentos: order.equipamentos || [],
        acabamentos: order.acabamentos || [],
        processos: order.processos || [],
        nf: order.nf || null,
        protocolo: order.protocolo || null,
        empresa_entrega: order.empresa_entrega || null,
        obs_entrega: order.obs_entrega || null,
        tipo_entrega: order.tipo_entrega || [],
        entrega_para: order.entrega_para || null,
        entrega_endereco: order.entrega_endereco || null,
        entrega_ac: order.entrega_ac || null,
        entrega_data_limite: order.entrega_data_limite || null,
      } as any);
      if (error) {
        toast.error("Erro ao duplicar OS.");
        console.error(error);
      } else {
        toast.success("OS. duplicada com sucesso!");
      }
    },
    [user]
  );

  const updateOrder = useCallback(
    async (id: string, data: Partial<Order>) => {
      let updatePayload: any = { ...data, atualizado_por: user?.id || null };
      if (data.revisao !== undefined) {
        const currentOrder = orders.find(o => o.id === id);
        const targetObs = data.observacao !== undefined ? data.observacao : currentOrder?.observacao;
        updatePayload.observacao = setObservationRevision(targetObs, data.revisao || 1);
      }
      setOrders(prev => prev.map(o => o.id === id ? { ...o, ...data, ...(updatePayload.observacao !== undefined ? { observacao: updatePayload.observacao } : {}) } : o));

      let { error } = await supabase.from("orders").update(updatePayload as any).eq("id", id);
      if (error && (error.message?.includes("os_anterior") || error.details?.includes("os_anterior") || (error as any).code === "PGRST204" || (error as any).code === "42703")) {
        delete updatePayload.os_anterior;
        const retry = await supabase.from("orders").update(updatePayload as any).eq("id", id);
        error = retry.error;
      }
      if (error && (error.message?.includes("revisao") || error.details?.includes("revisao") || (error as any).code === "PGRST204" || (error as any).code === "42703")) {
        delete updatePayload.revisao;
        const retry = await supabase.from("orders").update(updatePayload as any).eq("id", id);
        error = retry.error;
      }
      if (error) {
        toast.error("Erro ao atualizar OS.");
        console.error(error);
      }
    },
    [user, orders]
  );

  const moveOrder = useCallback(async (id: string, newStatus: OrderStatus, newIndex?: number, newRevisao?: number) => {
    const currentOrder = orders.find(o => o.id === id);
    if (!currentOrder) return;
    const oldStatus = currentOrder.status;
    const oldPos = currentOrder.posicao;
    const previousSnapshot = [...orders];

    let effectiveRevisao = newRevisao;
    if (effectiveRevisao === undefined && isReturnToPreparation(oldStatus, newStatus)) {
      effectiveRevisao = getOrderRevision(currentOrder) + 1;
    }
    if (effectiveRevisao === undefined) {
      effectiveRevisao = getOrderRevision(currentOrder);
    }
    const effectiveObservacao = effectiveRevisao !== getOrderRevision(currentOrder)
      ? setObservationRevision(currentOrder.observacao, effectiveRevisao)
      : currentOrder.observacao;

    const destOrders = orders
      .filter(o => o.status === newStatus && !o.arquivado && o.id !== id)
      .sort((a, b) => a.posicao - b.posicao);

    const idx = newIndex !== undefined ? newIndex : destOrders.length;
    destOrders.splice(idx, 0, {
      ...currentOrder,
      status: newStatus,
      posicao: idx,
      revisao: effectiveRevisao,
      observacao: effectiveObservacao
    });

    const orderIds = destOrders.map(o => o.id);

    // 1. Atualização otimista imediata na interface
    setOrders(prev =>
      prev.map(o => {
        if (o.id === id) {
          return {
            ...o,
            status: newStatus,
            posicao: idx,
            revisao: effectiveRevisao,
            observacao: effectiveObservacao,
          };
        }
        const foundIdx = destOrders.findIndex(d => d.id === o.id);
        if (foundIdx !== -1) {
          return { ...o, posicao: foundIdx };
        }
        return o;
      })
    );

    // 2. Persistência atômica no servidor
    const { error: rpcErr } = await (supabase.rpc as any)("reorder_orders_atomic", {
      p_order_ids: orderIds,
      p_status: newStatus as string,
    });

    if (currentOrder.setor === "desenvolvimento") {
      void supabase.from("orders").update({ setor: null, setor_status: null }).eq("id", id);
    }
    if (effectiveRevisao !== getOrderRevision(currentOrder)) {
      void updateOrder(id, { revisao: effectiveRevisao, observacao: effectiveObservacao });
    }

    if (rpcErr) {
      // Fallback para updates diretos
      const updates: PromiseLike<{ error: any }>[] = [];
      for (let i = 0; i < destOrders.length; i++) {
        if (destOrders[i].id === id) {
          updates.push(
            supabase.from("orders").update({ status: newStatus as string, setor: null, setor_status: null, posicao: i, atualizado_por: user?.id || null }).eq("id", id)
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
        // Rollback transacional para restaurar estado exato e evitar divergência
        console.error("Falha ao mover OS. Revertendo estado local:", failed.error);
        setOrders(previousSnapshot);
        toast.error("Conflito ou falha ao salvar movimentação. Posição restaurada.");
        return;
      }
    }

    // Feedback com ação rápida de Desfazer (Undo)
    if (effectiveRevisao && effectiveRevisao >= 2 && isReturnToPreparation(oldStatus, newStatus)) {
      toast.success(`OS retornou para Preparação (REV${effectiveRevisao})!`);
    } else if (oldStatus && oldStatus !== newStatus) {
      const targetLabel = STATUS_CONFIG[newStatus]?.label || newStatus;
      toast.success(`OS movida para ${targetLabel}`, {
        action: {
          label: "Desfazer",
          onClick: () => {
            moveOrder(id, oldStatus, oldPos, currentOrder.revisao || 1);
          },
        },
      });
    }
  }, [orders, user]);

  const archiveOrder = useCallback(async (id: string) => {
    const { error } = await supabase.from("orders").update({ arquivado: true, atualizado_por: user?.id || null }).eq("id", id);
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

  const unarchiveOrder = useCallback(async (id: string) => {
    const { error } = await supabase.from("orders").update({ arquivado: false, atualizado_por: user?.id || null }).eq("id", id);
    if (error) toast.error("Erro ao desarquivar");
  }, [user]);

  const deleteOrder = useCallback(async (id: string) => {
    // Excluir proativamente sub-ordens vinculadas à OS pai para garantir que não restem órfãos
    const { error: childError } = await supabase
      .from("orders")
      .delete()
      .eq("parent_order_id", id);
    if (childError) console.error("Erro ao excluir sub-ordens vinculadas:", childError);

    const { error } = await supabase.from("orders").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir OS: " + (error.message || "Acesso negado"));
    } else {
      toast.success("OS excluída com sucesso");
    }
  }, []);

  const copyOrderFields = (o: Order) => ({
    titulo: o.titulo,
    descricao: o.descricao,
    cliente: o.cliente,
    observacao: o.observacao,
    status: o.status,
    saida_direta: o.saida_direta,
    prova_digital: o.prova_digital,
    prova_email: o.prova_email,
    prioridade: o.prioridade,
    urgente: o.urgente,
    prazo: o.prazo,
    vendedor: o.vendedor,
    tipo_trabalho: o.tipo_trabalho,
    os_anterior: o.os_anterior,
    revisao: o.revisao,
    equipamentos: o.equipamentos,
    acabamentos: o.acabamentos,
    processos: o.processos,
    nf: o.nf,
    protocolo: o.protocolo,
    empresa_entrega: o.empresa_entrega,
    obs_entrega: o.obs_entrega,
    endereco_entrega: o.endereco_entrega,
    destinatario: o.destinatario,
    tipo_entrega: o.tipo_entrega || [],
    entrega_para: o.entrega_para,
    entrega_endereco: o.entrega_endereco,
    entrega_ac: o.entrega_ac,
    entrega_data_limite: o.entrega_data_limite,
  });

  const sendToProduction = useCallback(async (orderId: string, department: Department, machine?: string) => {
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
        toast.error("Erro ao enviar para produção");
      }
      console.error(error);
    } else {
      toast.success("OS. enviada para produção!");
    }
  }, [user, orders]);

  const sendToExpedicao = useCallback(async (orderId: string) => {
    const originalOrder = orders.find(o => o.id === orderId);
    if (!originalOrder) return;
    const isUrgent = originalOrder.urgente_prova || originalOrder.urgente_impressao || originalOrder.urgente_acabamento || originalOrder.urgente_expedicao;

    const { error } = await supabase.from("orders").insert({
      ...copyOrderFields(originalOrder),
      criado_por: originalOrder.criado_por,
      atualizado_por: user?.id || null,
      setor: "expedicao",
      setor_status: "entrada",
      maquina: "Moto",
      posicao: isUrgent ? 0 : 9999,
      parent_order_id: orderId,
    } as any);

    if (error) {
      if ((error as any).code === "23505") {
        toast.error("Esta OS. já possui uma cópia ativa em EXPEDIÇÃO.");
      } else {
        toast.error("Erro ao enviar para expedição");
      }
      console.error(error);
    } else {
      toast.success("Cópia enviada para Expedição!");
    }
  }, [user, orders]);

  const sendToMultipleProduction = useCallback(async (orderId: string, departments: { department: Department; machine?: string }[]) => {
    if (departments.length === 0) return;

    const originalOrder = orders.find(o => o.id === orderId);
    if (!originalOrder) return;
    const isUrgent = originalOrder.urgente_prova || originalOrder.urgente_impressao || originalOrder.urgente_acabamento || originalOrder.urgente_expedicao;

    // Remove setores repetidos na mesma seleção
    const uniqueDepartments = departments.filter(
      (d, i) => departments.findIndex(x => x.department === d.department) === i
    );

    if (uniqueDepartments.length === 1) {
      await sendToProduction(orderId, uniqueDepartments[0].department, uniqueDepartments[0].machine);
      return;
    }

    const [first, ...rest] = uniqueDepartments;

    const { error: updateError } = await supabase
      .from("orders")
      .update({
        setor: first.department,
        setor_status: "entrada",
        maquina: first.machine || null,
        posicao: isUrgent ? 0 : 9999,
        atualizado_por: user?.id || null,
      })
      .eq("id", orderId);

    if (updateError) {
      if ((updateError as any).code === "23505") {
        toast.error(`Esta OS. já possui uma cópia ativa em ${first.department.toUpperCase()}.`);
      } else {
        toast.error("Erro ao enviar para produção");
      }
      console.error(updateError);
      return;
    }

    let created = 1;
    for (const dept of rest) {
      const { error: insertError } = await supabase.from("orders").insert({
        ...copyOrderFields(originalOrder),
        criado_por: originalOrder.criado_por,
        atualizado_por: user?.id || null,
        setor: dept.department,
        setor_status: "entrada",
        maquina: dept.machine || null,
        posicao: isUrgent ? 0 : 9999,
        parent_order_id: orderId,
      } as any);

      if (insertError) {
        if ((insertError as any).code === "23505") {
          toast.error(`Esta OS. já possui uma cópia ativa em ${dept.department.toUpperCase()}.`);
        } else {
          toast.error(`Erro ao criar sub-ordem para ${dept.department}`);
        }
        console.error(insertError);
      } else {
        created++;
      }
    }

    toast.success(`OS. enviada para ${created} setor(es)!`);
  }, [user, orders, sendToProduction]);

  const VALID_EXTERNAL_SECTORS = ["qualidade", "expedicao", "compras", "manutencao"];
  const isPreImpressao = (o: Order) => !o.setor || !VALID_EXTERNAL_SECTORS.includes(o.setor);

  const filteredOrders = orders.filter((o) => {
    if (!searchQuery) return isPreImpressao(o);
    // Exclude sub-orders (P, F, NC, etc.) from search results
    if (o.parent_order_id) return false;
    const q = searchQuery.toLowerCase();
    return (
      o.titulo.toLowerCase().includes(q) ||
      o.cliente.toLowerCase().includes(q) ||
      (o.observacao && o.observacao.toLowerCase().includes(q)) ||
      (o.vendedor && o.vendedor.toLowerCase().includes(q))
    );
  });

  const activeOrders = filteredOrders.filter((o) => !o.arquivado);
  const archivedOrders = searchQuery
    ? filteredOrders.filter((o) => o.arquivado)
    : filteredOrders.filter((o) => o.arquivado && isPreImpressao(o));

  return {
    orders,
    activeOrders,
    archivedOrders,
    profiles,
    getProfileName,
    searchQuery,
    setSearchQuery,
    addOrder,
    duplicateOrder,
    updateOrder,
    moveOrder,
    archiveOrder,
    unarchiveOrder,
    deleteOrder,
    sendToProduction,
    sendToMultipleProduction,
    sendToExpedicao,
    loading,
  };
}
