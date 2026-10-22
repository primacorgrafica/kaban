---
name: kaban-security-guardian
description: Continuous cybersecurity auditing, attack prevention, anti-tampering, RLS verification, and incident response for the Primacor Kaban system.
---

# Kaban Security Guardian (KSG) 🛡️

O **Kaban Security Guardian** é a Skill especializada de cibersegurança e engenharia defensiva do Primacor Kaban. Seu objetivo é proteger proativamente o sistema contra invasões, exploração de vulnerabilidades (OWASP Top 10), clonagem não autorizada, roubo de código/sessão, vazamento de dados de ordens de serviço e acessos indevidos.

---

## 1. Princípios Fundamentais de Segurança

1. **Defesa em Profundidade (Defense-in-Depth)**:
   - O código JavaScript no navegador do cliente **nunca** é considerado um segredo inviolável.
   - Toda e qualquer regra de autorização sensível **deve** ser garantida no backend via **Row Level Security (RLS)** do PostgreSQL/Supabase e validação estrita em Edge Functions.
2. **Menor Privilégio (Principle of Least Privilege)**:
   - Perfis de usuário (`operador`, `vendedor`, `orcamentista`, `coordenador`, `admin`) possuem visibilidade e permissões estritamente limitadas ao seu escopo.
   - Políticas RLS devem seguir o padrão *Default-Deny* (negar por padrão).
3. **Preservação de Integridade e Não-Destrutividade**:
   - NUNCA executar comandos destrutivos ou alterar dados de produção sem autorização explícita.
   - NUNCA expor segredos, tokens ou senhas no código-fonte, nos commits ou nos logs.
4. **Auditoria Contínua e Rastreabilidade**:
   - Toda ação sensível (tentativas repetidas de login, modificações de permissão, exclusões de OS, exports em massa de dados) deve ser registrada na tabela `security_audit_logs`.

---

## 2. Matriz de Ameaças & Contramedidas

| Vetor de Ataque | Risco / Impacto | Contramedida Implementada no Kaban |
| :--- | :--- | :--- |
| **Brute Force / Credential Stuffing** | Tentativa automatizada de adivinhar credenciais de operadores/admins | Limitador adaptativo (`rateLimiter.ts`) com bloqueio progressivo (30s / 60s / 120s) e log de auditoria `AUTH_BRUTE_FORCE_BLOCKED`. |
| **SQL Injection** | Extração ou corrupção de dados via parâmetros SQL | Uso exclusivo de consultas parametrizadas via PostgREST / Supabase Client e RPCs com parâmetros tipados. Zero consultas com interpolação de strings no banco. |
| **Stored & Reflected XSS** | Injeção de scripts maliciosos em mensagens de chat, notas ou títulos | Sanitização prévia de strings e URLs com `sanitizer.ts`, neutralização de pseudo-protocolos `javascript:` e ausência de `dangerouslySetInnerHTML` com dados do usuário. |
| **Privilege Escalation (Elevação de Privilégios)** | Usuário não-admin alterando `role`, `modulos_acesso` ou `setor_vinculado` | Trigger de banco de dados `trg_prevent_self_module_escalation` e RLS na tabela `user_roles`. Guardas de rota no `App.tsx` e bloqueio de UI em `UserManagementPage.tsx`. |
| **Clonagem / Espelhamento Não Autorizado** | Cópia do bundle frontend hospedada em domínio paralelo/malicioso | Detector de integridade de domínio (`integrityGuard.ts`) que emite alertas de auditoria e avisa sobre ambiente adulterado. Backend protegido por RLS exige autenticação legítima no Supabase Primacor. |
| **Exposição de Credenciais SharePoint** | Vazamento de segredos corporativos do Microsoft 365 | Utilização estrita de fluxo público OAuth 2.0 com PKCE via MSAL (`@azure/msal-browser`). O Client Secret corporativo NUNCA é colocado no frontend. |
| **Clickjacking & MIME-Sniffing** | Incorporação do Kaban em iframes de phishing | Configuração de cabeçalhos de segurança e CSP em `index.html` com `frame-ancestors 'none'` e `X-Content-Type-Options: nosniff`. |

---

## 3. Protocolos de Verificação & Auditoria

Quando invocado para auditar a segurança do projeto, o agente deve seguir este checklist:

### A. Auditoria de RLS e Banco de Dados
1. Verificar se todas as tabelas possuem `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`.
2. Confirmar que tabelas sensíveis (`user_roles`, `profiles`, `security_audit_logs`, `orders`, `order_attachments`) não possuem políticas `FOR ALL ... USING (true)`.
3. Inspecionar funções `SECURITY DEFINER` para garantir que definem explicitamente `SET search_path = public` a fim de prevenir hijacking de schemas.

### B. Auditoria de Autenticação e Sessão
1. Verificar se `useAuth.tsx` valida adequadamente a expiração de sessão e revoga estados em caso de logout.
2. Garantir que o `rateLimiter.ts` está ativo na tela de autenticação (`AuthPage.tsx`).
3. Verificar se senhas enviadas atendem aos requisitos mínimos de complexidade.

### C. Auditoria de Dependências
1. Rodar `npm audit` ou inspecionar `package.json` para identificar bibliotecas com vulnerabilidades conhecidas (CVEs).
2. Manter bibliotecas críticas de autenticação (`@supabase/supabase-js`, `@azure/msal-browser`) atualizadas.

---

## 4. Estrutura do Módulo de Segurança (`src/lib/securityGuardian/`)

- [`auditLogger.ts`](file:///c:/Users/Preimpressao-Primaco/OneDrive%20-%20PRIMACOR%20GRAFICA%20E%20EDITORA%20LTDA/Documents/preimpressao/src/lib/securityGuardian/auditLogger.ts): Disparador de eventos de segurança para `security_audit_logs`.
- [`rateLimiter.ts`](file:///c:/Users/Preimpressao-Primaco/OneDrive%20-%20PRIMACOR%20GRAFICA%20E%20EDITORA%20LTDA/Documents/preimpressao/src/lib/securityGuardian/rateLimiter.ts): Gerenciador de limite de tentativas com cooldown exponencial.
- [`sanitizer.ts`](file:///c:/Users/Preimpressao-Primaco/OneDrive%20-%20PRIMACOR%20GRAFICA%20E%20EDITORA%20LTDA/Documents/preimpressao/src/lib/securityGuardian/sanitizer.ts): Validação e higienização estrita contra vetores de XSS.
- [`integrityGuard.ts`](file:///c:/Users/Preimpressao-Primaco/OneDrive%20-%20PRIMACOR%20GRAFICA%20E%20EDITORA%20LTDA/Documents/preimpressao/src/lib/securityGuardian/integrityGuard.ts): Validador de integridade de ambiente e detecção de clonagem.
