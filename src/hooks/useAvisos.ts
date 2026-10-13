import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface Aviso {
  id: string;
  titulo: string;
  mensagem: string;
  tipo: "info" | "urgente" | "lembrete";
  criado_por: string;
  destinatario_id: string | null;
  created_at: string;
}

export function useAvisos() {
  const { user, authReady } = useAuth();
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [lidos, setLidos] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const fetchAvisos = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("avisos")
      .select("*")
      .or(`destinatario_id.is.null,destinatario_id.eq.${user.id}`)
      .order("created_at", { ascending: false });

    if (data) setAvisos(data as Aviso[]);
  }, [user]);

  const fetchLidos = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("avisos_lidos")
      .select("aviso_id")
      .eq("user_id", user.id);

    if (data) setLidos(new Set(data.map((r: any) => r.aviso_id)));
  }, [user]);

  useEffect(() => {
    if (!authReady || !user) {
      if (authReady) setLoading(false);
      return;
    }

    let isMounted = true;

    Promise.all([fetchAvisos(), fetchLidos()]).then(() => {
      if (isMounted) setLoading(false);
    });

    const channel = supabase
      .channel("avisos-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "avisos" }, () => {
        void fetchAvisos();
      })
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [authReady, user]);

  const naoLidos = avisos.filter((a) => !lidos.has(a.id));

  const marcarComoLido = async (avisoId: string) => {
    if (!user) return;
    await supabase.from("avisos_lidos").insert({ aviso_id: avisoId, user_id: user.id });
    setLidos((prev) => new Set(prev).add(avisoId));
  };

  const enviarAviso = async (aviso: { titulo: string; mensagem: string; tipo: string; destinatario_id: string | null }) => {
    if (!user) return;
    const { error } = await supabase.from("avisos").insert({
      ...aviso,
      criado_por: user.id,
    });
    return { error };
  };

  return { avisos, naoLidos, lidos, loading, marcarComoLido, enviarAviso, refetch: fetchAvisos };
}
