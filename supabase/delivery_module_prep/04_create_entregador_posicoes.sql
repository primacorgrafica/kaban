-- ====================================================================
-- Primacor Gráfica - Módulo Gestão e Monitoramento de Entregas
-- Migration 04: Criação da tabela de telemetria GPS e auditoria de posições
-- Arquivo: supabase/delivery_module_prep/04_create_entregador_posicoes.sql
-- Status: PREPARADA PARA REVISÃO (NÃO APLICADA)
-- ====================================================================

-- 1. CRIAÇÃO DA TABELA DE HISTÓRICO DE POSIÇÕES GPS
-- Utilizada estritamente para auditoria de pontos-chave (início, paradas e conclusão).
-- O rastreamento em tempo real contínuo trafega via Supabase Realtime Broadcast,
-- evitando sobrecarga de IOPS e espaço no PostgreSQL.
CREATE TABLE IF NOT EXISTS public.entregador_posicoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entregador_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  precisao_metros REAL,
  velocidade_kmh REAL,
  bateria_percentual INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. ÍNDICES DE BUSCA E AUDITORIA TEMPORAL
CREATE INDEX IF NOT EXISTS idx_entregador_posicoes_entregador_created 
  ON public.entregador_posicoes(entregador_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_entregador_posicoes_order 
  ON public.entregador_posicoes(order_id) 
  WHERE order_id IS NOT NULL;

-- 3. HABILITAÇÃO DO ROW LEVEL SECURITY (RLS)
ALTER TABLE public.entregador_posicoes ENABLE ROW LEVEL SECURITY;

-- 4. POLÍTICAS DE RLS EM public.entregador_posicoes
-- Entregador pode inserir exclusivamente suas próprias coordenadas
DROP POLICY IF EXISTS "Drivers can insert own positions" ON public.entregador_posicoes;
CREATE POLICY "Drivers can insert own positions"
  ON public.entregador_posicoes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = entregador_id
    AND public.get_user_role(auth.uid()) = 'entregador'
  );

-- Apenas administradores e coordenadores podem consultar o histórico de posições
DROP POLICY IF EXISTS "Admins and coordinators can view driver positions" ON public.entregador_posicoes;
CREATE POLICY "Admins and coordinators can view driver positions"
  ON public.entregador_posicoes
  FOR SELECT
  TO authenticated
  USING (
    public.get_user_role(auth.uid()) IN ('admin', 'coordenador')
  );

-- Ninguém pode atualizar ou forjar posições gravadas (tabela estritamente append-only)
DROP POLICY IF EXISTS "No one can update positions" ON public.entregador_posicoes;
CREATE POLICY "No one can update positions"
  ON public.entregador_posicoes
  FOR UPDATE
  TO authenticated
  USING (false);

-- Apenas administradores podem purgar logs antigos
DROP POLICY IF EXISTS "Admins can delete old positions" ON public.entregador_posicoes;
CREATE POLICY "Admins can delete old positions"
  ON public.entregador_posicoes
  FOR DELETE
  TO authenticated
  USING (
    public.get_user_role(auth.uid()) = 'admin'
  );

-- 5. ROTINA DE PURGA AUTOMÁTICA DE AUDITORIA (Retenção de 30 dias)
CREATE OR REPLACE FUNCTION public.purge_old_delivery_positions(days_to_keep INT DEFAULT 30)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem executar a limpeza de posições.';
  END IF;

  DELETE FROM public.entregador_posicoes
  WHERE created_at < (now() - (days_to_keep || ' days')::interval);
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
