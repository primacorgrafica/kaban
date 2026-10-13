
CREATE INDEX IF NOT EXISTS idx_orders_setor ON public.orders (setor);
CREATE INDEX IF NOT EXISTS idx_orders_arquivado ON public.orders (arquivado);
CREATE INDEX IF NOT EXISTS idx_orders_posicao ON public.orders (posicao);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_setor_arquivado ON public.orders (setor, arquivado);
CREATE INDEX IF NOT EXISTS idx_orders_setor_status ON public.orders (setor, setor_status);
