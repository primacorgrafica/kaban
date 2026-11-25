import { supabase } from "@/integrations/supabase/client";
import {
  isValidBrazilianPlate,
  normalizeBrazilianPlate,
  type DeliveryStatus,
  type Entregador,
  type EntregadorPosicao,
  type RotaId,
  type MotivoPausaRota,
  type MergeOrdersPayload,
  validateSameClientForMerge,
} from "@/types/delivery";
import type { Order } from "@/types/order";

export interface DeliveryRpcResponse {
  success: boolean;
  order_id?: string;
  status_entrega?: DeliveryStatus;
  entregador_id?: string | null;
  error?: string;
}

/**
 * Busca lista de entregadores cadastrados (para gestores e coordenadores)
 */
export async function getEntregadoresList(): Promise<{ data: Entregador[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from("entregadores" as any)
      .select("*")
      .order("nome_completo", { ascending: true });

    if (error) {
      // Se a tabela ainda não foi criada, retorna array vazio sem quebrar a tela
      if (error.code === "42P01" || error.message?.includes("does not exist")) {
        console.warn("[deliveryService] Tabela 'entregadores' ainda não aplicada no Supabase.");
        return { data: [], error: "Tabela 'entregadores' não implantada." };
      }

      // Se a RLS restringir documento_identificacao a gestores da Expedição, tenta a view pública segura
      if (error.code === "42501" || error.message?.toLowerCase().includes("permission denied")) {
        const pubRes = await supabase
          .from("entregadores_public" as any)
          .select("*")
          .order("nome_completo", { ascending: true });
        if (!pubRes.error && pubRes.data) {
          return { data: (pubRes.data as unknown as Entregador[]) || [], error: null };
        }
      }

      return { data: [], error: error.message };
    }

    const drivers = (data as unknown as Entregador[]) || [];

    // Purga automática de registros residuais de teste (ex.: 'FULANO')
    const fulanos = drivers.filter(
      (d) => d.nome_completo?.trim().toUpperCase() === "FULANO"
    );
    if (fulanos.length > 0) {
      for (const f of fulanos) {
        supabase
          .from("entregadores" as any)
          .delete()
          .eq("id", f.id)
          .then(() => {
            console.log(`[deliveryService] Registro residual de teste '${f.nome_completo}' purgado com sucesso.`);
          })
          .catch(() => {});
      }
      return {
        data: drivers.filter((d) => d.nome_completo?.trim().toUpperCase() !== "FULANO"),
        error: null,
      };
    }

    return { data: drivers, error: null };
  } catch (err: any) {
    return { data: [], error: err.message || "Erro inesperado ao buscar entregadores." };
  }
}

/**
 * Atribui ou desatribui um motoboy a uma O.S. via RPC segura com locking FOR UPDATE
 */
export async function assignDriverToOrder(
  orderId: string,
  entregadorId: string | null,
  ordemParada?: number | null
): Promise<DeliveryRpcResponse> {
  try {
    const { data, error } = await supabase.rpc("manager_assign_delivery_driver" as any, {
      p_order_id: orderId,
      p_entregador_id: entregadorId,
      p_ordem_parada: ordemParada ?? null,
    });

    if (error) {
      if (error.message?.includes("Could not find the function") || error.code === "42883") {
        return {
          success: false,
          error: "RPC manager_assign_delivery_driver ainda não implantada no Supabase. Execute a migration 05 em homologação.",
        };
      }
      return { success: false, error: error.message };
    }

    return (data as DeliveryRpcResponse) || { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Erro inesperado ao atribuir entregador." };
  }
}

/**
 * Atualiza o status logístico da entrega executando a máquina de estados no PostgreSQL
 */
export async function updateDriverDeliveryStatus(params: {
  orderId: string;
  newStatus: DeliveryStatus;
  entreguePara?: string;
  obsEntrega?: string;
  motivoInsucesso?: string;
}): Promise<DeliveryRpcResponse> {
  try {
    const { data, error } = await supabase.rpc("driver_update_delivery_status" as any, {
      p_order_id: params.orderId,
      p_new_status: params.newStatus,
      p_entregue_para: params.entreguePara?.trim() || null,
      p_obs_entrega: params.obsEntrega?.trim() || null,
      p_motivo_insucesso: params.motivoInsucesso?.trim() || null,
    });

    if (error) {
      if (error.message?.includes("Could not find the function") || error.code === "42883") {
        return {
          success: false,
          error: "RPC driver_update_delivery_status ainda não implantada no Supabase. Execute a migration 05 em homologação.",
        };
      }
      return { success: false, error: error.message };
    }

    return (data as DeliveryRpcResponse) || { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Erro inesperado ao atualizar status de entrega." };
  }
}

/**
 * Realiza o upload do comprovante de entrega para o bucket privado 'comprovantes-entrega'
 */
export async function uploadDeliveryProofFile(
  orderId: string,
  file: File
): Promise<{ success: boolean; filePath?: string; error?: string }> {
  try {
    const allowedExts = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];
    const fileExt = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();

    if (!allowedExts.includes(fileExt)) {
      return {
        success: false,
        error: "Formato de arquivo inválido. Permitidos: JPG, PNG, WEBP ou PDF.",
      };
    }

    if (file.size > 10 * 1024 * 1024) {
      return {
        success: false,
        error: "Arquivo excede o limite máximo permitido de 10 MB.",
      };
    }

    // Sanitiza nome do arquivo
    const cleanFileName = file.name
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/_+/g, "_");
    const timestamp = Date.now();
    const filePath = `${orderId}/${timestamp}_${cleanFileName}`;

    const { data, error } = await supabase.storage
      .from("comprovantes-entrega")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, filePath: data.path };
  } catch (err: any) {
    return { success: false, error: err.message || "Erro no envio do comprovante." };
  }
}

/**
 * Registra um ponto de telemetria GPS para auditoria e checkpoint
 */
export async function recordGpsCheckpoint(params: {
  orderId?: string;
  latitude: number;
  longitude: number;
  precisaoMetros?: number | null;
  velocidadeKmh?: number | null;
  bateriaPercentual?: number | null;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      return { success: false, error: "Usuário não autenticado." };
    }

    const { error } = await supabase.from("entregador_posicoes" as any).insert({
      entregador_id: authData.user.id,
      order_id: params.orderId || null,
      latitude: params.latitude,
      longitude: params.longitude,
      precisao_metros: params.precisaoMetros ?? null,
      velocidade_kmh: params.velocidadeKmh ?? null,
      bateria_percentual: params.bateriaPercentual ?? null,
    });

    if (error) {
      if (error.code === "42P01") {
        // Tabela ainda não migrada
        return { success: false, error: "Tabela de telemetria não implantada." };
      }
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao registrar coordenadas GPS." };
  }
}

/**
 * Atribui uma ou mais O.S. a uma Rota (1 a 6 ou RETIRA) e opcionalmente a um entregador
 */
export async function assignOrderToRoute(
  orderIds: string | string[],
  rotaNumero: RotaId | null,
  entregadorId?: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const ids = Array.isArray(orderIds) ? orderIds : [orderIds];
    if (ids.length === 0) return { success: true };

    const updatePayload: Record<string, any> = {
      rota_numero: rotaNumero,
    };

    if (entregadorId !== undefined) {
      updatePayload.entregador_id = entregadorId;
      if (entregadorId) {
        updatePayload.status_entrega = "atribuido";
      }
    }

    const { error } = await supabase
      .from("orders")
      .update(updatePayload)
      .in("id", ids);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao atribuir rota." };
  }
}

/**
 * Reordena sequencialmente as paradas de uma rota (1ª parada, 2ª parada, 3ª parada...)
 */
export async function reorderRouteStops(
  rotaNumero: RotaId,
  orderedOrderIds: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    if (orderedOrderIds.length === 0) return { success: true };

    const updates = orderedOrderIds.map((id, index) =>
      supabase
        .from("orders")
        .update({
          rota_numero: rotaNumero,
          rota_sequencia: index + 1,
          ordem_parada: index + 1,
        })
        .eq("id", id)
    );

    const results = await Promise.all(updates);
    const firstError = results.find((r) => r.error);
    if (firstError?.error) {
      return { success: false, error: firstError.error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao reordenar paradas." };
  }
}

/**
 * Pausa ou retoma uma rota ou parada com registro de motivo padronizado
 */
export async function toggleRoutePause(params: {
  orderIds: string | string[];
  paused: boolean;
  motivo?: MotivoPausaRota | null;
  obs?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const ids = Array.isArray(params.orderIds) ? params.orderIds : [params.orderIds];
    if (ids.length === 0) return { success: true };

    const updatePayload: Record<string, any> = {
      rota_pausada: params.paused,
      rota_pausa_motivo: params.paused ? params.motivo || "outro" : null,
      rota_pausa_obs: params.paused ? params.obs?.trim() || null : null,
      rota_pausa_em: params.paused ? new Date().toISOString() : null,
    };

    const { error } = await supabase
      .from("orders")
      .update(updatePayload)
      .in("id", ids);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao atualizar pausa da rota." };
  }
}

/**
 * Alterna prioridade/urgência de entrega de uma O.S.
 */
export async function toggleDeliveryPriority(
  orderId: string,
  priority: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from("orders")
      .update({ rota_prioridade: priority })
      .eq("id", orderId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao alternar prioridade da entrega." };
  }
}

/**
 * Agrupa múltiplas O.S. do mesmo cliente numa única parada física
 */
export async function groupOrdersInStop(
  orderIds: string[]
): Promise<{ success: boolean; paradaId?: string; error?: string }> {
  try {
    if (orderIds.length <= 1) return { success: true };
    const paradaId = crypto.randomUUID();

    const { error } = await supabase
      .from("orders")
      .update({ parada_agrupada_id: paradaId })
      .in("id", orderIds);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, paradaId };
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao agrupar entregas." };
  }
}

/**
 * Desvincula uma O.S. de uma parada agrupada
 */
export async function ungroupOrderFromStop(
  orderId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from("orders")
      .update({ parada_agrupada_id: null })
      .eq("id", orderId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao desagrupar entrega." };
  }
}

/**
 * Salva ou atualiza cadastro completo de um entregador (Carro/Moto, CNH/Doc, etc.)
 * Suporta cadastro avulso (user_id = null) antes da criação do login do app (Fase 5).
 */
export async function saveEntregador(
  entregador: Partial<Entregador> & { user_id?: string | null; nome_completo: string }
): Promise<{ success: boolean; data?: Entregador; error?: string }> {
  try {
    const rawPlate = entregador.placa_veiculo?.trim() || "";
    if (rawPlate && !isValidBrazilianPlate(rawPlate)) {
      return {
        success: false,
        error: "Placa inválida. Use o formato brasileiro antigo (ABC-1234) ou Mercosul (ABC1D23).",
      };
    }

    const normalizedPlate = rawPlate ? normalizeBrazilianPlate(rawPlate) : null;

    const payload: Record<string, any> = {
      user_id: entregador.user_id || null,
      nome_completo: entregador.nome_completo.trim(),
      sobrenome: entregador.sobrenome?.trim() || null,
      telefone: entregador.telefone?.trim() || null,
      placa_veiculo: normalizedPlate,
      modelo_veiculo: entregador.modelo_veiculo?.trim() || null,
      documento_identificacao: entregador.documento_identificacao?.trim() || null,
      categoria_veiculo: entregador.categoria_veiculo || "moto",
      observacoes: entregador.observacoes?.trim() || null,
      ativo: entregador.ativo ?? true,
      updated_at: new Date().toISOString(),
    };

    if (entregador.rota_atribuida !== undefined) {
      payload.rota_atribuida = entregador.rota_atribuida;
    }

    let query: any;
    if (entregador.id) {
      query = supabase
        .from("entregadores" as any)
        .update(payload)
        .eq("id", entregador.id)
        .select()
        .single();
    } else if (payload.user_id) {
      query = supabase
        .from("entregadores" as any)
        .upsert(payload, { onConflict: "user_id" })
        .select()
        .single();
    } else {
      query = supabase
        .from("entregadores" as any)
        .insert(payload)
        .select()
        .single();
    }

    const { data, error } = await query;

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data as unknown as Entregador };
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao salvar cadastro do entregador." };
  }
}

/**
 * Inativa logicamente um entregador (exclusão lógica):
 * Remove das seleções de novas rotas e libera sua rota atual,
 * preservando integralmente o nome no histórico de rotas/entregas.
 */
export async function inactivateEntregador(
  entregadorId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from("entregadores" as any)
      .update({
        ativo: false,
        rota_atribuida: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", entregadorId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao inativar entregador." };
  }
}

/**
 * Ativa ou desativa um entregador preservando todo o histórico de entregas
 */
export async function toggleEntregadorAtivo(
  entregadorId: string,
  ativo: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from("entregadores" as any)
      .update({ ativo, updated_at: new Date().toISOString() })
      .eq("id", entregadorId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao alterar status do entregador." };
  }
}

/**
 * @deprecated Preferir inactivateEntregador() para preservar histórico de rotas.
 * Mantido apenas para compatibilidade legada/administrativa.
 */
export async function deleteEntregador(
  entregadorId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Desvincula o entregador de quaisquer ordens em andamento para não quebrar integridade
    await supabase
      .from("orders")
      .update({ entregador_id: null })
      .eq("entregador_id", entregadorId);

    // 2. Remove o registro da tabela entregadores
    const { error } = await supabase
      .from("entregadores" as any)
      .delete()
      .eq("id", entregadorId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao excluir entregador." };
  }
}

/**
 * Atualiza a região/localidade de uma entrega (ajuste manual na Gestão de Entregas).
 */
export async function updateDeliveryRegion(
  orderId: string,
  regionData: {
    regional_id: string | null;
    localidade_id: string | null;
    regiao: string | null;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await (supabase.from("orders") as any)
      .update({
        regional_id: regionData.regional_id,
        localidade_id: regionData.localidade_id,
        regiao: regionData.regiao,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Erro ao atualizar região da entrega." };
  }
}

/**
 * Atualiza o tipo de veículo da entrega (Carro ou Moto).
 */
export async function updateDeliveryVehicleType(
  orderId: string,
  tipoVeiculo: "carro" | "moto"
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await (supabase.from("orders") as any)
      .update({
        tipo_veiculo_entrega: tipoVeiculo,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Erro ao atualizar tipo de veículo." };
  }
}

// =====================================================================================
// FASE 3: FUSÃO DE O.S. DO MESMO CLIENTE & INCLUSÃO AUTOMÁTICA
// =====================================================================================

/**
 * Funde múltiplas O.S. do MESMO cliente em uma única entrega física (parada).
 * Aplica os dados unificados (endereço escolhido, data limite escolhida, tipo de veículo).
 */
export async function mergeOrdersForDelivery(
  payload: MergeOrdersPayload
): Promise<{ success: boolean; paradaId?: string; error?: string }> {
  try {
    if (!payload.orderIds || payload.orderIds.length < 2) {
      return { success: false, error: "Selecione ao menos 2 Ordens de Serviço para fundir." };
    }

    // 1. Tenta executar via RPC atômica no banco de dados
    const paradaId = payload.paradaId || crypto.randomUUID();
    const { data: rpcData, error: rpcError } = await (supabase.rpc as any)(
      "merge_orders_for_delivery",
      {
        p_order_ids: payload.orderIds,
        p_chosen_address: payload.chosenAddress,
        p_chosen_date: payload.chosenDate ? new Date(payload.chosenDate).toISOString() : null,
        p_chosen_vehicle: payload.chosenVehicle || "moto",
        p_parada_id: paradaId,
      }
    );

    if (!rpcError && rpcData && (rpcData as any)?.success) {
      return { success: true, paradaId: (rpcData as any).parada_id || paradaId };
    }

    // 2. Fallback transacional direto no cliente (caso a RPC ainda não tenha sido aplicada no Supabase)
    const updatePayload: Record<string, any> = {
      parada_agrupada_id: paradaId,
      entrega_endereco: payload.chosenAddress || null,
      tipo_veiculo_entrega: payload.chosenVehicle || "moto",
      updated_at: new Date().toISOString(),
    };

    if (payload.chosenDate) {
      updatePayload.entrega_data_limite = new Date(payload.chosenDate).toISOString();
    }
    if (payload.regionalId) {
      updatePayload.regional_id = payload.regionalId;
    }
    if (payload.localidadeId) {
      updatePayload.localidade_id = payload.localidadeId;
    }
    if (payload.regionalNome) {
      updatePayload.regiao = payload.regionalNome;
    }

    const { error: updateError } = await (supabase.from("orders") as any)
      .update(updatePayload)
      .in("id", payload.orderIds);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    return { success: true, paradaId };
  } catch (err: any) {
    return { success: false, error: err?.message || "Erro inesperado ao fundir ordens de serviço." };
  }
}

/**
 * Desfaz a fusão de ordens de serviço de uma parada agrupada.
 * Regra obrigatória: Apenas permitido enquanto a entrega NÃO estiver atribuída a uma rota.
 */
export async function unmergeOrdersFromDelivery(
  paradaId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!paradaId) {
      return { success: false, error: "Identificador de parada inválido." };
    }

    // 1. Tenta executar via RPC segura
    const { data: rpcData, error: rpcError } = await (supabase.rpc as any)(
      "unmerge_orders_from_delivery",
      { p_parada_id: paradaId }
    );

    if (!rpcError && rpcData && (rpcData as any)?.success) {
      return { success: true };
    }

    if (rpcError && rpcError.message?.includes("já está atribuída a uma rota")) {
      return { success: false, error: rpcError.message };
    }

    // 2. Fallback client-side com verificação de rota ativa
    const { data: ordersInGroup, error: fetchErr } = await (supabase.from("orders") as any)
      .select("id, rota_numero")
      .eq("parada_agrupada_id", paradaId);

    if (fetchErr) {
      return { success: false, error: fetchErr.message };
    }

    const hasActiveRoute = (ordersInGroup || []).some(
      (o: any) => Boolean(o.rota_numero && o.rota_numero.trim())
    );

    if (hasActiveRoute) {
      return {
        success: false,
        error: "Não é possível desfazer a fusão de uma entrega já atribuída a uma rota. Remova a entrega da rota antes de desfazer.",
      };
    }

    const { error: clearError } = await (supabase.from("orders") as any)
      .update({
        parada_agrupada_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("parada_agrupada_id", paradaId);

    if (clearError) {
      return { success: false, error: clearError.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Erro ao desfazer fusão." };
  }
}

/**
 * Garante a criação ou sincronização automática da entrega de Prova Digital quando a O.S. vai para 'Aguardando aprovação'.
 * - Prefixo 'P' no número da O.S. (ex.: P73736)
 * - Veículo AUTOMATICAMENTE Moto
 * - Idempotente: nunca duplica entregas para a mesma O.S.
 */
export async function ensureDigitalProofDelivery(
  parentOrder: {
    id: string;
    titulo: string;
    cliente: string;
    descricao?: string | null;
    vendedor?: string | null;
    endereco_entrega?: string | null;
    entrega_endereco?: string | null;
    destinatario?: string | null;
    prova_digital?: boolean;
    criado_por?: string | null;
  },
  userId?: string | null
): Promise<{ success: boolean; proofOrderId?: string; error?: string }> {
  try {
    if (!parentOrder.prova_digital) return { success: true };

    const cleanTitle = (parentOrder.titulo || "").replace(/^[Pp]/, "").trim();
    const proofTitle = `P${cleanTitle}`;
    const proofAddress =
      (parentOrder.endereco_entrega || "").trim() ||
      (parentOrder.entrega_endereco || "").trim() ||
      (parentOrder.destinatario || "").trim() ||
      null;

    // 1. Verifica se já existe entrega ativa para esta prova vinculada a esta OS pai
    const { data: existing, error: checkError } = await (supabase.from("orders") as any)
      .select("id, titulo, entrega_endereco")
      .eq("parent_order_id", parentOrder.id)
      .eq("arquivado", false)
      .limit(1);

    if (!checkError && existing && existing.length > 0) {
      const existingProof = existing[0];
      // Já existe: atualiza endereço se mudou, garantindo idempotência absoluta
      if (proofAddress && existingProof.entrega_endereco !== proofAddress) {
        await (supabase.from("orders") as any)
          .update({
            entrega_endereco: proofAddress,
            atualizado_por: userId || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingProof.id);
      }
      return { success: true, proofOrderId: existingProof.id };
    }

    // 2. Insere nova demanda de entrega da Prova Digital
    const payload = {
      titulo: proofTitle,
      cliente: parentOrder.cliente,
      descricao: parentOrder.descricao
        ? `Prova Digital - ${parentOrder.descricao}`
        : "Prova Digital",
      vendedor: parentOrder.vendedor || null,
      entrega_endereco: proofAddress,
      destinatario: parentOrder.destinatario || null,
      tipo_veiculo_entrega: "moto", // Obrigatoriamente Moto
      status_entrega: "pendente", // Aguardando atribuição
      tipo_entrega: ["prova_digital", "moto"],
      parent_order_id: parentOrder.id,
      is_prova_entrega: true,
      prova_digital: true,
      setor: "expedicao",
      setor_status: "entrada",
      status: "arquivo_liberado",
      arquivado: false,
      posicao: 9999,
      criado_por: parentOrder.criado_por || userId || null,
      atualizado_por: userId || null,
    };

    const { data: inserted, error: insertError } = await (supabase.from("orders") as any)
      .insert(payload)
      .select("id")
      .single();

    if (insertError) {
      console.warn("[deliveryService] Aviso ao criar entrega de prova digital:", insertError.message);
      return { success: false, error: insertError.message };
    }

    return { success: true, proofOrderId: inserted?.id };
  } catch (err: any) {
    return { success: false, error: err?.message || "Erro ao gerar entrega de prova digital." };
  }
}

/**
 * Garante que uma O.S. que acabou de ir para a PRODUÇÃO possua os atributos iniciais de entrega
 * configurados na Expedição (status_entrega: 'pendente', tipo de veículo), sem criar duplicatas.
 */
export async function ensureProductionOrderDelivery(
  order: {
    id: string;
    titulo: string;
    status_entrega?: string | null;
    tipo_veiculo_entrega?: string | null;
  },
  userId?: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const updates: Record<string, any> = {};

    if (!order.status_entrega) {
      updates.status_entrega = "pendente";
    }
    if (!order.tipo_veiculo_entrega) {
      updates.tipo_veiculo_entrega = "moto";
    }

    if (Object.keys(updates).length > 0) {
      updates.atualizado_por = userId || null;
      updates.updated_at = new Date().toISOString();

      await (supabase.from("orders") as any)
        .update(updates)
        .eq("id", order.id);
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Erro ao inicializar entrega de produção." };
  }
}


