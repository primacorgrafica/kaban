-- Migration: Prioridades no Setor de Produção (Primacor Kaban)
-- Permite marcar ordens de serviço como prioridade dentro das etapas de produção

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS prioridade_producao BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_orders_prioridade_producao 
ON public.orders (prioridade_producao) 
WHERE prioridade_producao = true;

COMMENT ON COLUMN public.orders.prioridade_producao IS 'Indica se a O.S. está destacada como prioridade dentro do setor de Produção';
