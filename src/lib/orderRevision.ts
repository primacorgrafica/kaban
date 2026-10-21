import { OrderStatus } from "@/types/order";

/**
 * Obtém o número da revisão da ordem.
 * Prioridade:
 * 1. Campo explícito `revisao` (number >= 1)
 * 2. Tag no campo `observacao` (ex: "[REV2]" ou "[REV:2]")
 * 3. Default: 1 (Versão original)
 */
export function getOrderRevision(order?: { revisao?: number | null; observacao?: string | null } | null): number {
  if (!order) return 1;
  if (typeof order.revisao === "number" && order.revisao >= 1) {
    return Math.floor(order.revisao);
  }
  if (order.observacao) {
    const match = order.observacao.match(/\[REV:?(\d+)\]/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num >= 1) return num;
    }
  }
  return 1;
}

/**
 * Atualiza ou insere a tag de revisão no texto de observação para persistência resiliente.
 */
export function setObservationRevision(obs: string | null | undefined, rev: number): string {
  const current = obs || "";
  const cleaned = current.replace(/\[REV:?\d+\]\s*/gi, "").trim();
  if (rev <= 1) return cleaned;
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
