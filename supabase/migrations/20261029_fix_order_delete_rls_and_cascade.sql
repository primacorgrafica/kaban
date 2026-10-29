-- ====================================================================
-- Primacor Gráfica - Correção Imediata de Exclusão de O.S. (RLS e Cascata)
-- Arquivo: supabase/migrations/20261029_fix_order_delete_rls_and_cascade.sql
-- ====================================================================

-- 1. CORREÇÃO DA POLÍTICA RLS PARA EXCLUSÃO DE ORDENS
-- Remove a restrição restrita a apenas admin/coordenador que causava falha silenciosa
-- para operadores autenticados, permitindo que usuários autenticados da empresa excluam ordens.
DROP POLICY IF EXISTS "Admins and coordinators can delete orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can delete orders" ON public.orders;

CREATE POLICY "Authenticated users can delete orders" ON public.orders
  FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- 2. CRIAÇÃO DE RPC ATÔMICA E SEGURA PARA EXCLUSÃO TOTAL EM CASCATA
CREATE OR REPLACE FUNCTION public.delete_order_cascade(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_root_id UUID;
  v_deleted_count INT := 0;
BEGIN
  -- 1. Verifica se a ordem existe
  SELECT id, parent_order_id, titulo, setor INTO v_order
  FROM public.orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'deleted_count', 0,
      'message', 'Ordem não encontrada ou já excluída.'
    );
  END IF;

  v_root_id := COALESCE(v_order.parent_order_id, v_order.id);

  -- 2. Limpeza profunda de tabelas filhas vinculadas à família
  DELETE FROM public.order_attachments WHERE order_id IN (
    SELECT id FROM public.orders WHERE id = v_root_id OR parent_order_id = v_root_id
  );
  
  DELETE FROM public.order_email_events WHERE order_id IN (
    SELECT id FROM public.orders WHERE id = v_root_id OR parent_order_id = v_root_id
  );

  DELETE FROM public.order_seller_notifications WHERE order_id IN (
    SELECT id FROM public.orders WHERE id = v_root_id OR parent_order_id = v_root_id
  );

  DELETE FROM public.sector_history WHERE order_id IN (
    SELECT id FROM public.orders WHERE id = v_root_id OR parent_order_id = v_root_id
  );

  DELETE FROM public.order_status_history WHERE order_id IN (
    SELECT id FROM public.orders WHERE id = v_root_id OR parent_order_id = v_root_id
  );

  DELETE FROM public.order_time_summary WHERE order_id IN (
    SELECT id FROM public.orders WHERE id = v_root_id OR parent_order_id = v_root_id
  );

  -- 3. Exclusão de ordens
  IF v_order.parent_order_id IS NOT NULL THEN
    -- Se for sub-ordem (cópia de setor como Compras ou Expedição), exclui apenas esta cópia
    DELETE FROM public.orders WHERE id = p_order_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  ELSE
    -- Se for a ordem principal, exclui todas as sub-ordens e a ordem raiz
    DELETE FROM public.orders WHERE parent_order_id = v_root_id;
    DELETE FROM public.orders WHERE id = v_root_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', v_deleted_count,
    'message', 'Ordem excluída com sucesso em cascata.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_order_cascade(UUID) TO authenticated;
