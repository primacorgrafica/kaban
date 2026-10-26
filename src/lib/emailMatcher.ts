/**
 * Serviço de extração e validação de números de Ordem de Serviço em mensagens de e-mail.
 *
 * Estratégia de identificação:
 * 1. Para respostas de clientes: identificação EXCLUSIVA pelo número da O.S. no assunto do e-mail.
 * 2. Extrai candidatos numéricos completos de 4-6 dígitos.
 * 3. Valida cada candidato contra as O.S. ativas no Kanban.
 * 4. Nenhuma interpretação de palavras-chave de aprovação ou alteração automática de status.
 */

/**
 * Regex que captura números de 4 a 6 dígitos que representam potenciais O.S.
 * Exige lookbehind e lookahead negativos para evitar substrings parciais
 * dentro de sequências maiores como CPF/CNPJ, telefones ou datas (ex: "20261020" de 8 dígitos não será capturado).
 */
const OS_NUMBER_REGEX = /(?<!\d)\d{4,6}(?!\d)/g;

/**
 * Prefixos comuns que indicam um número de O.S. no contexto do assunto ou corpo.
 * Estes padrões precedem o número e aumentam a confiança de identificação.
 */
const OS_CONTEXT_PATTERNS = [
  /\bO\.?S\.?[.\s_#:-]*(\d{4,6})\b/gi,                   // "O.S. 73210", "O.S 73210", "O.S. #73210", "O.S.: 73210"
  /\bOS[.\s_#:-]*(\d{4,6})\b/gi,                        // "OS 73210", "OS-73210", "OS #73210", "OS: 73210"
  /#\s*(\d{4,6})\b/gi,                                   // "#73210", "# 73210"
  /\bordem(\s+de\s+servi[cç]o)?[.\s_#:-]*(\d{4,6})\b/gi, // "Ordem 73210", "Ordem de Serviço 73210"
  /\bservi[cç]o[.\s_#:-]*(\d{4,6})\b/gi,                 // "Serviço 73210", "Servico 73210"
  /\bn[°º]?[.\s_#:-]*(\d{4,6})\b/gi,                     // "n° 73210", "nº 73210"
];

/**
 * Prioriza candidatos numéricos:
 * - 5 dígitos (padrão principal de O.S. Primacor, ex: 73210) tem prioridade mais alta
 * - Anos civis comuns (2020 a 2035) têm menor prioridade quando outros números estiverem presentes
 */
function getCandidatePriority(numStr: string): number {
  const val = parseInt(numStr, 10);
  if (val >= 2020 && val <= 2035) return 1;
  if (numStr.length === 5) return 3;
  return 2;
}

/**
 * Extrai todos os candidatos a número de O.S. de um texto (assunto ou corpo de e-mail).
 * Retorna números únicos completos ordenados por confiança:
 * primeiro os que possuem contexto inequívoco de O.S., depois genéricos priorizados.
 */
export function extractOsNumbers(text: string): string[] {
  if (!text || typeof text !== "string") return [];

  const contextMatches = new Set<string>();
  const genericCandidates: string[] = [];

  // 1. Busca com contexto (alta confiança: "OS 73210", "O.S. #73210", etc.)
  for (const pattern of OS_CONTEXT_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      contextMatches.add(match[1]);
    }
  }

  // 2. Busca genérica de números de 4 a 6 dígitos (sem contexto)
  const genericRegex = new RegExp(OS_NUMBER_REGEX.source, "g");
  let genericMatch: RegExpExecArray | null;
  while ((genericMatch = genericRegex.exec(text)) !== null) {
    const num = genericMatch[0];
    if (!contextMatches.has(num) && !genericCandidates.includes(num)) {
      genericCandidates.push(num);
    }
  }

  // Ordena os genéricos priorizando O.S. de 5 dígitos sobre anos civis
  genericCandidates.sort((a, b) => getCandidatePriority(b) - getCandidatePriority(a));

  return [...contextMatches, ...genericCandidates];
}

/**
 * Dado uma lista de candidatos e um Set de números de O.S. ativas no Kanban,
 * retorna apenas os candidatos que correspondem a ordens reais existentes no Supabase.
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
 * Identifica a O.S. correspondente EXCLUSIVAMENTE a partir do assunto do e-mail.
 * Utilizado para processar respostas de clientes conforme a regra estrita do Kaban:
 * a identificação das respostas é feita unicamente pelo número da O.S. presente no assunto.
 *
 * Exemplos válidos:
 * - "73210"
 * - "RE: 73210"
 * - "RES: O.S. 73210"
 * - "Re: Orçamento - 73210"
 */
export function findOsInSubject(
  subject: string,
  activeOsTitulos: Set<string>
): { osNumber: string | null; ambiguous: boolean } {
  if (!subject || typeof subject !== "string") {
    return { osNumber: null, ambiguous: false };
  }

  const candidates = extractOsNumbers(subject);
  const { matches, ambiguous } = validateOsCandidates(candidates, activeOsTitulos);

  if (matches.length > 0) {
    return { osNumber: matches[0], ambiguous };
  }

  return { osNumber: null, ambiguous: false };
}

/**
 * Busca a O.S. no assunto e opcionalmente no corpo (para e-mails enviados).
 * Prioriza sempre o assunto.
 */
export function findOsInEmail(
  subject: string,
  bodyPreview: string,
  activeOsTitulos: Set<string>
): { osNumber: string | null; ambiguous: boolean } {
  // 1. Tenta encontrar no assunto primeiro (alta confiança)
  const subjectResult = findOsInSubject(subject, activeOsTitulos);
  if (subjectResult.osNumber) {
    return subjectResult;
  }

  // 2. Se não encontrou no assunto, busca no corpo
  const bodyCandidates = extractOsNumbers(bodyPreview);
  const bodyResult = validateOsCandidates(bodyCandidates, activeOsTitulos);

  if (bodyResult.matches.length > 0) {
    return { osNumber: bodyResult.matches[0], ambiguous: bodyResult.ambiguous };
  }

  // 3. Nenhuma O.S. encontrada
  return { osNumber: null, ambiguous: false };
}
