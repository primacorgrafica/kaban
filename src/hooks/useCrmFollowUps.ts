import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CrmActivity, ActivityType, ActivityStatus, isFollowUpLate, isFollowUpToday } from "@/types/crm";
import { toast } from "sonner";

export interface CreateActivityInput {
  oportunidade_id: string;
  tipo: ActivityType;
  titulo: string;
  descricao?: string;
  data_agendada: string;
  responsavel_id?: string;
  responsavel_nome?: string;
}

export function useCrmFollowUps(oportunidadeId?: string) {
  const { user } = useAuth();
  const [activities, setActivities] = useState<CrmActivity[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchActivities = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("crm_atividades")
        .select(`
          *,
          crm_oportunidades (
            titulo,
            cliente_nome
          )
        `)
        .order("data_agendada", { ascending: true });

      if (oportunidadeId) {
        query = query.eq("oportunidade_id", oportunidadeId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const mapped: CrmActivity[] = (data || []).map((row: any) => ({
        id: row.id,
        oportunidade_id: row.oportunidade_id,
        tipo: row.tipo,
        titulo: row.titulo,
        descricao: row.descricao,
        data_agendada: row.data_agendada,
        status: row.status,
        resultado: row.resultado,
        responsavel_id: row.responsavel_id,
        responsavel_nome: row.responsavel_nome,
        concluido_em: row.concluido_em,
        created_at: row.created_at,
        updated_at: row.updated_at,
        oportunidade_titulo: row.crm_oportunidades?.titulo,
        cliente_nome: row.crm_oportunidades?.cliente_nome,
      }));

      setActivities(mapped);
    } catch (err: any) {
      console.error("Erro ao carregar follow-ups:", err);
    } finally {
      setLoading(false);
    }
  }, [oportunidadeId]);

  useEffect(() => {
    void fetchActivities();
  }, [fetchActivities]);

  // Agendar Follow-up
  const scheduleActivity = async (input: CreateActivityInput): Promise<CrmActivity | null> => {
    try {
      const payload = {
        oportunidade_id: input.oportunidade_id,
        tipo: input.tipo,
        titulo: input.titulo.trim(),
        descricao: input.descricao?.trim() || null,
        data_agendada: input.data_agendada,
        responsavel_id: input.responsavel_id || user?.id || null,
        responsavel_nome: input.responsavel_nome || null,
        status: "pendente" as ActivityStatus,
      };

      const { data, error } = await supabase
        .from("crm_atividades")
        .insert(payload as any)
        .select()
        .single();

      if (error) throw error;

      // Histórico
      await supabase.from("crm_oportunidade_historico").insert({
        oportunidade_id: input.oportunidade_id,
        usuario_id: user?.id || null,
        tipo_evento: "atividade_agendada",
        descricao: `Follow-up agendado (${input.tipo}): '${input.titulo}' para ${new Date(input.data_agendada).toLocaleString("pt-BR")}.`,
      });

      toast.success("Follow-up agendado!");
      void fetchActivities();
      return data as CrmActivity;
    } catch (err: any) {
      console.error("Erro ao agendar atividade:", err);
      toast.error(err.message || "Falha ao agendar atividade.");
      return null;
    }
  };

  // Concluir Atividade (com anotação do resultado e agendamento opcional da próxima)
  const completeActivity = async (
    activityId: string,
    resultado: string,
    nextActivity?: CreateActivityInput
  ): Promise<boolean> => {
    try {
      const act = activities.find((a) => a.id === activityId);
      const updates = {
        status: "concluido" as ActivityStatus,
        resultado: resultado.trim(),
        concluido_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("crm_atividades")
        .update(updates)
        .eq("id", activityId);

      if (error) throw error;

      if (act) {
        await supabase.from("crm_oportunidade_historico").insert({
          oportunidade_id: act.oportunidade_id,
          usuario_id: user?.id || null,
          tipo_evento: "atividade_concluida",
          descricao: `Follow-up concluído: '${act.titulo}'. Resultado: ${resultado}.`,
        });
      }

      // Se houver próximo agendamento, agenda imediatamente
      if (nextActivity) {
        await scheduleActivity(nextActivity);
      }

      toast.success("Follow-up concluído com sucesso!");
      void fetchActivities();
      return true;
    } catch (err: any) {
      console.error("Erro ao concluir atividade:", err);
      toast.error("Falha ao registrar conclusão.");
      return false;
    }
  };

  // Cancelar Atividade
  const cancelActivity = async (activityId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from("crm_atividades")
        .update({
          status: "cancelado",
          updated_at: new Date().toISOString(),
        })
        .eq("id", activityId);

      if (error) throw error;

      toast.info("Atividade cancelada.");
      void fetchActivities();
      return true;
    } catch (err: any) {
      console.error("Erro ao cancelar atividade:", err);
      toast.error("Falha ao cancelar atividade.");
      return false;
    }
  };

  // Contadores e agrupamentos calculados
  const pendingActivities = useMemo(
    () => activities.filter((a) => a.status === "pendente"),
    [activities]
  );

  const lateActivities = useMemo(
    () => pendingActivities.filter((a) => isFollowUpLate(a.data_agendada)),
    [pendingActivities]
  );

  const todayActivities = useMemo(
    () => pendingActivities.filter((a) => isFollowUpToday(a.data_agendada)),
    [pendingActivities]
  );

  return {
    activities,
    pendingActivities,
    lateActivities,
    todayActivities,
    loading,
    fetchActivities,
    scheduleActivity,
    completeActivity,
    cancelActivity,
  };
}
