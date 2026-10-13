
-- Fase 1: Índice composto para queries de ordens ativas por setor
-- Substitui consultas que filtram por arquivado + setor + posicao
CREATE INDEX IF NOT EXISTS idx_orders_active_setor_posicao
  ON public.orders (arquivado, setor, posicao)
  WHERE arquivado = false;

-- Índice para a página de concluídos (arquivadas, ordenadas por updated_at)
CREATE INDEX IF NOT EXISTS idx_orders_archived_updated
  ON public.orders (arquivado, updated_at DESC)
  WHERE arquivado = true;
