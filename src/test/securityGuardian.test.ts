import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  RateLimiter,
  sanitizeInput,
  sanitizeUrl,
  sanitizeFilename,
  checkDomainIntegrity,
  securityLogger,
} from "@/lib/securityGuardian";

describe("Kaban Security Guardian - RateLimiter (Defesa contra Força Bruta)", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter({
      maxAttempts: 3,
      windowMs: 5000,
      baseLockoutMs: 2000,
    });
  });

  it("1. Deve permitir tentativas legítimas dentro do limite configurado", () => {
    const key = "user@primacorgrafica.com.br";
    const att1 = limiter.recordAttempt(key);
    expect(att1.allowed).toBe(true);
    expect(att1.remainingAttempts).toBe(2);

    const att2 = limiter.recordAttempt(key);
    expect(att2.allowed).toBe(true);
    expect(att2.remainingAttempts).toBe(1);

    const att3 = limiter.recordAttempt(key);
    expect(att3.allowed).toBe(true);
    expect(att3.remainingAttempts).toBe(0);
  });

  it("2. Deve bloquear tentativas adicionais quando o limite for excedido", () => {
    const key = "attacker@malicious.com";
    limiter.recordAttempt(key);
    limiter.recordAttempt(key);
    limiter.recordAttempt(key);

    // 4ª tentativa: estoura o limite de 3
    const blocked = limiter.recordAttempt(key);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.remainingAttempts).toBe(0);
  });

  it("3. Deve resetar o contador e permitir novas tentativas após sucesso", () => {
    const key = "operator@primacorgrafica.com.br";
    limiter.recordAttempt(key);
    limiter.recordAttempt(key);

    limiter.reset(key);

    const status = limiter.checkStatus(key);
    expect(status.allowed).toBe(true);
    expect(status.totalAttempts).toBe(0);
  });
});

describe("Kaban Security Guardian - Sanitizer (Defesa XSS & Path Traversal)", () => {
  it("4. Deve neutralizar tags <script> e manipuladores de eventos inline", () => {
    const maliciousPayload = "<script>alert('XSS')</script>Ordem Urgente<img src=x onerror=alert('hack') />";
    const cleaned = sanitizeInput(maliciousPayload);

    expect(cleaned).not.toContain("<script>");
    expect(cleaned).not.toContain("</script>");
    expect(cleaned).not.toContain("onerror=");
    expect(cleaned).toContain("Ordem Urgente");
  });

  it("5. Deve neutralizar pseudo-protocolos perigosos em URLs", () => {
    expect(sanitizeUrl("javascript:alert(document.cookie)")).toBe("#");
    expect(sanitizeUrl("data:text/html,<script>alert(1)</script>")).toBe("#");
    expect(sanitizeUrl("vbscript:msgbox(1)")).toBe("#");

    // URLs legítimas devem ser preservadas
    expect(sanitizeUrl("https://primacorgrafica.com.br")).toBe("https://primacorgrafica.com.br");
    expect(sanitizeUrl("http://localhost:8080/os/123")).toBe("http://localhost:8080/os/123");
    expect(sanitizeUrl("mailto:preimpressao@primacorgrafica.com.br")).toBe("mailto:preimpressao@primacorgrafica.com.br");
    expect(sanitizeUrl("/dashboard")).toBe("/dashboard");
  });

  it("6. Deve higienizar nomes de arquivos contra Path Traversal", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("..\\..\\Windows\\System32\\cmd.exe")).toBe("cmd.exe");
    expect(sanitizeFilename("arquivo:perigoso*?.pdf")).toBe("arquivo_perigoso__.pdf");
  });
});

describe("Kaban Security Guardian - Integridade de Domínio e Anti-Clonagem", () => {
  it("7. Deve validar domínios de produção e staging autorizados", () => {
    const result = checkDomainIntegrity();
    // Em ambiente de teste/node ou jsdom (localhost), deve ser considerado autorizado
    expect(result.isAuthorized).toBe(true);
  });
});

describe("Kaban Security Guardian - Prevenção de Escalação de Privilégios (Profiles)", () => {
  interface SimulatedProfile {
    user_id: string;
    nome: string;
    modulos_acesso: string[];
    setor_vinculado: string | null;
  }

  // Simula o trigger PostgreSQL prevent_self_module_escalation
  const simulateProfileUpdateTrigger = (
    oldProfile: SimulatedProfile,
    newProfile: SimulatedProfile,
    isCallerAdmin: boolean
  ): SimulatedProfile => {
    const resulting = { ...newProfile };
    if (!isCallerAdmin) {
      // Bloqueia escalação de modulos_acesso
      if (JSON.stringify(resulting.modulos_acesso) !== JSON.stringify(oldProfile.modulos_acesso)) {
        resulting.modulos_acesso = [...oldProfile.modulos_acesso];
      }
      // Bloqueia alteração indevida de setor_vinculado
      if (resulting.setor_vinculado !== oldProfile.setor_vinculado) {
        resulting.setor_vinculado = oldProfile.setor_vinculado;
      }
    }
    return resulting;
  };

  it("8. Deve reverter alterações em modulos_acesso e setor_vinculado feitas por usuários não-admin", () => {
    const original: SimulatedProfile = {
      user_id: "user-1",
      nome: "Operador CTP",
      modulos_acesso: ["producao"],
      setor_vinculado: "pre_impressao",
    };

    const attemptHack: SimulatedProfile = {
      user_id: "user-1",
      nome: "Operador CTP",
      modulos_acesso: ["producao", "admin", "comercial", "cadastro"], // tentativa de auto-promoção
      setor_vinculado: null, // tentativa de remover restrição de setor
    };

    const result = simulateProfileUpdateTrigger(original, attemptHack, false);
    expect(result.modulos_acesso).toEqual(["producao"]);
    expect(result.setor_vinculado).toBe("pre_impressao");
  });

  it("9. Deve permitir alterações em modulos_acesso e setor_vinculado quando o executor é admin", () => {
    const original: SimulatedProfile = {
      user_id: "user-2",
      nome: "Novo Operador",
      modulos_acesso: ["producao"],
      setor_vinculado: "pre_impressao",
    };

    const adminUpdate: SimulatedProfile = {
      user_id: "user-2",
      nome: "Novo Operador",
      modulos_acesso: ["producao", "expedicao"],
      setor_vinculado: "expedicao",
    };

    const result = simulateProfileUpdateTrigger(original, adminUpdate, true);
    expect(result.modulos_acesso).toEqual(["producao", "expedicao"]);
    expect(result.setor_vinculado).toBe("expedicao");
  });
});
