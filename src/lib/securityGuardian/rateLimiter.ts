/**
 * Kaban Security Guardian - Adaptive Rate Limiter & Brute-Force Defender
 * Limita tentativas consecutivas de autenticação e ações sensíveis.
 */

export interface RateLimitOptions {
  maxAttempts?: number;
  windowMs?: number;
  baseLockoutMs?: number;
}

export interface RateLimitStatus {
  allowed: boolean;
  remainingAttempts: number;
  retryAfterSeconds: number;
  totalAttempts: number;
}

interface AttemptRecord {
  timestamps: number[];
  lockedUntil: number;
  lockoutMultiplier: number;
}

export class RateLimiter {
  private records = new Map<string, AttemptRecord>();
  private readonly defaultMaxAttempts: number;
  private readonly defaultWindowMs: number;
  private readonly defaultBaseLockoutMs: number;

  constructor(options: RateLimitOptions = {}) {
    this.defaultMaxAttempts = options.maxAttempts ?? 5;
    this.defaultWindowMs = options.windowMs ?? 60_000; // 1 minuto
    this.defaultBaseLockoutMs = options.baseLockoutMs ?? 30_000; // 30 segundos
  }

  /**
   * Avalia uma nova tentativa para a chave informada (ex: "login:user@email.com").
   */
  public recordAttempt(key: string, customOptions?: RateLimitOptions): RateLimitStatus {
    const maxAttempts = customOptions?.maxAttempts ?? this.defaultMaxAttempts;
    const windowMs = customOptions?.windowMs ?? this.defaultWindowMs;
    const baseLockoutMs = customOptions?.baseLockoutMs ?? this.defaultBaseLockoutMs;

    const now = Date.now();
    let record = this.records.get(key);

    if (!record) {
      record = {
        timestamps: [],
        lockedUntil: 0,
        lockoutMultiplier: 1,
      };
      this.records.set(key, record);
    }

    // Se já estiver bloqueado, calcula o tempo restante
    if (record.lockedUntil > now) {
      const retryAfterSeconds = Math.ceil((record.lockedUntil - now) / 1000);
      return {
        allowed: false,
        remainingAttempts: 0,
        retryAfterSeconds,
        totalAttempts: record.timestamps.length,
      };
    }

    // Limpa timestamps fora da janela deslizante
    record.timestamps = record.timestamps.filter((t) => now - t < windowMs);
    record.timestamps.push(now);

    if (record.timestamps.length > maxAttempts) {
      // Bloqueio adaptativo progressivo (30s, 60s, 120s, max 300s)
      const lockoutDuration = Math.min(baseLockoutMs * record.lockoutMultiplier, 300_000);
      record.lockedUntil = now + lockoutDuration;
      record.lockoutMultiplier = Math.min(record.lockoutMultiplier * 2, 10);

      const retryAfterSeconds = Math.ceil(lockoutDuration / 1000);
      return {
        allowed: false,
        remainingAttempts: 0,
        retryAfterSeconds,
        totalAttempts: record.timestamps.length,
      };
    }

    return {
      allowed: true,
      remainingAttempts: Math.max(0, maxAttempts - record.timestamps.length),
      retryAfterSeconds: 0,
      totalAttempts: record.timestamps.length,
    };
  }

  /**
   * Consulta o status atual de uma chave sem registrar uma nova tentativa.
   */
  public checkStatus(key: string, maxAttempts = this.defaultMaxAttempts): RateLimitStatus {
    const now = Date.now();
    const record = this.records.get(key);

    if (!record) {
      return {
        allowed: true,
        remainingAttempts: maxAttempts,
        retryAfterSeconds: 0,
        totalAttempts: 0,
      };
    }

    if (record.lockedUntil > now) {
      return {
        allowed: false,
        remainingAttempts: 0,
        retryAfterSeconds: Math.ceil((record.lockedUntil - now) / 1000),
        totalAttempts: record.timestamps.length,
      };
    }

    return {
      allowed: true,
      remainingAttempts: Math.max(0, maxAttempts - record.timestamps.length),
      retryAfterSeconds: 0,
      totalAttempts: record.timestamps.length,
    };
  }

  /**
   * Reseta o histórico de tentativas de uma chave (ex: após login bem-sucedido).
   */
  public reset(key: string): void {
    this.records.delete(key);
  }

  /**
   * Limpa todos os registros (útil em testes ou limpeza de memória).
   */
  public clear(): void {
    this.records.clear();
  }
}

export const authRateLimiter = new RateLimiter({
  maxAttempts: 5,
  windowMs: 60_000,
  baseLockoutMs: 30_000,
});
