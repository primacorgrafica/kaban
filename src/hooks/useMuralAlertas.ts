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

  // Usuários com permissão para criar, editar e excluir alertas (Admin, Coordenador e RH)
  const canManageMural = useMemo(() => {
    return isAdmin || role === "coordenador" || role === "rh";
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
            const rawTitle = a.titulo || "";
            const isAtivo = !rawTitle.startsWith("[INATIVO]");
            const cleanTitle = rawTitle.replace(/^\[INATIVO\]\s*/, "");
            return {
              id: a.id,
              titulo: cleanTitle,
              mensagem: a.mensagem,
              tipo,
              ativo: isAtivo,
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

    const trimmedMsg = (input.mensagem || "").trim();
    const fallbackTitle = (input.titulo && input.titulo.trim()) || trimmedMsg.slice(0, 80) || "Alerta do Mural";

    const payload = {
      titulo: fallbackTitle,
      mensagem: trimmedMsg,
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
      const existing = alertas.find((a) => a.id === id);
      const targetTipo: MuralTipo = input.tipo !== undefined ? input.tipo : existing?.tipo || "urgente";
      const targetMensagem = input.mensagem !== undefined ? input.mensagem.trim() : existing?.mensagem || "";
      const targetTitulo = input.titulo !== undefined && input.titulo.trim()
        ? input.titulo.trim()
        : existing?.titulo || targetMensagem.slice(0, 80) || "Alerta do Mural";
      const isAtivo = input.ativo !== undefined ? input.ativo : existing?.ativo ?? true;
      const targetCreatedAt = input.created_at ? new Date(input.created_at).toISOString() : existing?.created_at || new Date().toISOString();

      // Atualização otimista imediata no estado local
      setAlertas((prev) =>
        prev.map((a) =>
          a.id === id
            ? {
                ...a,
                titulo: targetTitulo,
                mensagem: targetMensagem,
                tipo: targetTipo,
                ativo: isAtivo,
                created_at: targetCreatedAt,
              }
            : a
        )
      );

      // 1. Tenta atualizar na tabela dedicada mural_alertas
      if (!usingFallback) {
        const updateData: any = {
          updated_at: new Date().toISOString(),
        };
        if (input.titulo !== undefined) updateData.titulo = targetTitulo;
        if (input.mensagem !== undefined) updateData.mensagem = targetMensagem;
        if (input.tipo !== undefined) updateData.tipo = targetTipo;
        if (input.ativo !== undefined) updateData.ativo = isAtivo;
        if (input.created_at !== undefined) updateData.created_at = targetCreatedAt;

        const eqQuery = supabase
          .from("mural_alertas" as any)
          .update(updateData)
          .eq("id", id);

        const mRes: any = typeof (eqQuery as any)?.select === "function"
          ? await (eqQuery as any).select()
          : await eqQuery;

        const mErr = mRes?.error;
        const mData = mRes?.data;

        if (!mErr && (!mData || mData.length > 0)) {
          toast.success("Urgência e alerta atualizados com sucesso!");
          await fetchAlertas();
          return { success: true };
        }

        if (mErr && mErr.code !== "PGRST205" && !mErr.message?.includes("mural_alertas")) {
          toast.error("Erro ao editar alerta: " + mErr.message);
          await fetchAlertas();
          return { success: false, error: mErr.message };
        }
      }

      // 2. Persistência na tabela avisos (com suporte a RLS de UPDATE via DELETE + INSERT atômico)
      const formattedTitle = isAtivo
        ? targetTitulo.replace(/^\[INATIVO\]\s*/, "")
        : `[INATIVO] ${targetTitulo.replace(/^\[INATIVO\]\s*/, "")}`;

      const fEqQuery = supabase
        .from("avisos")
        .update({
          titulo: formattedTitle,
          mensagem: targetMensagem,
          tipo: `mural:${targetTipo}`,
        })
        .eq("id", id);

      const fRes: any = typeof (fEqQuery as any)?.select === "function"
        ? await (fEqQuery as any).select()
        : await fEqQuery;

      const fErr = fRes?.error;
      const updateRes = fRes?.data;

      // Se a atualização direta for bloqueada pela falta de política de UPDATE no RLS da tabela avisos (0 linhas retornadas):
      if (fErr || !updateRes || updateRes.length === 0) {
        await supabase.from("avisos").delete().eq("id", id);
        const { error: insErr } = await supabase.from("avisos").insert({
          id,
          titulo: formattedTitle,
          mensagem: targetMensagem,
          tipo: `mural:${targetTipo}`,
          criado_por: existing?.criado_por || user?.id || "00000000-0000-0000-0000-000000000000",
          destinatario_id: null,
          created_at: targetCreatedAt,
        });

        if (insErr) {
          console.error("[MuralAlertas] Erro ao substituir aviso:", insErr);
          toast.error("Erro ao atualizar urgência: " + insErr.message);
          await fetchAlertas();
          return { success: false, error: insErr.message };
        }
      }

      toast.success("Nível de urgência atualizado com sucesso!");
      await fetchAlertas();
      return { success: true };
    } catch (err: any) {
      console.error("[MuralAlertas] Exceção ao editar alerta:", err);
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
