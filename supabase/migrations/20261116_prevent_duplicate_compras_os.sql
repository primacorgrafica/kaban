-- ====================================================================
-- Primacor Gráfica - Prevenção Definitiva de O.S. Duplicadas em Compras
-- Migration: 20261116_prevent_duplicate_compras_os.sql
-- Idempotente para execução direta no SQL Editor do Supabase
-- ====================================================================

CREATE OR REPLACE FUNCTION public.prevent_duplicate_compras_os()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_titulo TEXT;
  v_exists_id UUID;
BEGIN
  -- Aplica a proteção estrita apenas para ordens ativas do setor compras vindas de O.S.
  IF NEW.setor = 'compras' AND NEW.arquivado = false AND NEW.titulo IS NOT NULL AND NEW.titulo NOT IN ('OC', 'OM', 'NC') THEN
    v_clean_titulo := regexp_replace(NEW.titulo, '[^0-9]', '', 'g');
    
    IF v_clean_titulo <> '' THEN
      SELECT id INTO v_exists_id
      FROM public.orders
      WHERE setor = 'compras'
        AND arquivado = false
        AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND (
          (NEW.parent_order_id IS NOT NULL AND parent_order_id = NEW.parent_order_id)
          OR regexp_replace(titulo, '[^0-9]', '', 'g') = v_clean_titulo
        )
      LIMIT 1;

      IF v_exists_id IS NOT NULL THEN
        RAISE EXCEPTION 'Já existe um card ativo em Compras para a O.S. % (ID existente: %)', NEW.titulo, v_exists_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_compras_os ON public.orders;
CREATE TRIGGER trg_prevent_duplicate_compras_os
  BEFORE INSERT OR UPDATE OF setor, arquivado, titulo, parent_order_id
  ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_duplicate_compras_os();

NOTIFY pgrst, 'reload schema';
