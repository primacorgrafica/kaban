import { Order } from "@/types/order";
import { toast } from "sonner";

/**
 * Lista de setores que NÃO são considerados Produção (Pré-Impressão, Expedição, Compras, Manutenção).
 */
export const NON_PRODUCTION_SECTOR_KEYS = [
  "pre_impressao",
  "expedicao",
  "compras",
  "manutencao",
  "faturamento",
];

/**
 * Determina se a O.S. está atualmente dentro da etapa/setor de Produção.
 * Válido para ordens ativas cujo setor seja produção, ctp, digital, qualidade ou subdepartamentos produtivos.
 */
export function isOrderInProduction(
  order?: { setor?: string | null; arquivado?: boolean | null } | null
): boolean {
  if (!order || order.arquivado) return false;
  const s = (order.setor || "").toLowerCase().trim();
  if (!s) return false;
  return !NON_PRODUCTION_SECTOR_KEYS.includes(s);
}

/**
 * Remove qualquer tag técnica de prioridade da produção da observação
 */
export function cleanObservationProductionPriority(obs?: string | null): string {
  if (!obs || typeof obs !== "string") return "";
  return obs
    .replace(/\[(?:PRIORIDADE_PROD|PRIORIDADE_PRODUCAO)\]\s*/gi, "")
    .trim();
}

/**
 * Insere ou remove a tag técnica de prioridade da produção na observação
 */
export function setObservationProductionPriority(
  obs: string | null | undefined,
  isPriority: boolean
): string {
  const current = obs || "";
  const cleaned = cleanObservationProductionPriority(current);
  if (!isPriority) return cleaned;
  const tag = "[PRIORIDADE_PRODUCAO]";
  return cleaned ? `${tag} ${cleaned}` : tag;
}

/**
 * Retorna true se a O.S. possui prioridade na Produção ativa.
 * A prioridade só é válida se a O.S. estiver de fato dentro do setor de Produção.
 */
export function hasProductionPriority(
  order?: Partial<Order> | { setor?: string | null; arquivado?: boolean | null; prioridade_producao?: boolean | null; observacao?: string | null } | null
): boolean {
  if (!order) return false;
  if (!isOrderInProduction(order)) return false;

  if (order.prioridade_producao === true) return true;

  if (order.observacao && typeof order.observacao === "string") {
    return /\[(?:PRIORIDADE_PROD|PRIORIDADE_PRODUCAO)\]/i.test(order.observacao);
  }

  return false;
}

/**
 * Alterna a prioridade da O.S. na Produção (marcar / remover prioridade)
 */
export async function toggleProductionPriority(
  order: Order,
  onUpdate: (id: string, data: Partial<Order>) => Promise<any> | void
): Promise<boolean> {
  const nextPriority = !hasProductionPriority(order);
  const updatedObs = setObservationProductionPriority(order.observacao, nextPriority);

  try {
    await Promise.resolve(
      onUpdate(order.id, {
        prioridade_producao: nextPriority,
        observacao: updatedObs,
      })
    );

    if (nextPriority) {
      toast.success(`O.S. #${order.titulo} marcada como prioridade na Produção! ⭐`, {
        description: "A O.S. foi movida para o topo da coluna de Produção.",
      });
    } else {
      toast.info(`Prioridade removida da O.S. #${order.titulo}.`, {
        description: "A O.S. voltou à ordenação padrão da fila.",
      });
    }

    return nextPriority;
  } catch (err) {
    console.error("[toggleProductionPriority] Falha ao alternar prioridade na Produção:", err);
    toast.error("Erro ao atualizar prioridade da O.S. na Produção.");
    return !nextPriority;
  }
}
