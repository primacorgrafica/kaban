import { useState, useEffect, useRef, useCallback, createContext, useContext, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Session, User } from "@supabase/supabase-js";

type AppRole = "admin" | "coordenador" | "operador" | "vendedor" | "user" | "orcamentista" | "impressor";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  authReady: boolean;
  role: AppRole | null;
  isAdmin: boolean;
  modulosAcesso: string[];
  onlineUserIds: Set<string>;
  hasModule: (mod: string) => boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}


const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);
  const [modulosAcesso, setModulosAcesso] = useState<string[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());


  const fetchRole = useCallback(async (userId: string) => {
    const [{ data, error }, { data: profile }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
      supabase.from("profiles").select("modulos_acesso" as any).eq("user_id", userId).maybeSingle(),
    ]);

    if (error) {
      console.error("Erro ao carregar papel do usuário:", error);
      setRole(null);
    } else {
      setRole((data?.role as AppRole) ?? null);
    }
    const mods = (profile as any)?.modulos_acesso;
    setModulosAcesso(Array.isArray(mods) ? mods : []);
  }, []);


  useEffect(() => {
    let isMounted = true;

    // Use onAuthStateChange for auth events
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        if (!isMounted) return;
        setSession(nextSession);
        if (nextSession?.user) {
          setTimeout(() => void fetchRole(nextSession.user.id), 0);
        } else {
          setRole(null);
        }
        setLoading(false);
      }
    );

    // Also call getSession directly as fallback, with timeout
    const sessionPromise = supabase.auth.getSession().then(({ data: { session: s } }) => s);
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000));

    Promise.race([sessionPromise, timeoutPromise]).then((result) => {
      if (!isMounted) return;
      // Only set if still loading (onAuthStateChange might have already fired)
      if (loading) {
        if (result?.user) {
          setSession(result);
          setTimeout(() => void fetchRole(result.user.id), 0);
        }
        setLoading(false);
      }
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

    const upsertPresence = async () => {
      try {
        await supabase
          .from("user_presence")
          .upsert(
            {
              user_id: userId,
              last_seen: new Date().toISOString(),
              logged_in_at: new Date().toISOString(),
            } as any,
            { onConflict: "user_id" }
          );
      } catch (err) {
        console.warn("Falha ao registrar presença:", err);
      }
    };

    const updateHeartbeat = async () => {
      try {
        await supabase
          .from("user_presence")
          .update({ last_seen: new Date().toISOString() } as any)
          .eq("user_id", userId);
      } catch (err) {
        console.warn("Falha no heartbeat:", err);
      }
    };

    void upsertPresence();
    const interval = setInterval(updateHeartbeat, 30_000); // a cada 30s

    // Realtime Presence Channel (global e único para a aplicação)
    const presenceChannel = supabase.channel("primacor_online_presence", {
      config: { presence: { key: userId } },
    });

    presenceChannel
      .on("presence", { event: "sync" }, () => {
        try {
          const state = presenceChannel.presenceState();
          const ids = new Set<string>();
          Object.keys(state).forEach((key) => {
            if (key !== userId) {
              ids.add(key);
            }
          });
          setOnlineUserIds(ids);
        } catch {
          // silencioso
        }
      })
      .on("presence", { event: "join" }, ({ key }) => {
        if (key && key !== userId) {
          setOnlineUserIds((prev) => new Set(prev).add(key));
        }
      })
      .on("presence", { event: "leave" }, ({ key }) => {
        if (key) {
          setOnlineUserIds((prev) => {
            const next = new Set(prev);
            next.delete(key);
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
    await supabase.auth.signOut();
  };

  const isAdmin = role === "admin";
  const hasModule = (mod: string) => {
    if (isAdmin) return true;
    if (!modulosAcesso || modulosAcesso.length === 0) return true; // sem restrição configurada
    return modulosAcesso.includes(mod);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        authReady: !loading,
        role,
        isAdmin,
        modulosAcesso,
        onlineUserIds,
        hasModule,
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
      loading: true,
      authReady: false,
      role: null,
      isAdmin: false,
      modulosAcesso: [],
      onlineUserIds: new Set<string>(),
      hasModule: () => true,
      signIn: async () => ({ error: new Error("Auth not ready") }),
      signUp: async () => ({ error: new Error("Auth not ready") }),
      signOut: async () => {},
    } as AuthContextType;
  }
  return context;
}

