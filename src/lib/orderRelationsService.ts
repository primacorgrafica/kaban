import { supabase } from "@/integrations/supabase/client";
import { Order, RelatedOrderSummary } from "@/types/order";
import { toast } from "sonner";

/** Cache em memória de ordens conhecidas para resolução instantânea (0ms) de vínculos */
const knownOrdersCache = new Map<string, Order>();

/**
 * Registra uma lista de ordens no cache em memória (indexando por UUID e por número de O.S.)
 */
export function registerKnownOrders(orders: Order[]): void {
  if (!Array.isArray(orders)) return;
  for (const o of orders) {
    if (!o) continue;
    if (o.id) {
      knownOrdersCache.set(o.id, o);
    }
    const cleanNum = cleanOsNumber(o.titulo);
    if (cleanNum) {
      knownOrdersCache.set(cleanNum, o);
      knownOrdersCache.set(`#${cleanNum}`, o);
      knownOrdersCache.set(`OS-${cleanNum}`, o);
    }
  }
}

/**
 * Limpa o número da O.S. extraindo os dígitos principais.
 * Preserva UUIDs intactos para evitar truncamento indevido de identificadores.
 */
export function cleanOsNumber(titulo: string | null | undefined): string {
  if (!titulo) return "";
  const trimmed = titulo.trim();
  if (isUuid(trimmed)) return trimmed;
  const match = trimmed.match(/\d+/);
  return match ? match[0] : trimmed.replace(/^#+/, "").trim();
}

/**
 * Extrai os IDs ou números de O.S. vinculadas a partir da tag embutida em observacao
 * ex: "[VINCULO_OS: 73527, 73500]" ou "[O.S. RELACIONADAS: 73527]"
 */
export function extractRelatedOrdersFromObservation(obs?: string | null): string[] {
  if (!obs || typeof obs !== "string") return [];
  const match =
    obs.match(/\[(?:VINCULO(?:_OS)?|O\.?S\.?\s*RELACIONADAS?):\s*([^\]]+)\]/i);
  if (!match || !match[1]) return [];

  return match[1]
    .split(/[,;\s]+/)
    .map((s) => s.trim().replace(/^#+/, ""))
    .filter(Boolean);
}

/**
 * Limpa a tag de vínculo de O.S. da observação para manter o texto da interface limpo e legível
 */
export function cleanObservationRelatedOrders(obs?: string | null): string {
  if (!obs || typeof obs !== "string") return "";
  return obs
    .replace(/\[(?:VINCULO(?:_OS)?|O\.?S\.?\s*RELACIONADAS?):\s*[^\]]+\]\s*/gi, "")
    .trim();
}

/**
 * Atualiza ou insere a tag de vínculo de O.S. na observação para persistência resiliente no banco
 */
export function setObservationRelatedOrders(
  obs: string | null | undefined,
  relatedIdentifiers: string[]
): string {
  const current = obs || "";
  const cleaned = cleanObservationRelatedOrders(current);
  const cleanList = Array.from(
    new Set(
      relatedIdentifiers
        .map((id) => {
          if (!id) return "";
          const trimmed = id.trim();
          if (!isUuid(trimmed)) {
            return cleanOsNumber(trimmed) || trimmed;
          }
          const cached = knownOrdersCache.get(trimmed);
          if (cached?.titulo) {
            const num = cleanOsNumber(cached.titulo);
            if (num) return num;
          }
          return trimmed;
        })
        .filter(Boolean)
    )
  );

  if (cleanList.length === 0) return cleaned;
  const tag = `[VINCULO_OS: ${cleanList.join(", ")}]`;
  return cleaned ? `${tag} ${cleaned}` : tag;
}

/**
 * Retorna a lista efetiva de O.S. relacionadas de uma ordem (unindo coluna nativa e observacao)
 */
export function getEffectiveRelatedOrders(order?: {
  related_order_ids?: string[] | null;
  observacao?: string | null;
} | null): string[] {
  if (!order) return [];

  const fromColumn: string[] = Array.isArray(order.related_order_ids)
    ? order.related_order_ids.filter(Boolean)
    : [];

  const fromObs = extractRelatedOrdersFromObservation(order.observacao);

  const merged = Array.from(new Set([...fromColumn, ...fromObs]));
  return merged;
}

/**
 * Normaliza uma ordem para o resumo exibido em vínculos
 */
export function toRelatedOrderSummary(order: Partial<Order> | any): RelatedOrderSummary {
  return {
    id: order.id || "",
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
 * Validador para string em formato UUID v4
 */
export function isUuid(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str.trim());
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

  // 1. Registra e pesquisa primeiro nas ordens já carregadas em memória (0ms latency)
  if (inMemoryOrders.length > 0) {
    registerKnownOrders(inMemoryOrders);
  }

  for (const o of knownOrdersCache.values()) {
    if (!o || !o.id) continue;
    if (excludeOrderId && (o.id === excludeOrderId || cleanOsNumber(o.titulo) === excludeOrderId)) continue;

    const tit = (o.titulo || "").toLowerCase();
    const cli = (o.cliente || "").toLowerCase();
    const desc = (o.descricao || "").toLowerCase();

    if (!cleanQ || tit.includes(cleanQ) || cli.includes(cleanQ) || desc.includes(cleanQ)) {
      resultsMap.set(o.id, toRelatedOrderSummary(o));
    }
    if (resultsMap.size >= 15) break;
  }

  // 2. Se a busca tiver termos e o resultado for menor que 10, complementa direto do banco Supabase
  if (cleanQ && resultsMap.size < 10) {
    try {
      let req = supabase
        .from("orders")
        .select("id, titulo, cliente, descricao, setor, status, setor_status, arquivado, observacao")
        .or(`titulo.ilike.%${cleanQ}%,cliente.ilike.%${cleanQ}%,descricao.ilike.%${cleanQ}%`)
        .limit(15);

      if (excludeOrderId && isUuid(excludeOrderId)) {
        req = req.neq("id", excludeOrderId);
      }

      const { data, error } = await req;
      if (!error && Array.isArray(data)) {
        data.forEach((row: any) => {
          if (!resultsMap.has(row.id)) {
            const summary = toRelatedOrderSummary(row);
            resultsMap.set(row.id, summary);
            knownOrdersCache.set(row.id, row);
            const num = cleanOsNumber(row.titulo);
            if (num) knownOrdersCache.set(num, row);
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
 * Obtém as informações resumidas de uma lista de IDs ou números de O.S. relacionadas.
 * Com proteção contra UUID inválido (22P02) e timeout de segurança para nunca travar a UI em loop.
 */
async function getRelatedOrdersInfoInternal(
  relatedIds: string[],
  inMemoryOrders: Order[] = []
): Promise<RelatedOrderSummary[]> {
  if (!relatedIds || relatedIds.length === 0) return [];

  if (inMemoryOrders.length > 0) {
    registerKnownOrders(inMemoryOrders);
  }

  const found: RelatedOrderSummary[] = [];
  const foundKeys = new Set<string>();
  const missingIds: string[] = [];

  for (const rawId of relatedIds) {
    if (!rawId) continue;
    const cleanId = rawId.trim();
    const cleanNum = cleanOsNumber(cleanId);

    // 1. Procura no cache em memória
    let mem =
      knownOrdersCache.get(cleanId) ||
      (cleanNum ? knownOrdersCache.get(cleanNum) : undefined) ||
      (cleanNum ? knownOrdersCache.get(`#${cleanNum}`) : undefined);

    if (mem && mem.id && !foundKeys.has(mem.id)) {
      found.push(toRelatedOrderSummary(mem));
      foundKeys.add(mem.id);
    } else if (!mem) {
      missingIds.push(cleanId);
    }
  }

  // 2. Busca identificadores ausentes no banco Supabase
  if (missingIds.length > 0) {
    try {
      // 1. Tenta buscar por ID para identificadores que não são puramente números de O.S. (UUIDs ou IDs de teste)
      const idCandidates = missingIds.filter((id) => !/^\d+$/.test(id.trim().replace(/^#+/, "")));
      const pureNumIds = missingIds.filter((id) => /^\d+$/.test(id.trim().replace(/^#+/, "")));

      if (idCandidates.length > 0) {
        try {
          const { data: idRows, error: idErr } = await supabase
            .from("orders")
            .select("id, titulo, cliente, descricao, setor, status, setor_status, arquivado, observacao")
            .in("id", idCandidates);

          if (!idErr && Array.isArray(idRows)) {
            idRows.forEach((row: any) => {
              if (!foundKeys.has(row.id)) {
                found.push(toRelatedOrderSummary(row));
                foundKeys.add(row.id);
                knownOrdersCache.set(row.id, row);
                const num = cleanOsNumber(row.titulo);
                if (num) knownOrdersCache.set(num, row);
              }
            });
          }
        } catch {
          // Continua para a busca por título
        }
      }

      // 2. Para os identificadores que não foram encontrados por ID (ex: número da O.S.)
      const stillMissing = [...pureNumIds, ...idCandidates.filter((id) => !foundKeys.has(id))];
      for (const rawNum of stillMissing) {
        const cleanNum = cleanOsNumber(rawNum) || rawNum;
        if (!cleanNum) continue;

        try {
          const { data: numRows, error: nErr } = await supabase
            .from("orders")
            .select("id, titulo, cliente, descricao, setor, status, setor_status, arquivado, observacao")
            .ilike("titulo", `%${cleanNum}%`)
            .limit(1);

          if (!nErr && Array.isArray(numRows) && numRows.length > 0) {
            const row = numRows[0];
            if (!foundKeys.has(row.id)) {
              found.push(toRelatedOrderSummary(row));
              foundKeys.add(row.id);
              knownOrdersCache.set(row.id, row);
              const num = cleanOsNumber(row.titulo);
              if (num) knownOrdersCache.set(num, row);
            }
            continue;
          }
        } catch {
          // Continua para o fallback
        }

        // Fallback resiliente: se a O.S. não foi achada no banco, monta um resumo mínimo com o número
        // para que a interface NUNCA fique em loading infinito
        const placeholderId = `os-${cleanNum}`;
        if (!foundKeys.has(placeholderId)) {
          found.push({
            id: placeholderId,
            titulo: cleanNum,
            cliente: "O.S. Vinculada",
            descricao: `O.S. #${cleanNum}`,
            setor: null,
            status: null,
            setor_status: null,
            arquivado: false,
          });
          foundKeys.add(placeholderId);
        }
      }
    } catch (err) {
      console.warn("[orderRelationsService] Erro ao buscar detalhes de ordens relacionadas:", err);
    }
  }

  // Ordena por título da O.S.
  return found.sort((a, b) =>
    (a.titulo || "").localeCompare(b.titulo || "", undefined, { numeric: true })
  );
}

/**
 * Obtém as informações resumidas de uma lista de IDs ou números de O.S. relacionadas.
 * Envolve a busca em um timeout de segurança de 3,5 segundos para NUNCA travar a UI em loop.
 */
export async function getRelatedOrdersInfo(
  relatedIds: string[],
  inMemoryOrders: Order[] = []
): Promise<RelatedOrderSummary[]> {
  const fetchPromise = getRelatedOrdersInfoInternal(relatedIds, inMemoryOrders);

  const timeoutPromise = new Promise<RelatedOrderSummary[]>((resolve) => {
    setTimeout(() => {
      resolve(
        relatedIds.map((id) => {
          const clean = cleanOsNumber(id) || id;
          return {
            id,
            titulo: clean,
            cliente: "O.S. Vinculada",
            descricao: `O.S. #${clean}`,
            setor: null,
            status: null,
            setor_status: null,
            arquivado: false,
          };
        })
      );
    }, 3500);
  });

  return Promise.race([fetchPromise, timeoutPromise]);
}

/**
 * Sincronização bidirecional resiliente de vínculos entre O.S.
 * - Atualiza o array related_order_ids e/ou a tag [VINCULO_OS: ...] em observacao em ambas as O.S.
 * - 100% resiliente: persiste imediatamente mesmo se a coluna related_order_ids ainda não tiver migration aplicada.
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

  // Carrega a ordem principal para obter observacao e título atualizados
  let currentOrder: Order | null = knownOrdersCache.get(orderId) || null;
  try {
    const { data: dbOrder } = await supabase
      .from("orders")
      .select("id, titulo, observacao")
      .eq("id", orderId)
      .maybeSingle();

    if (dbOrder) {
      currentOrder = dbOrder as any;
      if (!currentRelatedIds) {
        oldIds = getEffectiveRelatedOrders(dbOrder);
      }
    }
  } catch {
    // continua com cache
  }

  const addedIds = cleanNextIds.filter((id) => !oldIds.includes(id));
  const removedIds = oldIds.filter((id) => !cleanNextIds.includes(id));

  const mainOrderCleanTitle = cleanOsNumber(currentOrder?.titulo) || currentOrder?.titulo || orderId;

  // 1. Atualiza a ordem principal com a nova lista de relacionados em observacao
  const updatedMainObs = setObservationRelatedOrders(currentOrder?.observacao, cleanNextIds);

  const mainUpdatePayload: any = {
    observacao: updatedMainObs,
    atualizado_por: userId || null,
  };

  let { error: mainUpErr } = await (supabase.from("orders") as any)
    .update({ ...mainUpdatePayload, related_order_ids: cleanNextIds })
    .eq("id", orderId);

  if (mainUpErr && (mainUpErr.message?.includes("related_order_ids") || (mainUpErr as any).code === "42703" || (mainUpErr as any).code === "PGRST204")) {
    await (supabase.from("orders") as any).update(mainUpdatePayload).eq("id", orderId);
  }

  // Atualiza cache em memória
  if (currentOrder) {
    const updated = {
      ...currentOrder,
      observacao: updatedMainObs,
      related_order_ids: cleanNextIds,
    };
    knownOrdersCache.set(orderId, updated as Order);
    if (mainOrderCleanTitle) knownOrdersCache.set(mainOrderCleanTitle, updated as Order);
  }

  // 2. Processa adições (BIDIRECIONAL: O.S. vinculada B passa a ter A em suas relacionadas)
  for (const targetId of addedIds) {
    try {
      // Busca dados atuais da ordem B sem quebrar com coluna inexistente
      let targetRows: any[] | null = null;
      if (isUuid(targetId)) {
        const res = await supabase
          .from("orders")
          .select("id, titulo, observacao")
          .eq("id", targetId)
          .limit(1);
        targetRows = res.data;
      } else {
        const cleanNum = cleanOsNumber(targetId) || targetId;
        const res = await supabase
          .from("orders")
          .select("id, titulo, observacao")
          .ilike("titulo", `%${cleanNum}%`)
          .limit(1);
        targetRows = res.data;
      }

      const targetOrder = Array.isArray(targetRows) && targetRows.length > 0 ? targetRows[0] : null;

      if (targetOrder) {
        const existingTargetIds = getEffectiveRelatedOrders(targetOrder);
        const myIdentifier = mainOrderCleanTitle || orderId;

        if (!existingTargetIds.includes(orderId) && !existingTargetIds.includes(myIdentifier)) {
          const nextTargetIds = [...existingTargetIds, myIdentifier];
          const updatedTargetObs = setObservationRelatedOrders(targetOrder.observacao, nextTargetIds);

          const targetPayload: any = {
            observacao: updatedTargetObs,
            atualizado_por: userId || null,
          };

          let { error: targetUpErr } = await (supabase.from("orders") as any)
            .update({ ...targetPayload, related_order_ids: nextTargetIds })
            .eq("id", targetOrder.id);

          if (targetUpErr && (targetUpErr.message?.includes("related_order_ids") || (targetUpErr as any).code === "42703" || (targetUpErr as any).code === "PGRST204")) {
            await (supabase.from("orders") as any).update(targetPayload).eq("id", targetOrder.id);
          }

          // Atualiza cache
          const updatedTarget = {
            ...targetOrder,
            observacao: updatedTargetObs,
            related_order_ids: nextTargetIds,
          };
          knownOrdersCache.set(targetOrder.id, updatedTarget as Order);
          const tNum = cleanOsNumber(targetOrder.titulo);
          if (tNum) knownOrdersCache.set(tNum, updatedTarget as Order);
        }
      }
    } catch (err) {
      console.warn(`[orderRelationsService] Falha ao vincular bidirecionalmente em ${targetId}:`, err);
    }

    // Tenta registrar na tabela relacional order_relations se existir
    try {
      await supabase.from("order_relations").upsert(
        [
          { order_id: orderId, related_order_id: targetId, created_by: userId || null },
          { order_id: targetId, related_order_id: orderId, created_by: userId || null },
        ] as any,
        { onConflict: "order_id,related_order_id" }
      );
    } catch {
      // Tabela ainda sem migration
    }
  }

  // 3. Processa remoções (BIDIRECIONAL: O.S. desvinculada B remove A de suas relacionadas)
  for (const targetId of removedIds) {
    try {
      let targetRows: any[] | null = null;
      if (isUuid(targetId)) {
        const res = await supabase
          .from("orders")
          .select("id, titulo, observacao")
          .eq("id", targetId)
          .limit(1);
        targetRows = res.data;
      } else {
        const cleanNum = cleanOsNumber(targetId) || targetId;
        const res = await supabase
          .from("orders")
          .select("id, titulo, observacao")
          .ilike("titulo", `%${cleanNum}%`)
          .limit(1);
        targetRows = res.data;
      }

      const targetOrder = Array.isArray(targetRows) && targetRows.length > 0 ? targetRows[0] : null;

      if (targetOrder) {
        const existingTargetIds = getEffectiveRelatedOrders(targetOrder);
        const myIdentifier = mainOrderCleanTitle || orderId;

        const nextTargetIds = existingTargetIds.filter(
          (id) => id !== orderId && id !== myIdentifier && cleanOsNumber(id) !== mainOrderCleanTitle
        );

        if (nextTargetIds.length !== existingTargetIds.length) {
          const updatedTargetObs = setObservationRelatedOrders(targetOrder.observacao, nextTargetIds);
          const targetPayload: any = {
            observacao: updatedTargetObs,
            atualizado_por: userId || null,
          };

          let { error: targetUpErr } = await (supabase.from("orders") as any)
            .update({ ...targetPayload, related_order_ids: nextTargetIds })
            .eq("id", targetOrder.id);

          if (targetUpErr && (targetUpErr.message?.includes("related_order_ids") || (targetUpErr as any).code === "42703" || (targetUpErr as any).code === "PGRST204")) {
            await (supabase.from("orders") as any).update(targetPayload).eq("id", targetOrder.id);
          }
        }
      }
    } catch (err) {
      console.warn(`[orderRelationsService] Falha ao remover vínculo em ${targetId}:`, err);
    }

    try {
      await supabase
        .from("order_relations")
        .delete()
        .or(`and(order_id.eq.${orderId},related_order_id.eq.${targetId}),and(order_id.eq.${targetId},related_order_id.eq.${orderId})`);
    } catch {
      // Tabela ainda sem migration
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

  const cleanNum = cleanOsNumber(orderId);
  const cardElement =
    document.getElementById(`order-card-${orderId}`) ||
    (cleanNum ? (document.querySelector(`[data-order-os="${cleanNum}"]`) as HTMLElement) : null) ||
    (document.querySelector(`[data-order-id="${orderId}"]`) as HTMLElement);

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
