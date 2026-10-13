REVOKE EXECUTE ON FUNCTION public.prevent_self_module_escalation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_self_module_escalation() FROM anon;
REVOKE EXECUTE ON FUNCTION public.prevent_self_module_escalation() FROM authenticated;