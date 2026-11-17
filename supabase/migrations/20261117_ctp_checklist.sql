-- ====================================================================
-- Primacor Gráfica - CTP Checklist de Conferência (13 itens)
-- Migration: 20261117_ctp_checklist.sql
-- ====================================================================

ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS ctp_checklist JSONB DEFAULT '{}'::jsonb;

-- Índice para consultas se necessário
CREATE INDEX IF NOT EXISTS idx_orders_ctp_checklist 
  ON public.orders USING gin (ctp_checklist);
