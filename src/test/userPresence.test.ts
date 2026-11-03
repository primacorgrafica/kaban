import { describe, it, expect } from "vitest";

interface PresenceInfo {
  last_seen: string | null;
  logged_in_at: string | null;
  last_logout_at: string | null;
  last_session_duration_ms: number | null;
}

interface UserRowTest {
  user_id: string;
  nome: string;
  last_sign_in_at?: string | null;
  presence?: PresenceInfo | null;
}

// Lógica de detecção de presença replicada para validação determinística
function calculateIsUserOnline(
  u: UserRowTest,
  currentUserId: string | null,
  onlineUserIds: Set<string>
): boolean {
  // 1. O próprio usuário atual conectado visualizando a tela
  if (currentUserId && u.user_id === currentUserId) return true;

  // 2. Presente via canal WebSocket Realtime global (primacor_online_presence)
  if (onlineUserIds && onlineUserIds.has(u.user_id)) return true;

  // 3. Heartbeat recente no banco de dados (últimos 5 minutos, consistente com chatService)
  const presence = u.presence;
  if (presence?.last_seen) {
    const lastSeenMs = new Date(presence.last_seen).getTime();
    if (lastSeenMs > 86400000) {
      const diff = Date.now() - lastSeenMs;
      const loggedOutAfter =
        presence.last_logout_at &&
        new Date(presence.last_logout_at).getTime() > lastSeenMs;
      if (diff < 5 * 60 * 1000 && !loggedOutAfter) {
        return true;
      }
    }
  }

  // 4. Login recente registrado em auth.users (últimos 5 minutos) sem logout posterior
  if (u.last_sign_in_at) {
    const signInMs = new Date(u.last_sign_in_at).getTime();
    const signInDiff = Date.now() - signInMs;
    const loggedOutAfter =
      presence?.last_logout_at &&
      new Date(presence.last_logout_at).getTime() > signInMs;
    if (signInDiff < 5 * 60 * 1000 && !loggedOutAfter) {
      return true;
    }
  }

  return false;
}

describe("User Presence & Online Status Detection", () => {
  const currentUserId = "admin-123";
  const onlineUserIds = new Set<string>(["admin-123", "user-online-ws"]);

  it("deve identificar o próprio usuário atual logado como ONLINE", () => {
    const user: UserRowTest = {
      user_id: "admin-123",
      nome: "Administrador",
      presence: null,
    };
    expect(calculateIsUserOnline(user, currentUserId, onlineUserIds)).toBe(true);
  });

  it("deve identificar usuário com conexão WebSocket ativa no canal Realtime como ONLINE", () => {
    const user: UserRowTest = {
      user_id: "user-online-ws",
      nome: "Carlos Coelho",
      presence: null,
    };
    expect(calculateIsUserOnline(user, currentUserId, onlineUserIds)).toBe(true);
  });

  it("deve identificar usuário com heartbeat recente no banco (< 5 minutos) como ONLINE", () => {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const user: UserRowTest = {
      user_id: "user-heartbeat",
      nome: "Carlos Coelho",
      presence: {
        last_seen: twoMinutesAgo,
        logged_in_at: twoMinutesAgo,
        last_logout_at: null,
        last_session_duration_ms: 0,
      },
    };
    expect(calculateIsUserOnline(user, currentUserId, onlineUserIds)).toBe(true);
  });

  it("deve identificar usuário com login recente (< 5 minutos) como ONLINE mesmo se heartbeat ainda não gravou", () => {
    const oneMinuteAgo = new Date(Date.now() - 1 * 60 * 1000).toISOString();
    const user: UserRowTest = {
      user_id: "user-recent-login",
      nome: "Carlos Coelho",
      last_sign_in_at: oneMinuteAgo,
      presence: null,
    };
    expect(calculateIsUserOnline(user, currentUserId, onlineUserIds)).toBe(true);
  });

  it("deve identificar usuário como OFFLINE se o último heartbeat foi há mais de 5 minutos", () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const user: UserRowTest = {
      user_id: "user-stale",
      nome: "Carlos Coelho",
      last_sign_in_at: tenMinutesAgo,
      presence: {
        last_seen: tenMinutesAgo,
        logged_in_at: tenMinutesAgo,
        last_logout_at: null,
        last_session_duration_ms: 0,
      },
    };
    expect(calculateIsUserOnline(user, currentUserId, onlineUserIds)).toBe(false);
  });

  it("deve identificar usuário como OFFLINE se deslogou explicitamente após o último login/heartbeat", () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const user: UserRowTest = {
      user_id: "user-logged-out",
      nome: "Carlos Coelho",
      last_sign_in_at: fiveMinutesAgo,
      presence: {
        last_seen: "1970-01-01T00:00:00Z",
        logged_in_at: fiveMinutesAgo,
        last_logout_at: twoMinutesAgo,
        last_session_duration_ms: 180000,
      },
    };
    expect(calculateIsUserOnline(user, currentUserId, onlineUserIds)).toBe(false);
  });
});
