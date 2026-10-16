-- Migration: 20261016_add_os_anterior_to_orders.sql
-- Adiciona a coluna os_anterior na tabela orders para registrar o número da O.S. anterior quando o trabalho for Repetição
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS os_anterior TEXT;

-- Recarrega o cache do PostgREST imediatamente
NOTIFY pgrst, 'reload schema';
