import { supabase } from "@/integrations/supabase/client";
import { Order, RelatedOrderSummary } from "@/types/order";
import { toast } from "sonner";

/**
 * Limpa o número da O.S. extraindo os dígitos principais
 */
export function cleanOsNumber(titulo: string | null | undefined): string {
  if (!titulo) return "";
  const match = titulo.match(/\d+/);
  return match ? match[0] : titulo.replace(/^#+/, "").trim();
}

/**
 * Normaliza uma ordem para o resumo exibido em vínculos
 */
export function toRelatedOrderSummary(order: Partial<Order> | any): RelatedOrderSummary {
  return {
    id: order.id,
    titulo: cleanOsNumber(order.titulo) || order.titulo || "S/N",
    cliente: (order.cliente || "").trim(),
    descricao: (order.descricao || "").trim(),
    setor: order.setor || null,
    status: order.status || null,
    setor_status: order.setor_status || null,
    arquivado: Boolean(order.arquivado),
  };
}

/**
 * Busca O.S. existentes para vincular, filtrando por número da O.S., cliente ou descrição.
 * Impede auto-vínculo (excludeOrderId) e vínculos duplicados.
 */
export async function searchOrdersForRelation(
  query: string,
  excludeOrderId?: string,
  inMemoryOrders: Order[] = []
): Promise<RelatedOrderSummary[]> {
  const cleanQ = (query || "").trim().toLowerCase();
  const resultsMap = new Map<string, RelatedOrderSummary>();

  // 1. Busca primeiro nas ordens já carregadas em memória (0ms latency)
  if (inMemoryOrders.length > 0) {
    for (const o of inMemoryOrders) {
      if (!o || !o.id) continue;
      if (excludeOrderId && o.id === excludeOrderId) continue;

      const tit = (o.titulo || "").toLowerCase();
      const cli = (o.cliente || "").toLowerCase();
      const desc = (o.descricao || "").toLowerCase();

      if (!cleanQ || tit.includes(cleanQ) || cli.includes(cleanQ) || desc.includes(cleanQ)) {
        resultsMap.set(o.id, toRelatedOrderSummary(o));
      }
      if (resultsMap.size >= 15) break;
    }
  }

  // 2. Se a busca tiver termos e o resultado for menor que 10, complementa direto do banco Supabase
  if (cleanQ && resultsMap.size < 10) {
    try {
      let req = supabase
        .from("orders")
        .select("id, titulo, cliente, descricao, setor, status, setor_status, arquivado")
        .or(`titulo.ilike.%${cleanQ}%,cliente.ilike.%${cleanQ}%,descricao.ilike.%${cleanQ}%`)
        .limit(15);

      if (excludeOrderId) {
        req = req.neq("id", excludeOrderId);
      }

      const { data, error } = await req;
      if (!error && Array.isArray(data)) {
        data.forEach((row: any) => {
          if (!resultsMap.has(row.id)) {
            resultsMap.set(row.id, toRelatedOrderSummary(row));
          }
        });
      }
    } catch (err) {
      console.warn("[orderRelationsService] Erro ao buscar ordens no banco:", err);
    }
  }

  return Array.from(resultsMap.values());
}

/**
 * Obtém as informações resumidas de uma lista de IDs de O.S. relacionadas
 */
export async function getRelatedOrdersInfo(
  relatedIds: string[],
  inMemoryOrders: Order[] = []
): Promise<RelatedOrderSummary[]> {
  if (!relatedIds || relatedIds.length === 0) return [];

  const found: RelatedOrderSummary[] = [];
  const missingIds: string[] = [];

  // 1. Procura em memória
  const memoryMap = new Map<string, Order>();
  inMemoryOrders.forEach((o) => {
    if (o.id) memoryMap.set(o.id, o);
  });

  for (const id of relatedIds) {
    const mem = memoryMap.get(id);
    if (mem) {
      found.push(toRelatedOrderSummary(mem));
    } else {
      missingIds.push(id);
    }
  }

  // 2. Busca IDs ausentes no banco
  if (missingIds.length > 0) {
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("id, titulo, cliente, descricao, setor, status, setor_status, arquivado")
        .in("id", missingIds);

      if (!error && Array.isArray(data)) {
        data.forEach((row: any) => {
          found.push(toRelatedOrderSummary(row));
        });
      }
    } catch (err) {
      console.warn("[orderRelationsService] Erro ao buscar detalhes de ordens relacionadas:", err);
    }
  }

  // Ordena por título da O.S.
  return found.sort((a, b) => a.titulo.localeCompare(b.titulo, undefined, { numeric: true }));
}

/**
 * Sincronização bidirecional de vínculos entre O.S.
 * Se a O.S. A for vinculada à O.S. B:
 * - A passa a ter B em suas O.S. relacionadas
 * - B passa a ter A em suas O.S. relacionadas
 * - Removendo B de A, A é removido de B automaticamente.
 */
export async function syncOrderRelations(
  orderId: string,
  nextRelatedIds: string[],
  userId?: string,
  currentRelatedIds?: string[]
): Promise<string[]> {
  if (!orderId) return [];

  // Garante que não haja auto-vínculo nem duplicatas
  const cleanNextIds = Array.from(
    new Set(nextRelatedIds.filter((id) => id && id !== orderId))
  );

  let oldIds: string[] = currentRelatedIds || [];

  // Se não foi fornecida a lista atual, descobre consultando o registro atual da ordem
  if (!currentRelatedIds) {
    try {
      const { data: currentOrder } = await supabase
        .from("orders")
        .select("related_order_ids")
        .eq("id", orderId)
        .maybeSingle();

      if (currentOrder?.related_order_ids && Array.isArray(currentOrder.related_order_ids)) {
        oldIds = currentOrder.related_order_ids;
      } else {
        // Consulta tabela order_relations
        const { data: relData } = await supabase
          .from("order_relations")
          .select("related_order_id")
          .eq("order_id", orderId);

        if (relData && Array.isArray(relData)) {
          oldIds = relData.map((r: any) => r.related_order_id);
        }
      }
    } catch {
      oldIds = [];
    }
  }

  const addedIds = cleanNextIds.filter((id) => !oldIds.includes(id));
  const removedIds = oldIds.filter((id) => !cleanNextIds.includes(id));

  // 1. Atualiza a ordem principal com a nova lista de relacionados
  try {
    await (supabase.from("orders") as any)
      .update({
        related_order_ids: cleanNextIds,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId);
  } catch (err) {
    console.warn("[orderRelationsService] Falha ao atualizar related_order_ids na ordem:", err);
  }

  // 2. Processa adições (BIDIRECIONAL: insere A->B e B->A)
  for (const targetId of addedIds) {
    // Insere pares na tabela order_relations
    try {
      await supabase.from("order_relations").upsert(
        [
          { order_id: orderId, related_order_id: targetId, created_by: userId || null },
          { order_id: targetId, related_order_id: orderId, created_by: userId || null },
        ] as any,
        { onConflict: "order_id,related_order_id" }
      );
    } catch {
      // Ignora se tabela não existir
    }

    // Atualiza a outra ponta (B) para incluir A em seu array related_order_ids
    try {
      const { data: targetOrder } = await supabase
        .from("orders")
        .select("related_order_ids")
        .eq("id", targetId)
        .maybeSingle();

      const existingTargetIds: string[] = Array.isArray(targetOrder?.related_order_ids)
        ? targetOrder.related_order_ids
        : [];

      if (!existingTargetIds.includes(orderId)) {
        const updatedTargetIds = [...existingTargetIds, orderId];
        await (supabase.from("orders") as any)
          .update({
            related_order_ids: updatedTargetIds,
            updated_at: new Date().toISOString(),
          })
          .eq("id", targetId);
      }
    } catch (err) {
      console.warn(`[orderRelationsService] Falha ao atualizar vínculo bidirecional em ${targetId}:`, err);
    }
  }

  // 3. Processa remoções (BIDIRECIONAL: remove A->B e B->A)
  for (const targetId of removedIds) {
    try {
      await supabase
        .from("order_relations")
        .delete()
        .or(`and(order_id.eq.${orderId},related_order_id.eq.${targetId}),and(order_id.eq.${targetId},related_order_id.eq.${orderId})`);
    } catch {
      // ignore
    }

    // Remove A do array related_order_ids da ordem B
    try {
      const { data: targetOrder } = await supabase
        .from("orders")
        .select("related_order_ids")
        .eq("id", targetId)
        .maybeSingle();

      if (targetOrder?.related_order_ids && Array.isArray(targetOrder.related_order_ids)) {
        const updatedTargetIds = targetOrder.related_order_ids.filter((id: string) => id !== orderId);
        await (supabase.from("orders") as any)
          .update({
            related_order_ids: updatedTargetIds,
            updated_at: new Date().toISOString(),
          })
          .eq("id", targetId);
      }
    } catch (err) {
      console.warn(`[orderRelationsService] Falha ao remover vínculo bidirecional em ${targetId}:`, err);
    }
  }

  // Emite evento global para que o Kanban e todos os cards atualizem seus ícones imediatamente
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("orders-relations-updated", {
        detail: { orderId, relatedOrderIds: cleanNextIds },
      })
    );
  }

  return cleanNextIds;
}

/**
 * Determina o caminho de rota correto no Kaban para uma O.S. com base no setor e arquivamento
 */
export function getSectorRoute(setor: string | null | undefined, arquivado?: boolean): string {
  if (arquivado) return "/arquivados";
  const s = (setor || "").toLowerCase().trim();
  switch (s) {
    case "ctp":
      return "/ctp";
    case "digital":
      return "/digital";
    case "qualidade":
      return "/qualidade";
    case "producao":
      return "/producao";
    case "expedicao":
      return "/expedicao";
    case "compras":
      return "/compras";
    case "manutencao":
      return "/manutencao";
    case "pre_impressao":
    case "":
      return "/";
    default:
      return `/producao/${s}`;
  }
}

/**
 * Obtém o rótulo amigável do setor da O.S.
 */
export function getSectorFriendlyLabel(setor: string | null | undefined, arquivado?: boolean): string {
  if (arquivado) return "O.S. Concluída / Arquivada";
  const s = (setor || "").toLowerCase().trim();
  switch (s) {
    case "ctp":
      return "CTP";
    case "digital":
      return "Digital";
    case "qualidade":
      return "Qualidade";
    case "producao":
      return "Produção (Chão de Fábrica)";
    case "expedicao":
      return "Expedição";
    case "compras":
      return "Compras";
    case "manutencao":
      return "Manutenção";
    case "pre_impressao":
    case "":
      return "Pré-Impressão";
    default:
      return setor || "Setor";
  }
}

/**
 * Destaca visualmente um card de O.S. na tela com pulsação e foco suave
 */
export function highlightOrderCard(orderId: string): boolean {
  if (typeof document === "undefined" || !orderId) return false;

  const cardElement = document.getElementById(`order-card-${orderId}`);
  if (cardElement) {
    cardElement.scrollIntoView({ behavior: "smooth", block: "center" });

    // Aplica classes de destaque temporário
    const highlightClasses = [
      "ring-4",
      "ring-amber-500",
      "dark:ring-amber-400",
      "shadow-[0_0_35px_rgba(245,158,11,0.9)]",
      "scale-[1.03]",
      "z-30",
      "transition-all",
      "duration-300",
    ];

    cardElement.classList.add(...highlightClasses);

    setTimeout(() => {
      cardElement.classList.remove(...highlightClasses);
    }, 4000);

    return true;
  }
  return false;
}
