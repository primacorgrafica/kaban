/**
 * Serviço de extração e validação de números de Ordem de Serviço em mensagens de e-mail.
 *
 * Estratégia de identificação:
 * 1. Extrai candidatos numéricos de 4-6 dígitos do assunto e corpo.
 * 2. Valida cada candidato contra as O.S. ativas no Kanban.
 * 3. Para respostas sem número explícito, utiliza o conversationId do Graph
 *    para vincular à O.S. previamente associada à conversa.
 * 4. Analisa respostas de clientes para detecção de APROVAÇÃO automática.
 */

/**
 * Regex que captura números de 4 a 6 dígitos que representam potenciais O.S.
 * Exige word boundary para evitar substrings dentro de sequências maiores
 * como CPF/CNPJ, telefones ou datas (ex: "20261020" de 8 dígitos não será capturado).
 */
const OS_NUMBER_REGEX = /(?<!\d)\d{4,6}(?!\d)/g;

/**
 * Prefixos comuns que indicam um número de O.S. no contexto do assunto ou corpo.
 * Estes padrões precedem o número e aumentam a confiança de identificação.
 */
const OS_CONTEXT_PATTERNS = [
  /\bOS[.\s_#:-]*(\d{4,6})\b/gi,        // "OS 73210", "OS-73210", "OS #73210", "OS: 73210"
  /\bO\.?S\.?[.\s_#:-]*(\d{4,6})\b/gi,   // "O.S. 73210", "O.S 73210", "O.S. #73210"
  /#\s*(\d{4,6})\b/gi,                   // "#73210", "# 73210"
  /\bordem[.\s_#:-]*(\d{4,6})\b/gi,      // "Ordem 73210", "Ordem #73210"
  /\bserviço[.\s_#:-]*(\d{4,6})\b/gi,    // "Serviço 73210"
  /\bn[°º]?[.\s_#:-]*(\d{4,6})\b/gi,     // "n° 73210", "nº 73210"
];

/**
 * Frases e expressões que indicam APROVAÇÃO inequívoca por parte do cliente.
 */
export const APPROVAL_PHRASES = [
  "aprovado pelo cliente",
  "aprovada pelo cliente",
  "aprovado para producao",
  "aprovada para producao",
  "aprovacao confirmada",
  "aprovado sem ressalvas",
  "aprovada sem ressalvas",
  "aprovado final",
  "aprovada final",
  "pode produzir",
  "pode rodar",
  "pode imprimir",
  "producao liberada",
  "arte aprovada",
  "layout aprovado",
  "servico aprovado",
  "de acordo",
];

export const APPROVAL_KEYWORDS_REGEX =
  /\b(aprovad[oa]s?|aprovac[aã]o|aprovac[oõ]es|autorizad[oa]s?|liberad[oa]s?|validad[oa]s?|confirmad[oa]s?|aceit[oa]s?|ok)\b/i;

// Padrões de negação ou rejeição que invalidam aprovação (ex: "não aprovado", "reprovado")
export const REJECTION_NEGATION_REGEX =
  /\b(nao\s+(esta\s+)?(aprovad[oa]s?|aprovacao|autorizad[oa]s?|liberad[oa]s?|de acordo|ok|aceit[oa]s?|validad[oa]s?|confirmad[oa]s?)|reprovad[oa]s?|rejeitad[oa]s?|cancelad[oa]s?|recusad[oa]s?|desaprovad[oa]s?)\b/i;

/**
 * Verifica se um texto (assunto ou corpo de e-mail de resposta do cliente)
 * expressa aprovação explícita do material.
 */
export function isApprovalResponse(text: string): boolean {
  if (!text || typeof text !== "string") return false;

  const clean = text.trim();
  const normalized = clean
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  // 1. Se houver negação ou rejeição explícita, NÃO é aprovação
  if (REJECTION_NEGATION_REGEX.test(normalized)) {
    return false;
  }

  // 2. Busca por frases compostas de aprovação
  for (const phrase of APPROVAL_PHRASES) {
    if (normalized.includes(phrase)) {
      return true;
    }
  }

  // 3. Busca por palavras-chave isoladas (com word boundary)
  if (APPROVAL_KEYWORDS_REGEX.test(clean) || APPROVAL_KEYWORDS_REGEX.test(normalized)) {
    return true;
  }

  return false;
}

/**
 * Extrai todos os candidatos a número de O.S. de um texto (assunto ou corpo de e-mail).
 * Retorna números únicos ordenados por confiança (primeiro os que têm contexto de "OS").
 */
export function extractOsNumbers(text: string): string[] {
  if (!text || typeof text !== "string") return [];

  const contextMatches = new Set<string>();
  const genericMatches = new Set<string>();

  // 1. Busca com contexto (alta confiança)
  for (const pattern of OS_CONTEXT_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      contextMatches.add(match[1]);
    }
  }

  // 2. Busca genérica (confiança menor)
  const genericRegex = new RegExp(OS_NUMBER_REGEX.source, "g");
  let genericMatch: RegExpExecArray | null;
  while ((genericMatch = genericRegex.exec(text)) !== null) {
    const num = genericMatch[0];
    if (!contextMatches.has(num)) {
      genericMatches.add(num);
    }
  }

  // Retorna contextuais primeiro, depois genéricos
  return [...contextMatches, ...genericMatches];
}

/**
 * Dado uma lista de candidatos e um Set de números de O.S. ativas no Kanban,
 * retorna apenas os candidatos que correspondem a ordens reais.
 */
export function validateOsCandidates(
  candidates: string[],
  activeOsTitulos: Set<string>
): { matches: string[]; ambiguous: boolean } {
  const matches = candidates.filter((c) => activeOsTitulos.has(c));
  return {
    matches,
    ambiguous: matches.length > 1,
  };
}

/**
 * Pipeline completo: extrai do assunto + corpo e valida contra as ordens ativas.
 * Prioriza o assunto (mais confiável que o corpo).
 */
export function findOsInEmail(
  subject: string,
  bodyPreview: string,
  activeOsTitulos: Set<string>
): { osNumber: string | null; ambiguous: boolean } {
  // 1. Tenta encontrar no assunto primeiro (alta confiança)
  const subjectCandidates = extractOsNumbers(subject);
  const subjectResult = validateOsCandidates(subjectCandidates, activeOsTitulos);

  if (subjectResult.matches.length === 1) {
    return { osNumber: subjectResult.matches[0], ambiguous: false };
  }

  if (subjectResult.matches.length > 1) {
    return { osNumber: subjectResult.matches[0], ambiguous: true };
  }

  // 2. Se não encontrou no assunto, busca no corpo
  const bodyCandidates = extractOsNumbers(bodyPreview);
  const bodyResult = validateOsCandidates(bodyCandidates, activeOsTitulos);

  if (bodyResult.matches.length === 1) {
    return { osNumber: bodyResult.matches[0], ambiguous: false };
  }

  if (bodyResult.matches.length > 1) {
    return { osNumber: bodyResult.matches[0], ambiguous: true };
  }

  // 3. Nenhuma O.S. encontrada
  return { osNumber: null, ambiguous: false };
}
