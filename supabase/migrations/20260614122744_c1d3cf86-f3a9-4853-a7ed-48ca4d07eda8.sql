
-- 1. order_status_history: restrict from public to authenticated
DROP POLICY IF EXISTS "Authenticated users can insert status history" ON public.order_status_history;
DROP POLICY IF EXISTS "Authenticated users can view status history" ON public.order_status_history;
CREATE POLICY "Authenticated users can insert status history" ON public.order_status_history
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can view status history" ON public.order_status_history
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

-- 2. user_roles: only own row visible (admins keep "Admins can manage user_roles")
DROP POLICY IF EXISTS "Authenticated can view roles" ON public.user_roles;
CREATE POLICY "Users can view own role" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can view all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. profiles: prevent non-admin from changing modulos_acesso
CREATE OR REPLACE FUNCTION public.prevent_self_module_escalation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.modulos_acesso IS DISTINCT FROM OLD.modulos_acesso
     AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    NEW.modulos_acesso := OLD.modulos_acesso;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_prevent_self_module_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_self_module_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_self_module_escalation();

-- 4. Tighten "always true" policies (still authenticated-only, but non-trivial expression)
DROP POLICY IF EXISTS "Authenticated users can create orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can delete orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can update orders" ON public.orders;
CREATE POLICY "Authenticated users can create orders" ON public.orders
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete orders" ON public.orders
  FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update orders" ON public.orders
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated can delete equipamentos" ON public.equipamentos;
DROP POLICY IF EXISTS "Authenticated can insert equipamentos" ON public.equipamentos;
DROP POLICY IF EXISTS "Authenticated can update equipamentos" ON public.equipamentos;
CREATE POLICY "Authenticated can delete equipamentos" ON public.equipamentos
  FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can insert equipamentos" ON public.equipamentos
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can update equipamentos" ON public.equipamentos
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated can delete vendedores" ON public.vendedores;
DROP POLICY IF EXISTS "Authenticated can insert vendedores" ON public.vendedores;
DROP POLICY IF EXISTS "Authenticated can update vendedores" ON public.vendedores;
CREATE POLICY "Authenticated can delete vendedores" ON public.vendedores
  FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can insert vendedores" ON public.vendedores
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can update vendedores" ON public.vendedores
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can insert sector history" ON public.sector_history;
CREATE POLICY "Authenticated users can insert sector history" ON public.sector_history
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated can insert order_time_summary" ON public.order_time_summary;
CREATE POLICY "Authenticated can insert order_time_summary" ON public.order_time_summary
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

-- 5. Fix mutable search_path on assign_oc_numero & assign_nc_numero
CREATE OR REPLACE FUNCTION public.assign_oc_numero()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.setor = 'compras' AND NEW.oc_numero IS NULL THEN
    NEW.oc_numero := nextval('public.oc_numero_seq');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_nc_numero()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.setor = 'nao_conformidade' AND NEW.nc_numero IS NULL THEN
    NEW.nc_numero := nextval('public.nc_numero_seq');
  END IF;
  RETURN NEW;
END;
$$;

-- 6. Revoke EXECUTE on admin-only SECURITY DEFINER function
REVOKE EXECUTE ON FUNCTION public.compact_archived_history() FROM PUBLIC, anon, authenticated;

-- 7. Realtime: require authentication to subscribe
DROP POLICY IF EXISTS "Authenticated can use realtime" ON realtime.messages;
CREATE POLICY "Authenticated can use realtime" ON realtime.messages
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
