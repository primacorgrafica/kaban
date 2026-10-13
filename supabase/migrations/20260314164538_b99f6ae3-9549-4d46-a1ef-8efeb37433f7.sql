
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS processos text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS nf text,
  ADD COLUMN IF NOT EXISTS protocolo text,
  ADD COLUMN IF NOT EXISTS empresa_entrega text,
  ADD COLUMN IF NOT EXISTS obs_entrega text;

-- Update the updated_at trigger to include new fields
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (TG_OP = 'UPDATE' AND 
      OLD.status IS NOT DISTINCT FROM NEW.status AND
      OLD.titulo IS NOT DISTINCT FROM NEW.titulo AND
      OLD.descricao IS NOT DISTINCT FROM NEW.descricao AND
      OLD.cliente IS NOT DISTINCT FROM NEW.cliente AND
      OLD.observacao IS NOT DISTINCT FROM NEW.observacao AND
      OLD.setor IS NOT DISTINCT FROM NEW.setor AND
      OLD.setor_status IS NOT DISTINCT FROM NEW.setor_status AND
      OLD.maquina IS NOT DISTINCT FROM NEW.maquina AND
      OLD.arquivado IS NOT DISTINCT FROM NEW.arquivado AND
      OLD.atualizado_por IS NOT DISTINCT FROM NEW.atualizado_por AND
      OLD.urgente IS NOT DISTINCT FROM NEW.urgente AND
      OLD.prazo IS NOT DISTINCT FROM NEW.prazo AND
      OLD.pausado IS NOT DISTINCT FROM NEW.pausado AND
      OLD.saida_direta IS NOT DISTINCT FROM NEW.saida_direta AND
      OLD.prova_digital IS NOT DISTINCT FROM NEW.prova_digital AND
      OLD.prova_email IS NOT DISTINCT FROM NEW.prova_email AND
      OLD.vendedor IS NOT DISTINCT FROM NEW.vendedor AND
      OLD.processos IS NOT DISTINCT FROM NEW.processos AND
      OLD.endereco_entrega IS NOT DISTINCT FROM NEW.endereco_entrega AND
      OLD.destinatario IS NOT DISTINCT FROM NEW.destinatario AND
      OLD.entregue_para IS NOT DISTINCT FROM NEW.entregue_para AND
      OLD.entregue_em IS NOT DISTINCT FROM NEW.entregue_em AND
      OLD.nf IS NOT DISTINCT FROM NEW.nf AND
      OLD.protocolo IS NOT DISTINCT FROM NEW.protocolo AND
      OLD.empresa_entrega IS NOT DISTINCT FROM NEW.empresa_entrega AND
      OLD.obs_entrega IS NOT DISTINCT FROM NEW.obs_entrega
  ) THEN
    NEW.updated_at = OLD.updated_at;
    RETURN NEW;
  END IF;
  
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
