import { supabase } from "@/integrations/supabase/client";
import { Order } from "@/types/order";
import { hasSpecialSuppliesForCompras, setComprasStatusInProcessos } from "@/lib/processos";
import { cleanOsNumber } from "@/lib/orderRelationsService";

export interface SyncComprasOptions {
  customProcessos?: string[];
  userId?: string | null;
}

// Mutex em memória para evitar inserções concorrentes simultâneas da mesma O.S.
const inFlightSyncs = new Map<string, Promise<string | null>>();

/**
 * Propaga a alteração de etapa/status de uma ordem no setor de Compras
 * diretamente para a O.S. pai correspondente.
 */
export async function syncComprasStatusToParent(
  parentOrderId: string,
  newStatus: string,
  userId?: string | null
): Promise<void> {
  if (!parentOrderId) return;
  try {
    const { data } = await supabase
      .from("orders")
      .select("processos")
      .eq("id", parentOrderId)
      .limit(1);

    const parent = Array.isArray(data) ? data[0] : (data as any);

    if (parent) {
      let procs = parent.processos || [];
      procs = setComprasStatusInProcessos(procs, newStatus);

      if (newStatus === "lancamento_ge" || newStatus === "saida") {
        if (!procs.some((p: string) => p.startsWith("COMPRADO"))) {
          procs.push(`COMPRADO:${Date.now()}:Compras`);
        }
      } else if (["entrada", "cotacao", "pedido"].includes(newStatus)) {
        procs = procs.filter((p: string) => !p.startsWith("COMPRADO") && !p.startsWith("COMPRA:ok"));
      }

      await supabase
        .from("orders")
        .update({
          processos: procs,
          atualizado_por: userId || null,
        })
        .eq("id", parentOrderId);
    }
  } catch (err) {
    console.error("[syncComprasStatusToParent] Falha ao sincronizar status de compras com OS pai:", err);
  }
}

/**
 * Garante que uma Ordem de Serviço com PANTONE ou OUTROS habilitados
 * tenha imediatamente um card ativo correspondente no setor de Compras.
 * Possui proteção estrita antiduplicação por ID e número da O.S. (titulo).
 */
export async function syncOrderToCompras(
  order: Partial<Order> & { id: string },
  options?: SyncComprasOptions
): Promise<string | null> {
  if (!order || !order.id) return null;

  // 1. Se já for do setor compras, não cria duplicata de si mesma
  if (order.setor === "compras") return order.id;

  const effectiveProcessos = options?.customProcessos || order.processos || [];

  // 2. Regra estrita: Ela só chegará em COMPRAS quando HOUVER habilitado ou PANTONE ou OUTROS
  if (!hasSpecialSuppliesForCompras(effectiveProcessos)) {
    return null;
  }

  const cleanOs = order.titulo ? cleanOsNumber(order.titulo) : "";
  const syncKey = cleanOs || order.id;

  // Se já há um sync ativo em trânsito para esta mesma O.S., aguarda a promessa já existente
  if (inFlightSyncs.has(syncKey)) {
    return inFlightSyncs.get(syncKey)!;
  }

  const syncPromise = (async () => {
    try {
      // 3. Verificar se já existe uma cópia ativa desta OS em compras para não duplicar
      // Primeiro busca por parent_order_id
      let { data: existing, error: fetchErr } = await supabase
        .from("orders")
        .select("id, processos, setor_status, parent_order_id, titulo")
        .eq("setor", "compras")
        .eq("parent_order_id", order.id)
        .eq("arquivado", false)
        .limit(1);

      if (fetchErr) {
        console.error("[syncOrderToCompras] Erro ao verificar existência em compras:", fetchErr);
      }

      // Se não achou por parent_order_id, busca pelo número da O.S. (titulo) para prevenir duplicata de mesma O.S.
      if ((!existing || existing.length === 0) && cleanOs) {
        const { data: byTitle, error: titleErr } = await supabase
          .from("orders")
          .select("id, processos, setor_status, parent_order_id, titulo")
          .eq("setor", "compras")
          .eq("titulo", cleanOs)
          .eq("arquivado", false)
          .limit(1);

        if (!titleErr && byTitle && byTitle.length > 0) {
          existing = byTitle;
        }
      }

      if (existing && existing.length > 0) {
        const existingCard = existing[0];
        const existingId = existingCard.id;
        const updates: any = {};

        // Se o vínculo parent_order_id foi explicitamente perdido (null), restaura
        if (existingCard.parent_order_id === null && order.id) {
          updates.parent_order_id = order.id;
        }

        // Se os processos mudaram, sincroniza com o card de compras existente
        if (options?.customProcessos && JSON.stringify(existingCard.processos) !== JSON.stringify(options.customProcessos)) {
          updates.processos = options.customProcessos;
        }

        if (Object.keys(updates).length > 0) {
          await supabase.from("orders").update(updates).eq("id", existingId);
        }
        return existingId;
      }

      // 4. Montar payload do novo card para o setor de compras
      const insertPayload: any = {
        titulo: order.titulo,
        descricao: order.descricao,
        cliente: order.cliente,
        observacao: order.observacao || null,
        status: "fila_de_entrada",
        setor: "compras",
        setor_status: "entrada",
        categoria_compra: "os",
        parent_order_id: order.id,
        posicao: order.urgente ? 0 : 9999,
        saida_direta: order.saida_direta || false,
        prova_digital: order.prova_digital || false,
        prova_email: order.prova_email || false,
        prioridade: order.prioridade || "normal",
        urgente: order.urgente || false,
        prazo: order.prazo || null,
        vendedor: order.vendedor || null,
        tipo_trabalho: order.tipo_trabalho || null,
        equipamentos: order.equipamentos || [],
        acabamentos: order.acabamentos || [],
        processos: effectiveProcessos,
        nf: order.nf || null,
        protocolo: order.protocolo || null,
        empresa_entrega: order.empresa_entrega || null,
        obs_entrega: order.obs_entrega || null,
        endereco_entrega: order.endereco_entrega || null,
        destinatario: order.destinatario || null,
        tipo_entrega: order.tipo_entrega || [],
        entrega_para: order.entrega_para || null,
        entrega_endereco: order.entrega_endereco || null,
        entrega_ac: order.entrega_ac || null,
        entrega_data_limite: order.entrega_data_limite || null,
        criado_por: order.criado_por || options?.userId || null,
        atualizado_por: options?.userId || null,
      };

      let { data: created, error } = await supabase
        .from("orders")
        .insert(insertPayload)
        .select("id");

      if (error && (error.message?.includes("os_anterior") || (error as any).code === "42703" || (error as any).code === "PGRST204")) {
        delete insertPayload.os_anterior;
        const retry = await supabase.from("orders").insert(insertPayload).select("id");
        created = retry.data;
        error = retry.error;
      }

      if (error && (error.message?.includes("revisao") || (error as any).code === "42703" || (error as any).code === "PGRST204")) {
        delete insertPayload.revisao;
        const retry = await supabase.from("orders").insert(insertPayload).select("id");
        created = retry.data;
        error = retry.error;
      }

      if (error) {
        // Se falhou por duplicata no banco de dados (trigger/índice), busca o card existente com segurança
        if (error.message?.includes("Já existe") || error.message?.includes("duplicate") || (error as any).code === "23505") {
          console.warn(`[syncOrderToCompras] O.S. #${order.titulo} já existe em compras (concorrência evitada pelo banco).`);
          const { data: recov } = await supabase
            .from("orders")
            .select("id")
            .eq("setor", "compras")
            .eq("arquivado", false)
            .or(`parent_order_id.eq.${order.id},titulo.eq.${order.titulo}`)
            .limit(1);
          return recov?.[0]?.id || null;
        }
        console.error("[syncOrderToCompras] Erro ao criar card em compras:", error);
        return null;
      }

      // 5. Garante que a OS pai tenha a tag de status inicial de compras ("entrada")
      void syncComprasStatusToParent(order.id, "entrada", options?.userId);

      return created?.[0]?.id || null;
    } finally {
      inFlightSyncs.delete(syncKey);
    }
  })();

  inFlightSyncs.set(syncKey, syncPromise);
  return syncPromise;
}
