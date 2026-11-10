import { supabase } from "@/integrations/supabase/client";
import type {
  DeliveryStatus,
  Entregador,
  EntregadorPosicao,
  RotaId,
  MotivoPausaRota,
} from "@/types/delivery";

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
 */
export async function saveEntregador(
  entregador: Partial<Entregador> & { user_id: string; nome_completo: string }
): Promise<{ success: boolean; data?: Entregador; error?: string }> {
  try {
    const payload: Record<string, any> = {
      user_id: entregador.user_id,
      nome_completo: entregador.nome_completo.trim(),
      sobrenome: entregador.sobrenome?.trim() || null,
      telefone: entregador.telefone?.trim() || null,
      placa_veiculo: entregador.placa_veiculo?.trim()?.toUpperCase() || null,
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

    const { data, error } = await supabase
      .from("entregadores" as any)
      .upsert(payload, { onConflict: "user_id" })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data as unknown as Entregador };
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao salvar cadastro do entregador." };
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
 * Exclui permanentemente o cadastro de um entregador (apenas admin e coordenadores)
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
