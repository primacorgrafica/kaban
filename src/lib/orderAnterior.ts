/**
 * Utilitários para gestão resiliente do N.º de O.S. Anterior em trabalhos do tipo "Repetição".
 * 
 * Permite que o operador informe QUALQUER número de O.S. anterior desejado
 * (ex: '69950'), sem qualquer restrição de ter passado pelo Kanban antes.
 * 
 * Garante extração resiliente tanto do campo `os_anterior` quanto de tags
 * armazenadas em `observacao` (ex: `[N.º O.S ANTERIOR: 69950]` ou `[REP: 69950]`).
 */

export function getEffectiveOsAnterior(order?: {
  tipo_trabalho?: string | null;
  os_anterior?: string | null;
  observacao?: string | null;
} | null): string {
  if (!order) return "";

  // 1. Prioridade: campo explícito os_anterior (limpo de caracteres não numéricos)
  if (order.os_anterior && typeof order.os_anterior === "string") {
    const cleaned = order.os_anterior.replace(/\D/g, "");
    if (cleaned) return cleaned;
  }

  // 2. Fallback: tag embutida em observacao
  if (order.observacao && typeof order.observacao === "string") {
    const match =
      order.observacao.match(/\[(?:N\.º\s*)?O\.?S\.?\s*ANTERIOR:\s*(\d+)\]/i) ||
      order.observacao.match(/\[(?:OS\s*ANT|REP):\s*(\d+)\]/i);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return "";
}

/**
 * Remove a tag de O.S. anterior da observação para manter o texto limpo quando necessário.
 */
export function cleanObservationOsAnterior(obs?: string | null): string {
  if (!obs) return "";
  return obs
    .replace(/\[(?:N\.º\s*)?O\.?S\.?\s*ANTERIOR:\s*\d+\]\s*/gi, "")
    .replace(/\[(?:OS\s*ANT|REP):\s*\d+\]\s*/gi, "")
    .trim();
}

/**
 * Atualiza ou insere a tag de O.S. anterior na observação para fallback de persistência.
 */
export function setObservationOsAnterior(obs: string | null | undefined, osAnt?: string | null): string {
  const current = obs || "";
  const cleaned = cleanObservationOsAnterior(current);
  const cleanOsAnt = osAnt ? osAnt.replace(/\D/g, "") : "";
  if (!cleanOsAnt) return cleaned;
  const tag = `[N.º O.S ANTERIOR: ${cleanOsAnt}]`;
  return cleaned ? `${tag} ${cleaned}` : tag;
}
