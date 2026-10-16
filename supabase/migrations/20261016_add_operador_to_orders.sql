-- Migration: 20261016_add_operador_to_orders.sql
-- Adiciona a coluna operador na tabela orders para registrar o operador que vai trabalhar na O.S.
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS operador TEXT;

-- Recarrega o cache do PostgREST imediatamente
NOTIFY pgrst, 'reload schema';

