import { OrderStatus } from "@/types/order";

/**
 * Obtém o número da revisão da ordem.
 * Prioridade:
 * 1. Tag no campo `observacao` (ex: "[REV1]", "[REV2]" ou "[REV:1]")
 * 2. Campo explícito `revisao` (number >= 1)
 * 3. Default: 0 (Versão original / sem revisão)
 */
export function getOrderRevision(order?: { revisao?: number | null; observacao?: string | null } | null): number {
  if (!order) return 0;
  if (order.observacao) {
    const match = order.observacao.match(/\[REV:?(\d+)\]/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num >= 1) return num;
    }
  }
  if (typeof order.revisao === "number") {
    const rev = Math.floor(order.revisao);
    if (rev > 1) return rev;
    if (rev === 1) {
      // Se observacao foi fornecida (inclusive null) mas não possui a tag [REV],
      // trata-se de um registro legado onde o banco definia DEFAULT 1 antes de qualquer revisão.
      if (order.observacao !== undefined && (!order.observacao || !order.observacao.match(/\[REV/i))) {
        return 0;
      }
      return 1;
    }
  }
  return 0;
}

/**
 * Limpa a tag de revisão do texto de observação para exibição limpa na interface.
 */
export function cleanObservationRevision(obs?: string | null): string {
  if (!obs) return "";
  return obs.replace(/\[REV:?\d+\]\s*/gi, "").trim();
}

/**
 * Atualiza ou insere a tag de revisão no texto de observação para persistência resiliente.
 */
export function setObservationRevision(obs: string | null | undefined, rev: number): string {
  const current = obs || "";
  const cleaned = cleanObservationRevision(current);
  if (rev < 1) return cleaned;
  const tag = `[REV${rev}]`;
  return cleaned ? `${tag} ${cleaned}` : tag;
}

/**
 * Determina se a movimentação de status representa um retorno para Preparação
 * (ex: vindo de Aguardando Aprovação, Produzindo Prova, Paralisado ou Arquivo Liberado).
 */
export function isReturnToPreparation(fromStatus: OrderStatus, toStatus: OrderStatus): boolean {
  return (
    toStatus === "preparando_arquivo" &&
    fromStatus !== "preparando_arquivo" &&
    fromStatus !== "fila_de_entrada"
  );
}
