
CREATE OR REPLACE FUNCTION public.notify_elana_on_oc_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_recipient uuid := 'a2a24a41-12d6-480f-823f-b4f1429488b3'::uuid;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.setor = 'compras' THEN
    INSERT INTO public.avisos (titulo, mensagem, tipo, criado_por, destinatario_id)
    VALUES (
      CONCAT('Nova OC', CASE WHEN NEW.oc_numero IS NOT NULL THEN ' #' || NEW.oc_numero ELSE '' END, ' - ', COALESCE(NEW.cliente, '')),
      COALESCE(NEW.descricao, 'Nova Ordem de Compra criada'),
      'lembrete',
      COALESCE(NEW.criado_por, v_recipient),
      v_recipient
    );
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notify_elana_on_oc_created ON public.orders;
CREATE TRIGGER trg_notify_elana_on_oc_created
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.notify_elana_on_oc_created();
