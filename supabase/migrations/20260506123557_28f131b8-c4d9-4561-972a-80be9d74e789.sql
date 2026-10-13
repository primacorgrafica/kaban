-- Índices para acelerar queries do Kanban e dashboards
-- IF NOT EXISTS garante segurança total (não falha se já existir)

CREATE INDEX IF NOT EXISTS idx_orders_arquivado_setor_posicao 
  ON public.orders (arquivado, setor, posicao);

CREATE INDEX IF NOT EXISTS idx_orders_setor_setor_status 
  ON public.orders (setor, setor_status) WHERE arquivado = false;

CREATE INDEX IF NOT EXISTS idx_orders_status_arquivado 
  ON public.orders (status, arquivado);

CREATE INDEX IF NOT EXISTS idx_orders_parent_order_id 
  ON public.orders (parent_order_id) WHERE parent_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_created_at 
  ON public.orders (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_setor_not_null 
  ON public.orders (setor, posicao) WHERE setor IS NOT NULL AND arquivado = false;