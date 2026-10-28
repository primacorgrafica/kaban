-- ====================================================================
-- Primacor Gráfica - Módulo Gestão e Monitoramento de Entregas (v2)
-- Migration 04: Criação da tabela de telemetria GPS e auditoria de posições
-- Arquivo: supabase/delivery_module_v2/04_create_entregador_posicoes.sql
-- Status: PREPARADA PARA REVISÃO (NÃO APLICADA)
-- ====================================================================

-- 1. CRIAÇÃO DA TABELA DE HISTÓRICO DE POSIÇÕES GPS
-- ARQUITETURA DE REDUÇÃO DE IOPS:
-- O rastreamento contínuo em tempo real (ex: ping a cada 10-15s) trafega via
-- Supabase Realtime Broadcast (efêmero, em memória, custo zero de banco).
-- Esta tabela armazena estritamente checkpoints auditáveis:
-- (a) Início de rota, (b) Chegada no local, (c) Conclusão/Insucesso, (d) Pings periódicos espaçados (ex: a cada 5-10 min).
CREATE TABLE IF NOT EXISTS public.entregador_posicoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entregador_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  precisao_metros REAL,
  velocidade_kmh REAL,
  bateria_percentual INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_latitude_range CHECK (latitude >= -90.0 AND latitude <= 90.0),
  CONSTRAINT chk_longitude_range CHECK (longitude >= -180.0 AND longitude <= 180.0),
  CONSTRAINT chk_bateria_range CHECK (bateria_percentual IS NULL OR (bateria_percentual >= 0 AND bateria_percentual <= 100))
);

COMMENT ON TABLE public.entregador_posicoes IS 'Auditoria de posições e checkpoints de entrega. Tabela append-only.';
COMMENT ON COLUMN public.entregador_posicoes.entregador_id IS 'ID do entregador autenticado que emitiu o sinal GPS';
COMMENT ON COLUMN public.entregador_posicoes.order_id IS 'O.S. contextualizada no momento do registro (opcional)';

-- 2. ÍNDICES DE BUSCA E AUDITORIA TEMPORAL
CREATE INDEX IF NOT EXISTS idx_entregador_posicoes_entregador_created 
  ON public.entregador_posicoes(entregador_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_entregador_posicoes_order 
  ON public.entregador_posicoes(order_id) 
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_entregador_posicoes_created_at 
  ON public.entregador_posicoes(created_at);

-- 3. HABILITAÇÃO DO ROW LEVEL SECURITY (RLS)
ALTER TABLE public.entregador_posicoes ENABLE ROW LEVEL SECURITY;

-- 4. POLÍTICAS DE RLS EM public.entregador_posicoes

-- Entregador só pode inserir se estiver ativo e vinculado ao próprio auth.uid()
-- Se informar order_id, a O.S. obrigatoriamente deve estar atribuída a ele
DROP POLICY IF EXISTS "Drivers can insert own positions" ON public.entregador_posicoes;
CREATE POLICY "Drivers can insert own positions"
  ON public.entregador_posicoes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = entregador_id
    AND public.get_user_role(auth.uid()) = 'entregador'
    AND EXISTS (
      SELECT 1 FROM public.entregadores e
      WHERE e.user_id = auth.uid() 
      AND e.ativo = true
    )
    AND (
      order_id IS NULL OR EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = order_id 
        AND o.entregador_id = auth.uid()
      )
    )
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

-- Imutabilidade: Ninguém pode atualizar posições gravadas (tabela append-only estrita)
DROP POLICY IF EXISTS "No one can update positions" ON public.entregador_posicoes;
CREATE POLICY "No one can update positions"
  ON public.entregador_posicoes
  FOR UPDATE
  TO authenticated
  USING (false);

-- Apenas administradores podem executar DELETE manual direto
DROP POLICY IF EXISTS "Admins can delete old positions" ON public.entregador_posicoes;
CREATE POLICY "Admins can delete old positions"
  ON public.entregador_posicoes
  FOR DELETE
  TO authenticated
  USING (
    public.get_user_role(auth.uid()) = 'admin'
  );

-- 5. ROTINA DE PURGA DE AUDITORIA COM PROTEÇÃO DE LIMITES E AUTORIZAÇÃO
CREATE OR REPLACE FUNCTION public.purge_old_delivery_positions(days_to_keep INT DEFAULT 30)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INT := 0;
BEGIN
  -- 1. Validação estrita de limites de retenção (evita exclusão acidental por valor incorreto ou negativo)
  IF days_to_keep IS NULL OR days_to_keep < 7 THEN
    RAISE EXCEPTION 'A retenção mínima de segurança para auditoria de entregas é de 7 dias.';
  END IF;

  IF days_to_keep > 365 THEN
    RAISE EXCEPTION 'O limite máximo configurável para purga é de 365 dias.';
  END IF;

  -- 2. Verificação de autorização efetiva
  -- Permite execução por administradores autenticados ou por rotinas agendadas (pg_cron / service_role / postgres)
  IF auth.uid() IS NOT NULL THEN
    IF NOT (public.has_role(auth.uid(), 'admin') OR public.get_user_role(auth.uid()) = 'admin') THEN
      RAISE EXCEPTION 'Acesso negado: apenas administradores podem executar a limpeza de posições.';
    END IF;
  ELSE
    -- Se invocado sem sessão auth.uid(), valida se o usuário corrente do banco é postgres ou supabase_admin
    IF current_user NOT IN ('postgres', 'supabase_admin') THEN
      RAISE EXCEPTION 'Execução de sistema não autorizada para o papel %.', current_user;
    END IF;
  END IF;

  -- 3. Exclusão dos registros anteriores à janela de corte
  DELETE FROM public.entregador_posicoes
  WHERE created_at < (now() - (days_to_keep || ' days')::interval);
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Restringe privilégios de execução da função
REVOKE ALL ON FUNCTION public.purge_old_delivery_positions(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_old_delivery_positions(INT) TO authenticated, service_role;

COMMENT ON FUNCTION public.purge_old_delivery_positions(INT) IS 'Purga posições GPS anteriores a N dias (mínimo 7 dias). Protegida por role admin ou service_role/pg_cron.';
