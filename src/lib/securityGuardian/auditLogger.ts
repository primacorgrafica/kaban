/**
 * Kaban Security Guardian - Centralized Security Audit Logger
 * Registra eventos de segurança, anomalias e tentativas de invasão.
 */

import { supabase } from "@/integrations/supabase/client";

export type SecuritySeverity = "info" | "warning" | "critical";

export type SecurityEventType =
  | "AUTH_LOGIN_SUCCESS"
  | "AUTH_LOGIN_FAILED"
  | "AUTH_BRUTE_FORCE_BLOCKED"
  | "UNAUTHORIZED_ROUTE_ACCESS"
  | "PRIVILEGE_CHANGE_ATTEMPT"
  | "SENSITIVE_DATA_EXPORT"
  | "DOMAIN_TAMPERING_DETECTED"
  | "SUSPICIOUS_INPUT_BLOCKED"
  | "SHAREPOINT_AUTH_FAILURE";

export interface SecurityLogPayload {
  event_type: SecurityEventType;
  severity: SecuritySeverity;
  details?: Record<string, unknown>;
  target_resource?: string;
}

class SecurityAuditLogger {
  private queue: SecurityLogPayload[] = [];
  private isProcessing = false;

  public async log(payload: SecurityLogPayload): Promise<void> {
    const isDev = import.meta.env.DEV;

    if (isDev) {
      const icon = payload.severity === "critical" ? "🚨" : payload.severity === "warning" ? "⚠️" : "🔒";
      console.log(`[KSG:Audit] ${icon} ${payload.event_type} [${payload.severity.toUpperCase()}]:`, payload.details || {});
    }

    this.queue.push(payload);
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.isProcessing) return;
    this.isProcessing = true;

    setTimeout(async () => {
      await this.flushQueue();
      this.isProcessing = false;
    }, 500);
  }

  public async flushQueue(): Promise<void> {
    if (this.queue.length === 0) return;

    const toProcess = [...this.queue];
    this.queue = [];

    const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "SSR/Node";

    for (const item of toProcess) {
      try {
        // Tenta RPC seguro primeiro
        const { error: rpcError } = await supabase.rpc("log_security_audit_event" as any, {
          p_event_type: item.event_type,
          p_severity: item.severity,
          p_details: item.details || {},
          p_target_resource: item.target_resource || null,
          p_user_agent: userAgent,
        });

        if (rpcError) {
          // Fallback para insert direto na tabela de auditoria
          await supabase.from("security_audit_logs" as any).insert({
            event_type: item.event_type,
            severity: item.severity,
            details: item.details || {},
            target_resource: item.target_resource || null,
            user_agent: userAgent,
          });
        }
      } catch (err) {
        // Falhas na rede de auditoria não devem quebrar a aplicação do usuário
        if (import.meta.env.DEV) {
          console.warn("[KSG:Audit] Falha ao enviar log de auditoria ao Supabase:", err);
        }
      }
    }
  }
}

export const securityLogger = new SecurityAuditLogger();
