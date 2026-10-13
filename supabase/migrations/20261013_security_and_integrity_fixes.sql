-- ====================================================================
-- Primacor Gráfica - Correções de Segurança, Integridade e Concorrência
-- Migration: 20261013_security_and_integrity_fixes.sql
-- ====================================================================

-- 1. TIGHTEN RLS ON public.orders
-- Apenas administradores e coordenadores podem excluir ordens de serviço
DROP POLICY IF EXISTS "Authenticated users can delete orders" ON public.orders;
CREATE POLICY "Admins and coordinators can delete orders" ON public.orders
  FOR DELETE TO authenticated
  USING (
    public.get_user_role(auth.uid()) IN ('admin', 'coordenador')
  );

-- 2. TIGHTEN RLS ON public.equipamentos
DROP POLICY IF EXISTS "Authenticated can delete equipamentos" ON public.equipamentos;
DROP POLICY IF EXISTS "Authenticated can insert equipamentos" ON public.equipamentos;
DROP POLICY IF EXISTS "Authenticated can update equipamentos" ON public.equipamentos;

CREATE POLICY "Admins can delete equipamentos" ON public.equipamentos
  FOR DELETE TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Admins can insert equipamentos" ON public.equipamentos
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Admins can update equipamentos" ON public.equipamentos
  FOR UPDATE TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

-- 3. TIGHTEN RLS ON public.vendedores
DROP POLICY IF EXISTS "Authenticated can delete vendedores" ON public.vendedores;
DROP POLICY IF EXISTS "Authenticated can insert vendedores" ON public.vendedores;
DROP POLICY IF EXISTS "Authenticated can update vendedores" ON public.vendedores;

CREATE POLICY "Admins can delete vendedores" ON public.vendedores
  FOR DELETE TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Admins can insert vendedores" ON public.vendedores
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Admins can update vendedores" ON public.vendedores
  FOR UPDATE TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

-- 4. TRIGGER: PREVENÇÃO DE ORDENS ÓRFÃS AO EXCLUIR ORDEM-MÃE
-- Garante que carimbos e sub-ordens vinculadas à OS excluída sejam limpos em cascata
CREATE OR REPLACE FUNCTION public.cascade_delete_order_children()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.orders WHERE parent_order_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cascade_delete_order_children ON public.orders;
CREATE TRIGGER trg_cascade_delete_order_children
  BEFORE DELETE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.cascade_delete_order_children();

-- 5. RPC ATÔMICA PARA REORDENAÇÃO DE ORDENS (ELIMINA N+1 MUTATIONS NO CLIENTE)
CREATE OR REPLACE FUNCTION public.reorder_orders_atomic(
  p_order_ids uuid[],
  p_status text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  i int;
BEGIN
  IF p_order_ids IS NULL OR array_length(p_order_ids, 1) = 0 THEN
    RETURN;
  END IF;

  FOR i IN 1 .. array_length(p_order_ids, 1) LOOP
    IF p_status IS NOT NULL THEN
      UPDATE public.orders
      SET posicao = i - 1, status = p_status, atualizado_por = auth.uid()
      WHERE id = p_order_ids[i];
    ELSE
      UPDATE public.orders
      SET posicao = i - 1, atualizado_por = auth.uid()
      WHERE id = p_order_ids[i];
    END IF;
  END LOOP;
END;
$$;

-- 6. RPC PARA SHIFT DE POSIÇÃO AO INSERIR OS URGENTE NO TOPO
CREATE OR REPLACE FUNCTION public.shift_orders_for_urgent(
  p_status text DEFAULT 'fila_de_entrada'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.orders
  SET posicao = posicao + 1
  WHERE status = p_status AND arquivado = false;
END;
$$;
