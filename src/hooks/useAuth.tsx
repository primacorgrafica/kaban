import { useState, useEffect, useRef, useCallback, createContext, useContext, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Session, User } from "@supabase/supabase-js";

type AppRole = "admin" | "coordenador" | "operador" | "vendedor" | "user" | "orcamentista" | "impressor" | "entregador" | "rh";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  userName: string | null;
  avatarUrl: string | null;
  loading: boolean;
  authReady: boolean;
  role: AppRole | null;
  isAdmin: boolean;
  modulosAcesso: string[];
  setorVinculado: string | null;
  onlineUserIds: Set<string>;
  hasModule: (mod: string) => boolean;
  canAccessSector: (sectorId: string) => boolean;
  refreshProfile: () => Promise<void>;
  updateAvatar: (url: string) => void;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [modulosAcesso, setModulosAcesso] = useState<string[]>([]);
  const [setorVinculado, setSetorVinculado] = useState<string | null>(null);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

  const fetchRole = useCallback(async (userId: string) => {
    const [{ data, error }, { data: profile }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
      supabase.from("profiles").select("nome, modulos_acesso, setor_vinculado, avatar_url" as any).eq("user_id", userId).maybeSingle(),
    ]);

    if (error) {
      console.error("Erro ao carregar papel do usuário:", error);
      setRole(null);
    } else {
      setRole((data?.role as AppRole) ?? null);
    }
    const pNome = (profile as any)?.nome;
    setUserName(typeof pNome === "string" && pNome.trim() !== "" ? pNome.trim() : null);
    const pAvatar = (profile as any)?.avatar_url;
    setAvatarUrl(typeof pAvatar === "string" && pAvatar.trim() !== "" ? pAvatar.trim() : null);
    const mods = (profile as any)?.modulos_acesso;
    setModulosAcesso(Array.isArray(mods) ? mods : []);
    const setor = (profile as any)?.setor_vinculado;
    setSetorVinculado(typeof setor === "string" && setor.trim() !== "" ? setor.trim() : null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user?.id) {
      await fetchRole(session.user.id);
    }
  }, [session?.user?.id, fetchRole]);

  const updateAvatar = useCallback((url: string) => {
    setAvatarUrl(url);
  }, []);


  useEffect(() => {
    let isMounted = true;

    // Use onAuthStateChange for auth events
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, nextSession) => {
        if (!isMounted) return;
        setSession(nextSession);
        if (nextSession?.user) {
          try {
            await fetchRole(nextSession.user.id);
          } catch (e) {
            console.error("Erro ao carregar permissões:", e);
          }
        } else {
          setRole(null);
          setUserName(null);
          setModulosAcesso([]);
          setSetorVinculado(null);
        }
        if (isMounted) {
          setLoading(false);
        }
      }
    );

    // Also call getSession directly as fallback, with timeout
    const sessionPromise = supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      if (s?.user) {
        try {
          await fetchRole(s.user.id);
        } catch (e) {
          console.error("Erro ao carregar permissões:", e);
        }
      }
      return s;
    });
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000));

    Promise.race([sessionPromise, timeoutPromise]).then((result) => {
      if (!isMounted) return;
      if (result?.user) {
        setSession(result);
      }
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    return { error: error as Error | null };
  };

  // Heartbeat & Realtime presence tracking (único canal centralizado)
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      setOnlineUserIds(new Set());
      return;
    }

    // Inicializa com o próprio usuário logado como online
    setOnlineUserIds(new Set([userId]));

    const upsertPresence = async () => {
      try {
        const now = new Date().toISOString();
        const payload = {
          user_id: userId,
          last_seen: now,
          logged_in_at: now,
          last_logout_at: null,
          last_session_duration_ms: 0,
        };
        const { error } = await supabase
          .from("user_presence")
          .upsert(payload as any, { onConflict: "user_id" });

        if (error) {
          // Fallback: tentar update direto caso row já exista ou upsert falhe
          await supabase
            .from("user_presence")
            .update(payload as any)
            .eq("user_id", userId);
        }
      } catch (err) {
        console.warn("Falha ao registrar presença:", err);
      }
    };

    const updateHeartbeat = async () => {
      try {
        const now = new Date().toISOString();
        const { error } = await supabase
          .from("user_presence")
          .update({ last_seen: now, last_logout_at: null } as any)
          .eq("user_id", userId);

        if (error) {
          void upsertPresence();
        }
      } catch (err) {
        console.warn("Falha no heartbeat:", err);
      }
    };

    void upsertPresence();
    const interval = setInterval(updateHeartbeat, 30_000); // a cada 30s

    // Atualiza heartbeat imediatamente quando a aba volta a ficar visível
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void updateHeartbeat();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Realtime Presence Channel (global e único para a aplicação)
    const presenceChannel = supabase.channel("primacor_online_presence", {
      config: { presence: { key: userId } },
    });

    presenceChannel
      .on("presence", { event: "sync" }, () => {
        try {
          const state = presenceChannel.presenceState();
          const ids = new Set<string>();
          if (userId) ids.add(userId);
          Object.entries(state).forEach(([k, presences]) => {
            if (k) ids.add(k);
            if (Array.isArray(presences)) {
              presences.forEach((p: any) => {
                if (p?.user_id) ids.add(p.user_id);
              });
            }
          });
          setOnlineUserIds(ids);
        } catch {
          // silencioso
        }
      })
      .on("presence", { event: "join" }, ({ key, newPresences }: any) => {
        const idsToAdd: string[] = [];
        if (key) idsToAdd.push(key);
        if (Array.isArray(newPresences)) {
          newPresences.forEach((p: any) => {
            if (p?.user_id) idsToAdd.push(p.user_id);
          });
        }
        if (idsToAdd.length > 0) {
          setOnlineUserIds((prev) => {
            const next = new Set(prev);
            if (userId) next.add(userId);
            idsToAdd.forEach((id) => next.add(id));
            return next;
          });
        }
      })
      .on("presence", { event: "leave" }, ({ key, leftPresences }: any) => {
        const idsToRemove: string[] = [];
        if (key && key !== userId) idsToRemove.push(key);
        if (Array.isArray(leftPresences)) {
          leftPresences.forEach((p: any) => {
            if (p?.user_id && p.user_id !== userId) idsToRemove.push(p.user_id);
          });
        }
        if (idsToRemove.length > 0) {
          setOnlineUserIds((prev) => {
            const next = new Set(prev);
            if (userId) next.add(userId);
            idsToRemove.forEach((id) => next.delete(id));
            return next;
          });
        }
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          try {
            await presenceChannel.track({
              user_id: userId,
              online_at: new Date().toISOString(),
            });
          } catch (err) {
            console.warn("Falha ao trackear presença:", err);
          }
        }
      });

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void supabase.removeChannel(presenceChannel);
      setOnlineUserIds(new Set());
    };
  }, [session?.user?.id]);

  const signOut = async () => {
    const userId = session?.user?.id;
    if (userId) {
      const now = new Date().toISOString();
      // Get logged_in_at to compute duration
      const { data: presence } = await supabase
        .from("user_presence")
        .select("logged_in_at")
        .eq("user_id", userId)
        .maybeSingle();
      
      const durationMs = presence?.logged_in_at
        ? Date.now() - new Date(presence.logged_in_at).getTime()
        : 0;

      await supabase
        .from("user_presence")
        .update({
          last_seen: "1970-01-01T00:00:00Z",
          last_logout_at: now,
          last_session_duration_ms: durationMs,
        } as any)
        .eq("user_id", userId);
    }
    setOnlineUserIds(new Set());
    setSetorVinculado(null);
    setModulosAcesso([]);
    await supabase.auth.signOut();
  };

  const isAdmin = role === "admin";
  const hasModule = (mod: string) => {
    if (isAdmin) return true;
    if (modulosAcesso && modulosAcesso.length > 0) {
      if (modulosAcesso.includes(mod)) return true;
      // Compatibilidade retroativa com módulos legados
      if (mod === "producao" && (modulosAcesso.includes("ctp") || modulosAcesso.includes("digital") || modulosAcesso.includes("qualidade") || modulosAcesso.includes("producao"))) return true;
      if (mod === "pre_impressao" && modulosAcesso.includes("producao")) return true;
      if (mod === "qualidade" && modulosAcesso.includes("producao")) return true;
      if (mod === "ctp" && modulosAcesso.includes("producao")) return true;
      if (mod === "digital" && modulosAcesso.includes("producao")) return true;
      if ((mod === "entregas" || mod === "gestao_entregas") && (modulosAcesso.includes("entregas") || modulosAcesso.includes("gestao_entregas"))) return true;
      if (mod === "entregador" && (modulosAcesso.includes("entregador") || modulosAcesso.includes("entregas") || modulosAcesso.includes("gestao_entregas"))) return true;
      if ((mod === "cadastros" || mod === "cadastro") && (modulosAcesso.includes("cadastros") || modulosAcesso.includes("cadastro"))) return true;
      return false;
    }
    // Fallback seguro: default-deny baseado na role caso não haja módulos explicitamente configurados
    if (role === "coordenador") {
      return ["comercial", "pcp", "pre_impressao", "ctp", "digital", "qualidade", "producao", "expedicao", "entregas", "gestao_entregas", "entregador", "trabalhos_concluidos", "compras", "manutencao", "dashboard", "cadastros", "cadastro", "utilidades"].includes(mod);
    }
    if (role === "vendedor") {
      return ["comercial", "utilidades"].includes(mod);
    }
    if (role === "orcamentista") {
      return ["comercial", "pcp", "pre_impressao", "ctp", "digital", "producao", "utilidades"].includes(mod);
    }
    if (role === "operador" || role === "impressor") {
      return ["pre_impressao", "ctp", "digital", "qualidade", "producao", "utilidades"].includes(mod);
    }
    if (role === "entregador") {
      return mod === "entregador";
    }
    if (role === "rh") {
      return ["dashboard", "cadastros", "cadastro", "utilidades"].includes(mod);
    }
    return false;
  };

  const canAccessSector = useCallback((sectorId: string) => {
    // Administrador tem acesso irrestrito
    if (isAdmin) return true;

    // Se o usuário possui módulos de acesso explicitamente configurados
    if (modulosAcesso && modulosAcesso.length > 0) {
      return hasModule(sectorId);
    }

    // Se o usuário possui um setor vinculado, o acesso à produção é estritamente restrito a ele
    if (setorVinculado) {
      return setorVinculado === sectorId;
    }

    // Coordenador sem setor fixo pode gerenciar todos os setores
    if (role === "coordenador") return true;

    // Para usuários operacionais sem setor específico, checa o módulo 'pre_impressao' ou 'producao'
    return hasModule("pre_impressao") || hasModule("producao");
  }, [isAdmin, setorVinculado, role, hasModule, modulosAcesso]);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        userName: userName || session?.user?.user_metadata?.nome || null,
        loading,
        authReady: !loading,
        role,
        isAdmin,
        avatarUrl,
        modulosAcesso,
        setorVinculado,
        onlineUserIds,
        hasModule,
        canAccessSector,
        refreshProfile,
        updateAvatar,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}


export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    // During HMR transitions, context can temporarily be undefined.
    // Return a safe fallback to avoid crashing the app.
    return {
      session: null,
      user: null,
      userName: null,
      avatarUrl: null,
      loading: true,
      authReady: false,
      role: null,
      isAdmin: false,
      modulosAcesso: [],
      setorVinculado: null,
      onlineUserIds: new Set<string>(),
      hasModule: () => false,
      canAccessSector: () => false,
      refreshProfile: async () => {},
      updateAvatar: () => {},
      signIn: async () => ({ error: new Error("Auth not ready") }),
      signUp: async () => ({ error: new Error("Auth not ready") }),
      signOut: async () => {},
    } as AuthContextType;
  }
  return context;
}

