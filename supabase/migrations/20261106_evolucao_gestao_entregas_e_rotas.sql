-- ====================================================================
-- Primacor Gráfica - Evolução do Módulo de Gestão de Entregas e Expedição
-- Migration: 20261106_evolucao_gestao_entregas_e_rotas.sql
-- Descrição:
--   1. Suporte às Rotas Numeradas (1 a 6) e Rota Especial RETIRA
--   2. Sequenciamento de Paradas e Agrupamento de O.S. por Cliente
--   3. Registro e Controle de Pausas/Imprevistos com motivos padronizados
--   4. Cadastro Completo de Entregadores (Carro/Moto, Documento, Status Ativo/Inativo)
-- ====================================================================

-- 1. Garantir enum de roles com 'entregador'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t 
    JOIN pg_enum e ON t.oid = e.enumtypid 
    WHERE t.typname = 'app_role' AND e.enumlabel = 'entregador'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'entregador';
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 2. Garantir existência e colunas completas da tabela public.entregadores
CREATE TABLE IF NOT EXISTS public.entregadores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_completo TEXT NOT NULL,
  sobrenome TEXT,
  telefone TEXT,
  placa_veiculo TEXT,
  modelo_veiculo TEXT,
  documento_identificacao TEXT,
  categoria_veiculo TEXT NOT NULL DEFAULT 'moto',
  observacoes TEXT,
  rota_atribuida TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  status TEXT DEFAULT 'offline',
  latitude NUMERIC(10, 8),
  longitude NUMERIC(11, 8),
  precisao_metros NUMERIC(8, 2),
  velocidade_kmh NUMERIC(6, 2),
  bateria_percentual INT,
  ultima_atividade TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Adicionar colunas caso a tabela já existisse com estrutura simplificada
ALTER TABLE public.entregadores ADD COLUMN IF NOT EXISTS sobrenome TEXT;
ALTER TABLE public.entregadores ADD COLUMN IF NOT EXISTS modelo_veiculo TEXT;
ALTER TABLE public.entregadores ADD COLUMN IF NOT EXISTS documento_identificacao TEXT;
ALTER TABLE public.entregadores ADD COLUMN IF NOT EXISTS categoria_veiculo TEXT NOT NULL DEFAULT 'moto';
ALTER TABLE public.entregadores ADD COLUMN IF NOT EXISTS observacoes TEXT;
ALTER TABLE public.entregadores ADD COLUMN IF NOT EXISTS rota_atribuida TEXT;
ALTER TABLE public.entregadores ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'offline';
ALTER TABLE public.entregadores ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 8);
ALTER TABLE public.entregadores ADD COLUMN IF NOT EXISTS longitude NUMERIC(11, 8);
ALTER TABLE public.entregadores ADD COLUMN IF NOT EXISTS precisao_metros NUMERIC(8, 2);
ALTER TABLE public.entregadores ADD COLUMN IF NOT EXISTS velocidade_kmh NUMERIC(6, 2);
ALTER TABLE public.entregadores ADD COLUMN IF NOT EXISTS bateria_percentual INT;
ALTER TABLE public.entregadores ADD COLUMN IF NOT EXISTS ultima_atividade TIMESTAMPTZ;
ALTER TABLE public.entregadores ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Constraint de categoria de veículo (Carro ou Moto)
DO $$
BEGIN
  ALTER TABLE public.entregadores DROP CONSTRAINT IF EXISTS entregadores_categoria_veiculo_check;
  ALTER TABLE public.entregadores ADD CONSTRAINT entregadores_categoria_veiculo_check
    CHECK (categoria_veiculo IN ('moto', 'carro'));
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 3. Habilitar RLS em public.entregadores
ALTER TABLE public.entregadores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Todos autenticados podem ver entregadores" ON public.entregadores;
CREATE POLICY "Todos autenticados podem ver entregadores"
  ON public.entregadores FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Apenas gestores podem gerenciar entregadores" ON public.entregadores;
CREATE POLICY "Apenas gestores podem gerenciar entregadores"
  ON public.entregadores FOR ALL
  TO authenticated
  USING (
    COALESCE(public.get_user_role(auth.uid()), 'user') IN ('admin', 'coordenador')
  )
  WITH CHECK (
    COALESCE(public.get_user_role(auth.uid()), 'user') IN ('admin', 'coordenador')
  );

DROP POLICY IF EXISTS "Entregadores podem atualizar propria telemetria" ON public.entregadores;
CREATE POLICY "Entregadores podem atualizar propria telemetria"
  ON public.entregadores FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 4. Adicionar colunas de Rotas e Planejamento na tabela public.orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS rota_numero TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS rota_sequencia INT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS rota_prioridade BOOLEAN DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS rota_pausada BOOLEAN DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS rota_pausa_motivo TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS rota_pausa_obs TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS rota_pausa_em TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS parada_agrupada_id UUID;

-- Constraint para validar as rotas permitidas: 1 a 6 e a rota especial RETIRA
DO $$
BEGIN
  ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_rota_numero_check;
  ALTER TABLE public.orders ADD CONSTRAINT orders_rota_numero_check
    CHECK (rota_numero IS NULL OR rota_numero IN ('1', '2', '3', '4', '5', '6', 'RETIRA'));
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 5. Índices de Alta Performance
CREATE INDEX IF NOT EXISTS idx_orders_rota_numero
  ON public.orders (rota_numero)
  WHERE rota_numero IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_rota_sequencia
  ON public.orders (rota_numero, rota_sequencia ASC)
  WHERE rota_numero IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_parada_agrupada
  ON public.orders (parada_agrupada_id)
  WHERE parada_agrupada_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_rota_prioridade
  ON public.orders (rota_prioridade)
  WHERE rota_prioridade = true;

CREATE INDEX IF NOT EXISTS idx_entregadores_rota
  ON public.entregadores (rota_atribuida)
  WHERE rota_atribuida IS NOT NULL;

-- 6. Adicionar à publicação Realtime para sincronização imediata entre expedição e app mobile
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'entregadores'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.entregadores;
  END IF;
END $$;
