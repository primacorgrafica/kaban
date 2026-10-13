
CREATE OR REPLACE FUNCTION public.sync_order_family_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_root uuid;
BEGIN
  -- Evita recursão do próprio trigger
  IF current_setting('app.sync_order_family', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.descricao IS NOT DISTINCT FROM OLD.descricao
     AND NEW.cliente  IS NOT DISTINCT FROM OLD.cliente
     AND NEW.titulo   IS NOT DISTINCT FROM OLD.titulo THEN
    RETURN NEW;
  END IF;

  v_root := COALESCE(NEW.parent_order_id, NEW.id);

  PERFORM set_config('app.sync_order_family', 'on', true);

  UPDATE public.orders
     SET descricao = NEW.descricao,
         cliente   = NEW.cliente,
         titulo    = NEW.titulo
   WHERE (id = v_root OR parent_order_id = v_root)
     AND id <> NEW.id
     AND (descricao IS DISTINCT FROM NEW.descricao
       OR cliente   IS DISTINCT FROM NEW.cliente
       OR titulo    IS DISTINCT FROM NEW.titulo);

  PERFORM set_config('app.sync_order_family', 'off', true);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_order_family_fields ON public.orders;
CREATE TRIGGER trg_sync_order_family_fields
AFTER UPDATE OF descricao, cliente, titulo ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_order_family_fields();

REVOKE EXECUTE ON FUNCTION public.sync_order_family_fields() FROM PUBLIC, anon, authenticated;
