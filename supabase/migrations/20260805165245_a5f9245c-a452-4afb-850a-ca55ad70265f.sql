CREATE OR REPLACE FUNCTION public.prevent_duplicate_family_in_sector()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_root uuid;
  v_exists boolean;
BEGIN
  IF NEW.setor IS NULL OR NEW.arquivado THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.setor IS NOT DISTINCT FROM NEW.setor
     AND OLD.arquivado IS NOT DISTINCT FROM NEW.arquivado THEN
    RETURN NEW;
  END IF;

  v_root := COALESCE(NEW.parent_order_id, NEW.id);

  SELECT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id <> NEW.id
      AND o.arquivado = false
      AND o.setor = NEW.setor
      AND (o.id = v_root OR o.parent_order_id = v_root)
  ) INTO v_exists;

  IF v_exists THEN
    RAISE EXCEPTION 'A OS % já possui uma cópia ativa no setor %.', NEW.titulo, NEW.setor
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_family_in_sector ON public.orders;
CREATE TRIGGER trg_prevent_duplicate_family_in_sector
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_family_in_sector();