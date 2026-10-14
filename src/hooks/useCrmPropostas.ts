import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CrmProposal, CrmProposalItem, ProposalStatus } from "@/types/crm";
import { toast } from "sonner";

export interface CreateProposalInput {
  oportunidade_id: string;
  condicoes_pagamento?: string;
  prazo_producao_dias?: number;
  validade_dias?: number;
  desconto_percentual?: number;
  desconto_valor?: number;
  observacoes?: string;
  itens: Array<{
    descricao_item: string;
    formato_aberto?: string;
    formato_fechado?: string;
    papel_substrato?: string;
    cores_impressao?: string;
    acabamentos_especiais?: string;
    quantidade: number;
    preco_unitario: number;
  }>;
}

export function useCrmPropostas(oportunidadeId?: string) {
  const { user } = useAuth();
  const [proposals, setProposals] = useState<CrmProposal[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchProposals = useCallback(async () => {
    if (!oportunidadeId) return;
    setLoading(true);
    try {
      // 1. Carrega propostas ordenadas pela versão mais recente
      const { data: propData, error: propErr } = await supabase
        .from("crm_propostas")
        .select("*")
        .eq("oportunidade_id", oportunidadeId)
        .order("versao_numero", { ascending: false });

      if (propErr) throw propErr;

      const propList = (propData as CrmProposal[]) || [];

      // 2. Carrega itens para as propostas
      if (propList.length > 0) {
        const propIds = propList.map((p) => p.id);
        const { data: itemsData, error: itemsErr } = await supabase
          .from("crm_proposta_itens")
          .select("*")
          .in("proposta_id", propIds)
          .order("posicao", { ascending: true });

        if (itemsErr) throw itemsErr;

        const itemsByProp: Record<string, CrmProposalItem[]> = {};
        (itemsData || []).forEach((it: any) => {
          if (!itemsByProp[it.proposta_id]) itemsByProp[it.proposta_id] = [];
          itemsByProp[it.proposta_id].push(it as CrmProposalItem);
        });

        propList.forEach((p) => {
          p.itens = itemsByProp[p.id] || [];
        });
      }

      setProposals(propList);
    } catch (err: any) {
      console.error("Erro ao carregar propostas:", err);
      toast.error("Falha ao carregar propostas do orçamento.");
    } finally {
      setLoading(false);
    }
  }, [oportunidadeId]);

  useEffect(() => {
    if (oportunidadeId) {
      void fetchProposals();
    }
  }, [oportunidadeId, fetchProposals]);

  // Criação da primeira proposta (v1)
  const createProposal = async (input: CreateProposalInput): Promise<CrmProposal | null> => {
    try {
      // Calcula total bruto dos itens
      let subtotalTotal = 0;
      const parsedItens = input.itens.map((it, idx) => {
        const sub = it.quantidade * it.preco_unitario;
        subtotalTotal += sub;
        return {
          ...it,
          posicao: idx + 1,
          subtotal: sub,
        };
      });

      const descPercent = input.desconto_percentual || 0;
      const descValor = input.desconto_valor || (subtotalTotal * descPercent) / 100;
      const valorLiquido = Math.max(0, subtotalTotal - descValor);

      const validadeDias = input.validade_dias || 10;
      const dataValidade = new Date();
      dataValidade.setDate(dataValidade.getDate() + validadeDias);

      // Gera número da proposta baseado no código ou timestamp
      const versao = 1;
      const numeroProposta = `PROP-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}-v${versao}`;

      const { data: propData, error: propErr } = await supabase
        .from("crm_propostas")
        .insert({
          oportunidade_id: input.oportunidade_id,
          numero_proposta: numeroProposta,
          versao_numero: versao,
          valor_total: subtotalTotal,
          desconto_percentual: descPercent,
          desconto_valor: descValor,
          valor_liquido: valorLiquido,
          condicoes_pagamento: input.condicoes_pagamento || null,
          prazo_producao_dias: input.prazo_producao_dias || null,
          validade_dias: validadeDias,
          data_validade: dataValidade.toISOString(),
          status: "rascunho" as ProposalStatus,
          observacoes: input.observacoes || null,
          criado_por: user?.id || null,
        } as any)
        .select()
        .single();

      if (propErr) throw propErr;

      // Inserção dos itens da proposta
      if (parsedItens.length > 0) {
        const itensToInsert = parsedItens.map((it) => ({
          proposta_id: propData.id,
          posicao: it.posicao,
          descricao_item: it.descricao_item,
          formato_aberto: it.formato_aberto || null,
          formato_fechado: it.formato_fechado || null,
          papel_substrato: it.papel_substrato || null,
          cores_impressao: it.cores_impressao || null,
          acabamentos_especiais: it.acabamentos_especiais || null,
          quantidade: it.quantidade,
          preco_unitario: it.preco_unitario,
          subtotal: it.subtotal,
        }));

        const { error: itemInsertErr } = await supabase
          .from("crm_proposta_itens")
          .insert(itensToInsert as any);

        if (itemInsertErr) throw itemInsertErr;
      }

      // Atualiza o valor estimado da oportunidade para coincidir com o valor líquido da proposta
      await supabase
        .from("crm_oportunidades")
        .update({
          valor_estimado: valorLiquido,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.oportunidade_id);

      // Histórico
      await supabase.from("crm_oportunidade_historico").insert({
        oportunidade_id: input.oportunidade_id,
        usuario_id: user?.id || null,
        tipo_evento: "proposta_criada",
        descricao: `Proposta ${numeroProposta} gerada no valor de R$ ${valorLiquido.toFixed(2)}.`,
      });

      toast.success("Orçamento gerado com sucesso!");
      void fetchProposals();
      return propData as CrmProposal;
    } catch (err: any) {
      console.error("Erro ao criar proposta:", err);
      toast.error(err.message || "Falha ao gerar proposta.");
      return null;
    }
  };

  // Criação de Nova Revisão (v1 -> v2, v3...), preservando a anterior
  const createRevision = async (
    currentProposalId: string,
    revisedInput: CreateProposalInput
  ): Promise<CrmProposal | null> => {
    try {
      const current = proposals.find((p) => p.id === currentProposalId);
      const nextVersion = (current?.versao_numero || 1) + 1;
      const baseNum = current?.numero_proposta.replace(/-v\d+$/, "") || `PROP-${new Date().getFullYear()}`;
      const newNumero = `${baseNum}-v${nextVersion}`;

      // 1. Marca a proposta anterior como 'revisada' (imutável no histórico)
      await supabase
        .from("crm_propostas")
        .update({
          status: "revisada",
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentProposalId);

      // 2. Calcula totais da nova versão
      let subtotalTotal = 0;
      const parsedItens = revisedInput.itens.map((it, idx) => {
        const sub = it.quantidade * it.preco_unitario;
        subtotalTotal += sub;
        return { ...it, posicao: idx + 1, subtotal: sub };
      });

      const descPercent = revisedInput.desconto_percentual || 0;
      const descValor = revisedInput.desconto_valor || (subtotalTotal * descPercent) / 100;
      const valorLiquido = Math.max(0, subtotalTotal - descValor);

      const validadeDias = revisedInput.validade_dias || 10;
      const dataValidade = new Date();
      dataValidade.setDate(dataValidade.getDate() + validadeDias);

      // 3. Insere a nova versão
      const { data: newProp, error: newPropErr } = await supabase
        .from("crm_propostas")
        .insert({
          oportunidade_id: revisedInput.oportunidade_id,
          numero_proposta: newNumero,
          versao_numero: nextVersion,
          proposta_anterior_id: currentProposalId,
          valor_total: subtotalTotal,
          desconto_percentual: descPercent,
          desconto_valor: descValor,
          valor_liquido: valorLiquido,
          condicoes_pagamento: revisedInput.condicoes_pagamento || null,
          prazo_producao_dias: revisedInput.prazo_producao_dias || null,
          validade_dias: validadeDias,
          data_validade: dataValidade.toISOString(),
          status: "rascunho" as ProposalStatus,
          observacoes: revisedInput.observacoes || null,
          criado_por: user?.id || null,
        } as any)
        .select()
        .single();

      if (newPropErr) throw newPropErr;

      // 4. Insere novos itens
      if (parsedItens.length > 0) {
        const itensToInsert = parsedItens.map((it) => ({
          proposta_id: newProp.id,
          posicao: it.posicao,
          descricao_item: it.descricao_item,
          formato_aberto: it.formato_aberto || null,
          formato_fechado: it.formato_fechado || null,
          papel_substrato: it.papel_substrato || null,
          cores_impressao: it.cores_impressao || null,
          acabamentos_especiais: it.acabamentos_especiais || null,
          quantidade: it.quantidade,
          preco_unitario: it.preco_unitario,
          subtotal: it.subtotal,
        }));

        await supabase.from("crm_proposta_itens").insert(itensToInsert as any);
      }

      // Atualiza valor estimado da oportunidade
      await supabase
        .from("crm_oportunidades")
        .update({
          valor_estimado: valorLiquido,
          updated_at: new Date().toISOString(),
        })
        .eq("id", revisedInput.oportunidade_id);

      // Histórico
      await supabase.from("crm_oportunidade_historico").insert({
        oportunidade_id: revisedInput.oportunidade_id,
        usuario_id: user?.id || null,
        tipo_evento: "proposta_revisada",
        descricao: `Revisão criada: ${newNumero} (anterior ${current?.numero_proposta} arquivada).`,
      });

      toast.success(`Revisão ${newNumero} criada!`);
      void fetchProposals();
      return newProp as CrmProposal;
    } catch (err: any) {
      console.error("Erro ao criar revisão:", err);
      toast.error("Falha ao criar revisão.");
      return null;
    }
  };

  // Alterar Status da Proposta (ex: Enviada, Aprovada, Recusada)
  const updateProposalStatus = async (
    proposalId: string,
    status: ProposalStatus
  ): Promise<boolean> => {
    try {
      const updates: any = {
        status,
        updated_at: new Date().toISOString(),
      };
      if (status === "enviada") {
        updates.data_envio = new Date().toISOString();
      }

      const { error } = await supabase
        .from("crm_propostas")
        .update(updates)
        .eq("id", proposalId);

      if (error) throw error;

      toast.success(`Status da proposta atualizado para '${status}'!`);
      void fetchProposals();
      return true;
    } catch (err: any) {
      console.error("Erro ao atualizar status:", err);
      toast.error("Falha ao atualizar status da proposta.");
      return false;
    }
  };

  return {
    proposals,
    loading,
    fetchProposals,
    createProposal,
    createRevision,
    updateProposalStatus,
  };
}
