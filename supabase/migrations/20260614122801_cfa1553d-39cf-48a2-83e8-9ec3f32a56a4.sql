
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_elana_on_oc_created() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_om_numero() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_oc_numero() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_nc_numero() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_order_status_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_sector_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_marcelo_on_preimpressao_saida() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_self_module_escalation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM PUBLIC, anon;
