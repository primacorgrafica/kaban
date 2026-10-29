-- ====================================================================
-- Primacor Gráfica - Correção Definitiva de RLS para Exclusão de Ordens
-- Migration: 20261029_fix_order_delete_rls_and_cascade.sql
-- ====================================================================

-- 1. Libera exclusão na tabela orders para todos os usuários autenticados da empresa
DROP POLICY IF EXISTS "Admins and coordinators can delete orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can delete orders" ON public.orders;

CREATE POLICY "Authenticated users can delete orders" ON public.orders
  FOR DELETE TO authenticated
  USING (true);
