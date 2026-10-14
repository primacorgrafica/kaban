import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  CrmOpportunity,
  CrmStage,
  CrmClient,
  OpportunityStatus,
  OpportunityPriority,
} from "@/types/crm";
import { toast } from "sonner";

export interface CreateOpportunityInput {
  titulo: string;
  cliente_id?: string;
  cliente_nome: string;
  contato_nome?: string;
  contato_telefone?: string;
  contato_email?: string;
  origem_lead: string;
  servico_solicitado: string;
  descricao_necessidade?: string;
  valor_estimado: number;
  vendedor_id?: string;
  vendedor_nome?: string;
  prioridade: OpportunityPriority;
  etapa_id: string;
  prazo_fechamento_previsto?: string;
  proxima_acao_descricao?: string;
  proxima_acao_data?: string;
  tags?: string[];
}

export function useCrm() {
  const { user } = useAuth();
  const [stages, setStages] = useState<CrmStage[]>([]);
  const [opportunities, setOpportunities] = useState<CrmOpportunity[]>([]);
  const [clients, setClients] = useState<CrmClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStages = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("crm_etapas_funil")
        .select("*")
        .eq("ativo", true)
        .order("ordem", { ascending: true });

      if (error) throw error;
      setStages((data as CrmStage[]) || []);
    } catch (err: any) {
      console.error("Erro ao carregar etapas do CRM:", err);
    }
  }, []);

  const fetchOpportunities = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("crm_oportunidades")
        .select("*")
        .order("posicao", { ascending: true });

      if (error) throw error;
      setOpportunities((data as CrmOpportunity[]) || []);
    } catch (err: any) {
      console.error("Erro ao carregar oportunidades do CRM:", err);
      setError(err.message || "Erro ao carregar oportunidades.");
    }
  }, []);

  const fetchClients = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("crm_clientes")
        .select("*")
        .order("nome_fantasia", { ascending: true })
        .limit(200);

      if (error) throw error;
      setClients((data as CrmClient[]) || []);
    } catch (err: any) {
      console.error("Erro ao carregar clientes do CRM:", err);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchStages(), fetchOpportunities(), fetchClients()]);
    setLoading(false);
  }, [fetchStages, fetchOpportunities, fetchClients]);

  useEffect(() => {
    void refreshAll();

    // Inscrição Realtime para atualizações em tempo real
    const channel = supabase
      .channel("crm_realtime_channel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "crm_oportunidades" },
        () => {
          void fetchOpportunities();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "crm_etapas_funil" },
        () => {
          void fetchStages();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "crm_clientes" },
        () => {
          void fetchClients();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refreshAll, fetchOpportunities, fetchStages, fetchClients]);

  // Criar Oportunidade
  const createOpportunity = async (input: CreateOpportunityInput): Promise<CrmOpportunity | null> => {
    try {
      // Determina posição dentro da etapa
      const inStage = opportunities.filter((o) => o.etapa_id === input.etapa_id);
      const nextPos = inStage.length;

      const payload = {
        titulo: input.titulo.trim(),
        cliente_id: input.cliente_id || null,
        cliente_nome: input.cliente_nome.trim(),
        contato_nome: input.contato_nome?.trim() || null,
        contato_telefone: input.contato_telefone?.trim() || null,
        contato_email: input.contato_email?.trim() || null,
        origem_lead: input.origem_lead,
        servico_solicitado: input.servico_solicitado.trim(),
        descricao_necessidade: input.descricao_necessidade?.trim() || null,
        valor_estimado: Number(input.valor_estimado) || 0,
        vendedor_id: input.vendedor_id || null,
        vendedor_nome: input.vendedor_nome || null,
        prioridade: input.prioridade,
        etapa_id: input.etapa_id,
        posicao: nextPos,
        status: "aberta" as OpportunityStatus,
        prazo_fechamento_previsto: input.prazo_fechamento_previsto || null,
        proxima_acao_descricao: input.proxima_acao_descricao?.trim() || null,
        proxima_acao_data: input.proxima_acao_data || null,
        tags: input.tags || [],
        criado_por: user?.id || null,
        atualizado_por: user?.id || null,
      };

      const { data, error } = await supabase
        .from("crm_oportunidades")
        .insert(payload as any)
        .select()
        .single();

      if (error) throw error;

      // Registrar no histórico de auditoria
      if (data) {
        await supabase.from("crm_oportunidade_historico").insert({
          oportunidade_id: data.id,
          usuario_id: user?.id || null,
          tipo_evento: "criacao",
          descricao: `Oportunidade criada com valor estimado de R$ ${Number(data.valor_estimado).toFixed(2)}`,
          dados_novos: data,
        });
      }

      toast.success("Oportunidade cadastrada com sucesso!");
      void fetchOpportunities();
      return data as CrmOpportunity;
    } catch (err: any) {
      console.error("Erro ao criar oportunidade:", err);
      toast.error(err.message || "Falha ao cadastrar oportunidade.");
      return null;
    }
  };

  // Atualizar Oportunidade
  const updateOpportunity = async (
    id: string,
    updates: Partial<CrmOpportunity>
  ): Promise<boolean> => {
    try {
      const old = opportunities.find((o) => o.id === id);
      const payload: any = {
        ...updates,
        atualizado_por: user?.id || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("crm_oportunidades")
        .update(payload)
        .eq("id", id);

      if (error) throw error;

      // Registrar auditoria
      await supabase.from("crm_oportunidade_historico").insert({
        oportunidade_id: id,
        usuario_id: user?.id || null,
        tipo_evento: "edicao",
        descricao: "Dados da oportunidade atualizados.",
        dados_anteriores: old ? { valor_estimado: old.valor_estimado, prioridade: old.prioridade } : null,
        dados_novos: updates,
      });

      // Atualização otimista local
      setOpportunities((prev) =>
        prev.map((o) => (o.id === id ? { ...o, ...updates } : o))
      );
      toast.success("Oportunidade atualizada!");
      return true;
    } catch (err: any) {
      console.error("Erro ao atualizar oportunidade:", err);
      toast.error(err.message || "Falha ao atualizar oportunidade.");
      return false;
    }
  };

  // Mover etapa da oportunidade
  const moveOpportunityStage = async (
    opportunityId: string,
    targetStageId: string,
    newPos: number = 0
  ): Promise<boolean> => {
    const opp = opportunities.find((o) => o.id === opportunityId);
    if (!opp) return false;
    const oldStage = stages.find((s) => s.id === opp.etapa_id);
    const newStage = stages.find((s) => s.id === targetStageId);

    // Otimista
    setOpportunities((prev) =>
      prev.map((o) =>
        o.id === opportunityId
          ? {
              ...o,
              etapa_id: targetStageId,
              posicao: newPos,
              status: newStage?.tipo_sistema === "ganha" ? "fechada_ganha" : o.status,
            }
          : o
      )
    );

    try {
      const updates: any = {
        etapa_id: targetStageId,
        posicao: newPos,
        atualizado_por: user?.id || null,
        updated_at: new Date().toISOString(),
      };

      if (newStage?.tipo_sistema === "ganha") {
        updates.status = "fechada_ganha";
      }

      const { error } = await supabase
        .from("crm_oportunidades")
        .update(updates)
        .eq("id", opportunityId);

      if (error) throw error;

      // Histórico
      await supabase.from("crm_oportunidade_historico").insert({
        oportunidade_id: opportunityId,
        usuario_id: user?.id || null,
        tipo_evento: "etapa_alterada",
        descricao: `Etapa alterada de '${oldStage?.nome || "Origem"}' para '${newStage?.nome || "Destino"}'.`,
        dados_anteriores: { etapa_id: opp.etapa_id },
        dados_novos: { etapa_id: targetStageId },
      });

      return true;
    } catch (err: any) {
      console.error("Erro ao mover oportunidade:", err);
      toast.error("Erro ao mover etapa. Revertendo...");
      void fetchOpportunities();
      return false;
    }
  };

  // Marcar como Fechada Ganha
  const markAsWon = async (opportunityId: string): Promise<boolean> => {
    const wonStage = stages.find((s) => s.tipo_sistema === "ganha") || stages[stages.length - 1];
    return updateOpportunity(opportunityId, {
      status: "fechada_ganha",
      etapa_id: wonStage ? wonStage.id : undefined,
    });
  };

  // Marcar como Perdida com motivo
  const markAsLost = async (
    opportunityId: string,
    motivo: string,
    detalhes?: string
  ): Promise<boolean> => {
    try {
      const updates = {
        status: "fechada_perdida" as OpportunityStatus,
        motivo_perda: motivo,
        detalhes_motivo_perda: detalhes || null,
        atualizado_por: user?.id || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("crm_oportunidades")
        .update(updates)
        .eq("id", opportunityId);

      if (error) throw error;

      await supabase.from("crm_oportunidade_historico").insert({
        oportunidade_id: opportunityId,
        usuario_id: user?.id || null,
        tipo_evento: "status_perdida",
        descricao: `Oportunidade marcada como Perdida. Motivo: ${motivo}.`,
        dados_novos: updates,
      });

      setOpportunities((prev) =>
        prev.map((o) => (o.id === opportunityId ? { ...o, ...updates } : o))
      );
      toast.info("Oportunidade arquivada como perdida.");
      return true;
    } catch (err: any) {
      console.error("Erro ao registrar perda:", err);
      toast.error("Falha ao registrar perda.");
      return false;
    }
  };

  // Marcar como Pausada / Em Espera
  const markAsPaused = async (
    opportunityId: string,
    motivo?: string
  ): Promise<boolean> => {
    return updateOpportunity(opportunityId, {
      status: "pausada",
      detalhes_motivo_perda: motivo || "Em espera pelo cliente",
    });
  };

  // Excluir Oportunidade
  const deleteOpportunity = async (opportunityId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from("crm_oportunidades")
        .delete()
        .eq("id", opportunityId);

      if (error) throw error;

      setOpportunities((prev) => prev.filter((o) => o.id !== opportunityId));
      toast.success("Oportunidade excluída.");
      return true;
    } catch (err: any) {
      console.error("Erro ao excluir oportunidade:", err);
      toast.error(err.message || "Falha ao excluir.");
      return false;
    }
  };

  // Salvar ou Atualizar Cliente
  const saveClient = async (clientData: Partial<CrmClient>): Promise<CrmClient | null> => {
    try {
      if (clientData.id) {
        const { data, error } = await supabase
          .from("crm_clientes")
          .update({
            ...clientData,
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", clientData.id)
          .select()
          .single();

        if (error) throw error;
        toast.success("Cliente atualizado!");
        void fetchClients();
        return data as CrmClient;
      } else {
        const { data, error } = await supabase
          .from("crm_clientes")
          .insert({
            ...clientData,
            criado_por: user?.id || null,
          } as any)
          .select()
          .single();

        if (error) throw error;
        toast.success("Cliente cadastrado com sucesso!");
        void fetchClients();
        return data as CrmClient;
      }
    } catch (err: any) {
      console.error("Erro ao salvar cliente:", err);
      toast.error(err.message || "Falha ao salvar cliente.");
      return null;
    }
  };

  // Busca rápida de clientes existentes (tanto na base crm_clientes quanto no histórico da tabela orders)
  const searchKnownClients = async (query: string): Promise<Array<{ nome: string; cliente_id?: string; cnpj?: string; telefone?: string; email?: string }>> => {
    if (!query || query.trim().length < 2) return [];
    const q = query.trim().toLowerCase();

    // 1. Clientes no CRM
    const crmMatches = clients
      .filter((c) =>
        c.nome_fantasia.toLowerCase().includes(q) ||
        (c.razao_social && c.razao_social.toLowerCase().includes(q)) ||
        (c.cnpj_cpf && c.cnpj_cpf.includes(q))
      )
      .map((c) => ({
        nome: c.nome_fantasia,
        cliente_id: c.id,
        cnpj: c.cnpj_cpf || undefined,
        telefone: c.whatsapp || c.telefone || undefined,
        email: c.email || undefined,
      }));

    // 2. Clientes na tabela orders (para reutilização de históricos sem duplicar)
    try {
      const { data: orderData } = await supabase
        .from("orders")
        .select("cliente")
        .ilike("cliente", `%${q}%`)
        .limit(10);

      const orderNames = Array.from(new Set((orderData || []).map((o) => o.cliente.trim())));
      const combined = [...crmMatches];

      for (const name of orderNames) {
        if (!combined.some((item) => item.nome.toLowerCase() === name.toLowerCase())) {
          combined.push({ nome });
        }
      }
      return combined.slice(0, 15);
    } catch {
      return crmMatches;
    }
  };

  return {
    stages,
    opportunities,
    clients,
    loading,
    error,
    refreshAll,
    fetchOpportunities,
    createOpportunity,
    updateOpportunity,
    moveOpportunityStage,
    markAsWon,
    markAsLost,
    markAsPaused,
    deleteOpportunity,
    saveClient,
    searchKnownClients,
  };
}
