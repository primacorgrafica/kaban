-- ====================================================================
-- Primacor Gráfica - Correção Definitiva: Exclusão de O.S. e RLS
-- Copie e cole TODO este bloco no SQL Editor do Supabase e clique em RUN
-- ====================================================================

-- 1. DELETA IMEDIATAMENTE A O.S. 71391 (MÃE E TODAS AS CÓPIAS/SUB-ORDENS)
DELETE FROM public.orders 
WHERE parent_order_id IN (SELECT id FROM public.orders WHERE titulo ILIKE '%71391%');

DELETE FROM public.orders 
WHERE titulo ILIKE '%71391%';

-- 2. LIBERA A PERMISSÃO DE EXCLUSÃO (RLS) PARA TODOS OS USUÁRIOS AUTENTICADOS
-- Elimina para sempre o bloqueio silencioso que impedia operadores de excluir
DROP POLICY IF EXISTS "Admins and coordinators can delete orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can delete orders" ON public.orders;

CREATE POLICY "Authenticated users can delete orders" ON public.orders
  FOR DELETE TO authenticated
  USING (true);
