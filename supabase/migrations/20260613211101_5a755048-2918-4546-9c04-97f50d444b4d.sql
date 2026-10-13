-- Performance: índices para suportar consultas frequentes (auditoria 5k cards / 100 usuários)

-- order_status_history: só tinha pkey. Queries do useSlowOrderAlerts e ProductionCard fazem seq scan.
CREATE INDEX IF NOT EXISTS idx_osh_order_id_created_at
  ON public.order_status_history (order_id, created_at);

CREATE INDEX IF NOT EXISTS idx_osh_order_status_created
  ON public.order_status_history (order_id, status_novo, created_at DESC);

-- sector_history: idx_sector_history_order_id existe, mas sem created_at composto
CREATE INDEX IF NOT EXISTS idx_sector_history_order_created
  ON public.sector_history (order_id, created_at);

-- orders.parent_order_id já tem partial index; adicionar para queries de faturamento por setor
CREATE INDEX IF NOT EXISTS idx_orders_setor_setor_status_active
  ON public.orders (setor, setor_status)
  WHERE arquivado = false AND setor IS NOT NULL;