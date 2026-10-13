CREATE OR REPLACE FUNCTION public.prevent_self_module_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.modulos_acesso IS DISTINCT FROM OLD.modulos_acesso
     AND auth.uid() IS NOT NULL
     AND auth.uid() = NEW.user_id
     AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    NEW.modulos_acesso := OLD.modulos_acesso;
  END IF;
  RETURN NEW;
END;
$function$;