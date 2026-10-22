-- Migration: 20261022_create_system_health_telemetry.sql
-- Description: Telemetria e Monitoramento Autônomo 24/7 (Kaban Autonomous Engine - Fase 1)

CREATE TABLE IF NOT EXISTS public.system_health_telemetry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_type TEXT NOT NULL, -- 'HEARTBEAT', 'WEBSOCKET', 'QUERY_LATENCY', 'GRAPH_API', 'SYSTEM_ALERT'
  source TEXT NOT NULL DEFAULT 'autonomous_engine', -- 'edge_function', 'client_beacon', 'cron'
  status TEXT NOT NULL DEFAULT 'HEALTHY' CHECK (status IN ('HEALTHY', 'DEGRADED', 'CRITICAL')),
  latency_ms NUMERIC,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.system_health_telemetry ENABLE ROW LEVEL SECURITY;

-- Políticas de Acesso Seguras
CREATE POLICY "Authenticated users can view telemetry"
  ON public.system_health_telemetry FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert telemetry"
  ON public.system_health_telemetry FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Anon service beacon can insert telemetry"
  ON public.system_health_telemetry FOR INSERT
  TO anon
  WITH CHECK (true);

-- Índices de Alta Performance para auditoria e dashboards rápidos
CREATE INDEX IF NOT EXISTS idx_telemetry_created_at
  ON public.system_health_telemetry (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_telemetry_type_status_created
  ON public.system_health_telemetry (metric_type, status, created_at DESC);

-- Função para expurgo automático de métricas com mais de 30 dias (zero inchaço do banco)
CREATE OR REPLACE FUNCTION public.clean_old_telemetry()
RETURNS void AS $$
BEGIN
  DELETE FROM public.system_health_telemetry
  WHERE created_at < now() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Habilitar Realtime para a tabela de telemetria
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'system_health_telemetry'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.system_health_telemetry;
  END IF;
END $$;
