-- ====================================================================
-- Primacor Gráfica - Kaban Autonomous Engine (KAE)
-- Migration: 20261105_kae_post_disk_recovery_optimization.sql
-- Descrição: Otimização emergencial pós-recuperação de disco cheio (Supabase Pro)
-- Objetivos:
--   1. Eliminar sobrecarga do Realtime em telemetria (evita tempestade de WebSockets)
--   2. Garantir índices parciais de ordens ativas e arquivadas
--   3. Expurgo de telemetrias antigas
--   4. Atualização imediata do planejador estatístico (ANALYZE)
-- ====================================================================

-- 1. Remover system_health_telemetry da publicação supabase_realtime
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'system_health_telemetry'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.system_health_telemetry;
  END IF;
END $$;

-- 2. Índices Parciais Estratégicos para Ordens Ativas (Board Operacional)
CREATE INDEX IF NOT EXISTS idx_orders_active_posicao
  ON public.orders (posicao ASC)
  WHERE arquivado = false;

CREATE INDEX IF NOT EXISTS idx_orders_active_updated
  ON public.orders (updated_at DESC)
  WHERE arquivado = false;

CREATE INDEX IF NOT EXISTS idx_orders_active_setor_status_posicao
  ON public.orders (setor, setor_status, posicao ASC)
  WHERE arquivado = false;

-- 3. Índice para Ordens Concluídas (tela /arquivados)
CREATE INDEX IF NOT EXISTS idx_orders_archived_updated
  ON public.orders (updated_at DESC)
  WHERE arquivado = true;

-- 4. Expurgo de telemetria acumulada para recuperar espaço físico e reduzir I/O
DELETE FROM public.system_health_telemetry
WHERE created_at < now() - INTERVAL '7 days';

-- 5. Atualização das estatísticas do planejador do PostgreSQL
ANALYZE public.orders;
ANALYZE public.order_status_history;
ANALYZE public.order_email_events;
ANALYZE public.system_health_telemetry;
