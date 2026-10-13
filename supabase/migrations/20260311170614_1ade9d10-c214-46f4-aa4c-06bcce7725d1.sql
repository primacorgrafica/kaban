
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only update updated_at when meaningful fields change, not just posicao
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
      OLD.equipamentos IS NOT DISTINCT FROM NEW.equipamentos AND
      OLD.acabamentos IS NOT DISTINCT FROM NEW.acabamentos AND
      OLD.endereco_entrega IS NOT DISTINCT FROM NEW.endereco_entrega AND
      OLD.destinatario IS NOT DISTINCT FROM NEW.destinatario AND
      OLD.entregue_para IS NOT DISTINCT FROM NEW.entregue_para AND
      OLD.entregue_em IS NOT DISTINCT FROM NEW.entregue_em
  ) THEN
    -- Only posicao changed, keep old updated_at
    NEW.updated_at = OLD.updated_at;
    RETURN NEW;
  END IF;
  
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
