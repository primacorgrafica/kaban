import { supabase } from "@/integrations/supabase/client";
import type { DeliveryStatus, Entregador, EntregadorPosicao } from "@/types/delivery";

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

    return { data: (data as unknown as Entregador[]) || [], error: null };
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
