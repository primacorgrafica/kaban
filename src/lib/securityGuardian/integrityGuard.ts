/**
 * Kaban Security Guardian - Environment & Domain Integrity Guard
 * Detecta espelhamento não autorizado, clonagem de frontend e adulteração de ambiente.
 */

import { securityLogger } from "./auditLogger";

// Domínios autorizados para execução oficial do Primacor Kaban
const AUTHORIZED_DOMAINS = [
  "primacorflow.vercel.app",
  "localhost",
  "127.0.0.1",
];

export interface DomainIntegrityResult {
  isAuthorized: boolean;
  currentHost: string;
}

export function checkDomainIntegrity(): DomainIntegrityResult {
  if (typeof window === "undefined" || !window.location) {
    return { isAuthorized: true, currentHost: "SSR" };
  }

  const hostname = window.location.hostname.toLowerCase();

  // Permite localhost e IPs locais para desenvolvimento
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".vercel.app") || // Permite deploys de preview da Vercel
    hostname.endsWith("primacorgrafica.com.br")
  ) {
    return { isAuthorized: true, currentHost: hostname };
  }

  // Verifica se está na lista explícita
  const isMatch = AUTHORIZED_DOMAINS.some(
    (d) => hostname === d || hostname.endsWith(`.${d}`)
  );

  if (!isMatch) {
    void securityLogger.log({
      event_type: "DOMAIN_TAMPERING_DETECTED",
      severity: "critical",
      details: {
        detected_hostname: hostname,
        detected_origin: window.location.origin,
        timestamp: new Date().toISOString(),
      },
      target_resource: "ApplicationHost",
    });

    console.warn(
      `[KSG:Integrity] Atenção: A aplicação está sendo executada em um domínio não oficial (${hostname}). Operações críticas são monitoradas.`
    );
  }

  return { isAuthorized: isMatch, currentHost: hostname };
}
