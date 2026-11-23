-- ====================================================================
-- Primaco Grafica - Campos de Posição e Previsão do Cliente
-- Migration: 20261123_posicao_e_previsao_cliente.sql
-- ====================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS posicao_atual TEXT,
  ADD COLUMN IF NOT EXISTS data_posicao TEXT,
  ADD COLUMN IF NOT EXISTS previsao_cliente TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_posicao_atual ON public.orders(posicao_atual);
CREATE INDEX IF NOT EXISTS idx_orders_data_posicao ON public.orders(data_posicao);
CREATE INDEX IF NOT EXISTS idx_orders_previsao_cliente ON public.orders(previsao_cliente);

NOTIFY pgrst, 'reload schema';
