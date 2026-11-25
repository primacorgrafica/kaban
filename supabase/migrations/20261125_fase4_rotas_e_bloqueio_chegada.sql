-- =====================================================================================
-- MIGRATION: FASE 4 - ROTAS, SEQUENCIAMENTO E BLOQUEIO PÓS-CHEGADA
-- Data: 25/11/2026
-- =====================================================================================

-- Trigger que impede alteração de rota ou sequência após o entregador chegar ao local ('no_local') ou concluir ('entregue')
CREATE OR REPLACE FUNCTION public.trg_fn_block_route_change_after_arrival()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status_entrega IN ('no_local', 'entregue') THEN
    IF (NEW.rota_numero IS DISTINCT FROM OLD.rota_numero)
       OR (NEW.rota_sequencia IS DISTINCT FROM OLD.rota_sequencia) THEN
      RAISE EXCEPTION 'Alteração bloqueada: não é permitido alterar a rota ou sequência após o entregador chegar ao local ou finalizar a entrega.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_route_change_after_arrival ON public.orders;
CREATE TRIGGER trg_block_route_change_after_arrival
  BEFORE UPDATE OF rota_numero, rota_sequencia ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_block_route_change_after_arrival();
