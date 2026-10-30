import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { MuralAlerta, MuralAlertaInput, MuralTipo } from "@/types/mural";
import { toast } from "sonner";

export function useMuralAlertas() {
  const { user, isAdmin, role } = useAuth();
  const [alertas, setAlertas] = useState<MuralAlerta[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);

  // Usuários com permissão para criar, editar e excluir alertas
  const canManageMural = useMemo(() => {
    return isAdmin || role === "coordenador";
  }, [isAdmin, role]);

  const fetchAlertas = useCallback(async () => {
    try {
      // 1. Tenta buscar da tabela dedicada 'mural_alertas'
      const { data: muralData, error: muralError } = await supabase
        .from("mural_alertas" as any)
        .select("*")
        .order("created_at", { ascending: false });

      if (!muralError && muralData) {
        setUsingFallback(false);
        setAlertas(muralData as unknown as MuralAlerta[]);
        return;
      }

      // Se a tabela 'mural_alertas' não existir, usa a tabela existente 'avisos' com tipo 'mural'
      if (muralError && (muralError.code === "PGRST205" || muralError.message?.includes("mural_alertas") || (muralError as any).code === "42P01")) {
        setUsingFallback(true);
        const { data: avisosData, error: avisosError } = await supabase
          .from("avisos")
          .select("id, titulo, mensagem, tipo, criado_por, created_at")
          .ilike("tipo", "mural%")
          .order("created_at", { ascending: false });

        if (!avisosError && avisosData) {
          const mapped: MuralAlerta[] = avisosData.map((a: any) => {
            const rawTipo = (a.tipo || "").replace(/^mural:?/, "").toLowerCase();
            const tipo: MuralTipo = rawTipo === "info" ? "info" : rawTipo === "importante" ? "importante" : "urgente";
            return {
              id: a.id,
              titulo: a.titulo,
              mensagem: a.mensagem,
              tipo,
              ativo: !a.titulo.startsWith("[INATIVO]"),
              criado_por: a.criado_por,
              created_at: a.created_at,
            };
          });
          setAlertas(mapped);
          return;
        }
      }

      console.warn("[MuralAlertas] Aviso ao carregar alertas:", muralError);
    } catch (err) {
      console.error("[MuralAlertas] Exceção ao buscar alertas:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlertas();

    // Sincronização em tempo real via Realtime do Supabase
    let muralChannel: any = null;
    let avisosChannel: any = null;

    try {
      muralChannel = supabase
        .channel("mural-alertas-realtime")
        .on("postgres_changes", { event: "*", schema: "public", table: "mural_alertas" }, () => {
          void fetchAlertas();
        })
        .subscribe();
    } catch (_) {}

    try {
      avisosChannel = supabase
        .channel("mural-avisos-realtime")
        .on("postgres_changes", { event: "*", schema: "public", table: "avisos" }, () => {
          void fetchAlertas();
        })
        .subscribe();
    } catch (_) {}

    return () => {
      if (muralChannel) void supabase.removeChannel(muralChannel);
      if (avisosChannel) void supabase.removeChannel(avisosChannel);
    };
  }, [fetchAlertas]);

  // Alertas ativos para exibição no topo global do sistema
  const activeAlerts = useMemo(() => {
    return alertas.filter((a) => a.ativo);
  }, [alertas]);

  // Alerta principal (mais recente publicado e ativo)
  const primaryAlert = activeAlerts[0] || null;

  // Criar alerta
  const criarAlerta = async (input: MuralAlertaInput): Promise<{ success: boolean; error?: string }> => {
    if (!canManageMural) {
      toast.error("Você não tem permissão para cadastrar alertas.");
      return { success: false, error: "Sem permissão" };
    }

    const payload = {
      titulo: input.titulo.trim(),
      mensagem: input.mensagem.trim(),
      tipo: input.tipo || "urgente",
      ativo: input.ativo ?? true,
      criado_por: user?.id || null,
      autor_nome: user?.user_metadata?.nome || user?.email?.split("@")[0] || null,
      created_at: input.created_at ? new Date(input.created_at).toISOString() : new Date().toISOString(),
    };

    try {
      // 1. Tenta inserir na tabela dedicada
      if (!usingFallback) {
        const { error } = await supabase.from("mural_alertas" as any).insert(payload);
        if (!error) {
          toast.success("Alerta publicado com sucesso no mural!");
          await fetchAlertas();
          return { success: true };
        }
        if (error.code !== "PGRST205" && !error.message?.includes("mural_alertas")) {
          toast.error("Erro ao publicar alerta: " + error.message);
          return { success: false, error: error.message };
        }
      }

      // 2. Fallback na tabela avisos
      const { error: fErr } = await supabase.from("avisos").insert({
        titulo: payload.ativo ? payload.titulo : `[INATIVO] ${payload.titulo}`,
        mensagem: payload.mensagem,
        tipo: `mural:${payload.tipo}`,
        criado_por: user?.id || "00000000-0000-0000-0000-000000000000",
        destinatario_id: null,
      });

      if (fErr) {
        toast.error("Erro ao salvar alerta: " + fErr.message);
        return { success: false, error: fErr.message };
      }

      toast.success("Alerta publicado com sucesso!");
      await fetchAlertas();
      return { success: true };
    } catch (err: any) {
      toast.error("Erro inesperado ao criar alerta.");
      return { success: false, error: err?.message };
    }
  };

  // Editar alerta
  const editarAlerta = async (
    id: string,
    input: Partial<MuralAlertaInput>
  ): Promise<{ success: boolean; error?: string }> => {
    if (!canManageMural) {
      toast.error("Você não tem permissão para editar alertas.");
      return { success: false, error: "Sem permissão" };
    }

    try {
      if (!usingFallback) {
        const updateData: any = {
          updated_at: new Date().toISOString(),
        };
        if (input.titulo !== undefined) updateData.titulo = input.titulo.trim();
        if (input.mensagem !== undefined) updateData.mensagem = input.mensagem.trim();
        if (input.tipo !== undefined) updateData.tipo = input.tipo;
        if (input.ativo !== undefined) updateData.ativo = input.ativo;
        if (input.created_at !== undefined) updateData.created_at = new Date(input.created_at).toISOString();

        const { error } = await supabase
          .from("mural_alertas" as any)
          .update(updateData)
          .eq("id", id);

        if (!error) {
          toast.success("Alerta atualizado com sucesso!");
          await fetchAlertas();
          return { success: true };
        }

        if (error.code !== "PGRST205" && !error.message?.includes("mural_alertas")) {
          toast.error("Erro ao editar alerta: " + error.message);
          return { success: false, error: error.message };
        }
      }

      // Fallback na tabela avisos
      const existing = alertas.find((a) => a.id === id);
      const newTitle = input.titulo !== undefined ? input.titulo.trim() : existing?.titulo || "";
      const isAtivo = input.ativo !== undefined ? input.ativo : existing?.ativo ?? true;
      const formattedTitle = isAtivo ? newTitle.replace(/^\[INATIVO\]\s*/, "") : `[INATIVO] ${newTitle.replace(/^\[INATIVO\]\s*/, "")}`;

      const { error: fErr } = await supabase
        .from("avisos")
        .update({
          titulo: formattedTitle,
          mensagem: input.mensagem !== undefined ? input.mensagem.trim() : existing?.mensagem,
          tipo: `mural:${input.tipo || existing?.tipo || "urgente"}`,
        })
        .eq("id", id);

      if (fErr) {
        toast.error("Erro ao atualizar alerta: " + fErr.message);
        return { success: false, error: fErr.message };
      }

      toast.success("Alerta atualizado com sucesso!");
      await fetchAlertas();
      return { success: true };
    } catch (err: any) {
      toast.error("Erro inesperado ao editar alerta.");
      return { success: false, error: err?.message };
    }
  };

  // Excluir alerta
  const excluirAlerta = async (id: string): Promise<{ success: boolean; error?: string }> => {
    if (!canManageMural) {
      toast.error("Você não tem permissão para excluir alertas.");
      return { success: false, error: "Sem permissão" };
    }

    try {
      if (!usingFallback) {
        const { error } = await supabase.from("mural_alertas" as any).delete().eq("id", id);
        if (!error) {
          toast.success("Alerta removido do mural!");
          await fetchAlertas();
          return { success: true };
        }

        if (error.code !== "PGRST205" && !error.message?.includes("mural_alertas")) {
          toast.error("Erro ao excluir alerta: " + error.message);
          return { success: false, error: error.message };
        }
      }

      // Fallback na tabela avisos
      const { error: fErr } = await supabase.from("avisos").delete().eq("id", id);
      if (fErr) {
        toast.error("Erro ao excluir alerta: " + fErr.message);
        return { success: false, error: fErr.message };
      }

      toast.success("Alerta removido!");
      await fetchAlertas();
      return { success: true };
    } catch (err: any) {
      toast.error("Erro inesperado ao excluir alerta.");
      return { success: false, error: err?.message };
    }
  };

  return {
    alertas,
    activeAlerts,
    primaryAlert,
    loading,
    canManageMural,
    criarAlerta,
    editarAlerta,
    excluirAlerta,
    refetch: fetchAlertas,
  };
}
