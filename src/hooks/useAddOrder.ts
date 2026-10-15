/**
 * Hook leve para criar ordens sem carregar todas as ordens na memória.
 * Usado em páginas de produção que não precisam do estado completo de useOrders.
 */
import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export function useAddOrder() {
  const { user } = useAuth();

  const addOrder = useCallback(
    async (data: {
      titulo: string; descricao: string; cliente: string; observacao?: string; obs_prova?: string;
      saida_direta?: boolean; prova_digital?: boolean; prova_email?: boolean;
      endereco_entrega?: string; destinatario?: string;
      urgente?: boolean; urgente_prova?: boolean; urgente_impressao?: boolean; urgente_acabamento?: boolean; urgente_expedicao?: boolean;
      digital_color?: boolean; digital_pb?: boolean; prazo?: string; vendedor?: string;
      tipo_trabalho?: string; equipamentos?: string[]; acabamentos?: string[];
      processos?: string[]; nf?: string; protocolo?: string; empresa_entrega?: string; obs_entrega?: string;
      tipo_entrega?: string[]; entrega_para?: string; entrega_endereco?: string; entrega_ac?: string; entrega_data_limite?: string;
      status_destino?: string;
      setor_destino?: string;
    }) => {
      const isUrgente = data.urgente === true;
      const sendToSetor = data.setor_destino || null;

      if (!sendToSetor && isUrgente) {
        const { data: existingOrders } = await supabase
          .from("orders")
          .select("id, posicao")
          .eq("status", "fila_de_entrada")
          .eq("arquivado", false)
          .order("posicao", { ascending: true });

        if (existingOrders && existingOrders.length > 0) {
          await Promise.all(
            existingOrders.map((o: any) =>
              supabase.from("orders").update({ posicao: o.posicao + 1 }).eq("id", o.id)
            )
          );
        }
      }

      const newPos = sendToSetor
        ? (isUrgente
            ? 0
            : await (async () => {
                const { data: maxData } = await supabase
                  .from("orders")
                  .select("posicao")
                  .eq("setor", sendToSetor)
                  .eq("setor_status", "entrada")
                  .eq("arquivado", false)
                  .order("posicao", { ascending: false })
                  .limit(1);
                return maxData && maxData.length > 0 ? (maxData[0] as any).posicao + 1 : 0;
              })())
        : isUrgente
        ? 0
        : await (async () => {
            const { data: maxData } = await supabase
              .from("orders")
              .select("posicao")
              .eq("status", "fila_de_entrada")
              .eq("arquivado", false)
              .order("posicao", { ascending: false })
              .limit(1);
            return maxData && maxData.length > 0 ? (maxData[0] as any).posicao + 1 : 0;
          })();


      const targetStatus = data.status_destino || "fila_de_entrada";

      const { data: created, error } = await supabase
        .from("orders")
        .insert({
          titulo: data.titulo,
          descricao: data.descricao,
          cliente: data.cliente,
          observacao: data.observacao || null,
          obs_prova: data.obs_prova || null,
          saida_direta: data.saida_direta || false,
          prova_digital: data.prova_digital || false,
          prova_email: data.prova_email || false,
          prioridade: data.urgente ? "alta" : "normal",
          urgente: data.urgente || false,
          urgente_prova: data.urgente_prova || false,
          urgente_impressao: data.urgente_impressao || false,
          urgente_acabamento: data.urgente_acabamento || false,
          urgente_expedicao: data.urgente_expedicao || false,
          digital_color: data.digital_color || false,
          digital_pb: data.digital_pb || false,
          prazo: data.prazo || null,
          endereco_entrega: data.endereco_entrega || null,
          destinatario: data.destinatario || null,
          criado_por: user?.id || null,
          atualizado_por: user?.id || null,
          posicao: newPos,
          status: targetStatus,
          setor: sendToSetor,
          setor_status: sendToSetor ? "entrada" : null,
          vendedor: data.vendedor || null,
          tipo_trabalho: data.tipo_trabalho || null,
          equipamentos: data.equipamentos || [],
          acabamentos: data.acabamentos || [],
          processos: data.processos || [],
          nf: data.nf || null,
          protocolo: data.protocolo || null,
          empresa_entrega: data.empresa_entrega || null,
          obs_entrega: data.obs_entrega || null,
          tipo_entrega: data.tipo_entrega || [],
          entrega_para: data.entrega_para || null,
          entrega_endereco: data.entrega_endereco || null,
          entrega_ac: data.entrega_ac || null,
          entrega_data_limite: data.entrega_data_limite || null,
        } as any)
        .select()
        .single();

      if (error) {
        toast.error("Erro ao criar OS.");
        console.error(error);
        return null;
      }
      return created as any;
    },
    [user]
  );

  return { addOrder };
}
