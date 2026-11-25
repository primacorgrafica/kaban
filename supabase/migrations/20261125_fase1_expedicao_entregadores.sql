-- ====================================================================
-- Primacor Gráfica - FASE 1: Estrutura da Expedição e Cadastro de Entregadores
-- Migration: 20261125_fase1_expedicao_entregadores.sql
-- Descrição:
--   1. Consolida colunas de entregadores e rotas (idempotente com 20261106)
--   2. Permite entregador cadastrado antes da criação de login (user_id NULLABLE)
--   3. Cria função backend is_expedicao_manager() (responsável pela Expedição + admin/coordenador)
--   4. Restringe leitura de dados pessoais (documento_identificacao) via RLS em public.entregadores
--   5. Expõe view segura public.entregadores_public sem documento_identificacao para outros usuários
--   6. Garante exclusão lógica (ativo = false) preservando histórico em orders
-- ====================================================================

-- 1. Garantir colunas na tabela public.entregadores (idempotente)
CREATE TABLE IF NOT EXISTS public.entregadores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
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
  criado_por UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
ALTER TABLE public.entregadores ADD COLUMN IF NOT EXISTS criado_por UUID;
ALTER TABLE public.entregadores ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Permite cadastrar entregadores na Fase 1 antes de vincular login do app (Fase 5)
ALTER TABLE public.entregadores ALTER COLUMN user_id DROP NOT NULL;

-- Constraint de categoria de veículo (Carro ou Moto)
DO $$
BEGIN
  ALTER TABLE public.entregadores DROP CONSTRAINT IF EXISTS entregadores_categoria_veiculo_check;
  ALTER TABLE public.entregadores ADD CONSTRAINT entregadores_categoria_veiculo_check
    CHECK (categoria_veiculo IN ('moto', 'carro'));
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Constraint opcional para validar placa brasileira (antigo AAA0000/AAA-0000 ou Mercosul AAA0A00) quando preenchida
DO $$
BEGIN
  ALTER TABLE public.entregadores DROP CONSTRAINT IF EXISTS entregadores_placa_veiculo_check;
  ALTER TABLE public.entregadores ADD CONSTRAINT entregadores_placa_veiculo_check
    CHECK (
      placa_veiculo IS NULL
      OR trim(placa_veiculo) = ''
      OR regexp_replace(upper(placa_veiculo), '[^A-Z0-9]', '', 'g') ~ '^[A-Z]{3}([0-9]{4}|[0-9][A-Z][0-9]{2})$'
    );
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 2. Garantir colunas de rotas em public.orders (idempotente com 20261106)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS rota_numero TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS rota_sequencia INT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS rota_prioridade BOOLEAN DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS rota_pausada BOOLEAN DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS rota_pausa_motivo TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS rota_pausa_obs TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS rota_pausa_em TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS parada_agrupada_id UUID;

DO $$
BEGIN
  ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_rota_numero_check;
  ALTER TABLE public.orders ADD CONSTRAINT orders_rota_numero_check
    CHECK (rota_numero IS NULL OR rota_numero IN ('1', '2', '3', '4', '5', '6', 'RETIRA'));
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 3. Função central de permissão no backend:
-- Quem gerencia a Expedição: administradores, coordenadores ou usuários com módulo/setor de Expedição/Entregas
CREATE OR REPLACE FUNCTION public.is_expedicao_manager(_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_setor TEXT;
  v_mods TEXT[];
BEGIN
  IF _user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  v_role := COALESCE(public.get_user_role(_user_id), 'user');
  IF v_role IN ('admin', 'coordenador') THEN
    RETURN TRUE;
  END IF;

  -- Entregador puro nunca é gestor da Expedição
  IF v_role = 'entregador' THEN
    RETURN FALSE;
  END IF;

  SELECT p.setor_vinculado, p.modulos_acesso
  INTO v_setor, v_mods
  FROM public.profiles p
  WHERE p.user_id = _user_id;

  IF lower(COALESCE(v_setor, '')) IN ('expedicao', 'entregas') THEN
    RETURN TRUE;
  END IF;

  IF v_mods IS NOT NULL AND (
    'expedicao' = ANY(v_mods)
    OR 'entregas' = ANY(v_mods)
    OR 'gestao_entregas' = ANY(v_mods)
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.is_expedicao_manager(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_expedicao_manager(UUID) TO authenticated;

-- 4. RLS estrito em public.entregadores (protegendo documento_identificacao e escrita)
ALTER TABLE public.entregadores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Todos autenticados podem ver entregadores" ON public.entregadores;
DROP POLICY IF EXISTS "Todos autenticados podem ver entregadores ativos" ON public.entregadores;
DROP POLICY IF EXISTS "Staff can view all drivers" ON public.entregadores;
DROP POLICY IF EXISTS "Drivers can view own driver record" ON public.entregadores;
DROP POLICY IF EXISTS "Apenas gestores podem gerenciar entregadores" ON public.entregadores;
DROP POLICY IF EXISTS "Admins and coordinators can insert drivers" ON public.entregadores;
DROP POLICY IF EXISTS "Admins and coordinators can update drivers" ON public.entregadores;
DROP POLICY IF EXISTS "Admins can delete drivers" ON public.entregadores;
DROP POLICY IF EXISTS "Entregadores podem atualizar propria telemetria" ON public.entregadores;
DROP POLICY IF EXISTS "Gestores Expedicao ou proprio entregador veem cadastro completo" ON public.entregadores;
DROP POLICY IF EXISTS "Gestores Expedicao podem inserir entregadores" ON public.entregadores;
DROP POLICY IF EXISTS "Gestores Expedicao podem editar entregadores" ON public.entregadores;
DROP POLICY IF EXISTS "Apenas admin remove entregador fisicamente" ON public.entregadores;

-- Leitura da tabela completa (inclui documento_identificacao): APENAS responsável pela Expedição, admin/coordenador ou o próprio entregador
CREATE POLICY "Gestores Expedicao ou proprio entregador veem cadastro completo"
  ON public.entregadores FOR SELECT
  TO authenticated
  USING (
    public.is_expedicao_manager(auth.uid())
    OR user_id = auth.uid()
  );

CREATE POLICY "Gestores Expedicao podem inserir entregadores"
  ON public.entregadores FOR INSERT
  TO authenticated
  WITH CHECK (public.is_expedicao_manager(auth.uid()));

CREATE POLICY "Gestores Expedicao podem editar entregadores"
  ON public.entregadores FOR UPDATE
  TO authenticated
  USING (public.is_expedicao_manager(auth.uid()))
  WITH CHECK (public.is_expedicao_manager(auth.uid()));

CREATE POLICY "Entregadores podem atualizar propria telemetria"
  ON public.entregadores FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Exclusão física bloqueada na prática para não-admins (aplicação usa inativação lógica ativo = false)
CREATE POLICY "Apenas admin remove entregador fisicamente"
  ON public.entregadores FOR DELETE
  TO authenticated
  USING (COALESCE(public.get_user_role(auth.uid()), 'user') = 'admin');

-- 5. View segura para consultas operacionais de outros usuários sem expor documento_identificacao
CREATE OR REPLACE VIEW public.entregadores_public AS
SELECT
  e.id,
  e.user_id,
  e.nome_completo,
  e.sobrenome,
  e.placa_veiculo,
  e.modelo_veiculo,
  e.categoria_veiculo,
  e.rota_atribuida,
  e.ativo,
  e.status,
  e.latitude,
  e.longitude,
  e.precisao_metros,
  e.velocidade_kmh,
  e.bateria_percentual,
  e.ultima_atividade,
  e.created_at,
  e.updated_at
FROM public.entregadores e
WHERE auth.uid() IS NOT NULL
  AND (
    COALESCE(public.get_user_role(auth.uid()), 'user') != 'entregador'
    OR e.user_id = auth.uid()
  );

REVOKE ALL ON public.entregadores_public FROM PUBLIC;
GRANT SELECT ON public.entregadores_public TO authenticated;

-- 6. Atualiza RPC manager_assign_delivery_driver para autorizar responsável pela Expedição + admin/coordenador
CREATE OR REPLACE FUNCTION public.manager_assign_delivery_driver(
  p_order_id UUID,
  p_entregador_id UUID,
  p_ordem_parada INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_is_driver_active BOOLEAN;
  v_order_record RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sessão não autenticada.');
  END IF;

  IF NOT public.is_expedicao_manager(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas o responsável pela Expedição e administradores podem atribuir entregadores.');
  END IF;

  IF p_entregador_id IS NOT NULL THEN
    SELECT ativo INTO v_is_driver_active
    FROM public.entregadores
    WHERE user_id = p_entregador_id OR id = p_entregador_id
    LIMIT 1;

    IF v_is_driver_active IS NULL THEN
      IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_entregador_id AND role = 'entregador'::app_role) THEN
        v_is_driver_active := TRUE;
      END IF;
    END IF;

    IF v_is_driver_active IS NOT TRUE THEN
      RETURN jsonb_build_object('success', false, 'error', 'O entregador selecionado está inativo ou não foi encontrado.');
    END IF;
  END IF;

  SELECT id, status_entrega, entregador_id
  INTO v_order_record
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ordem de serviço não encontrada.');
  END IF;

  IF COALESCE(v_order_record.status_entrega, 'pendente') = 'entregue' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não é possível reatribuir uma entrega já concluída.');
  END IF;

  UPDATE public.orders
  SET
    entregador_id = p_entregador_id,
    ordem_parada = CASE
      WHEN p_entregador_id IS NULL THEN NULL
      ELSE COALESCE(p_ordem_parada, ordem_parada)
    END,
    status_entrega = CASE
      WHEN p_entregador_id IS NULL AND COALESCE(status_entrega, 'pendente') = 'atribuido' THEN 'pendente'
      WHEN p_entregador_id IS NOT NULL AND COALESCE(status_entrega, 'pendente') = 'pendente' THEN 'atribuido'
      ELSE status_entrega
    END,
    updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'entregador_id', p_entregador_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', 'Erro no banco ao atribuir entregador (' || SQLSTATE || '): ' || SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.manager_assign_delivery_driver(UUID, UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manager_assign_delivery_driver(UUID, UUID, INT) TO authenticated;

NOTIFY pgrst, 'reload schema';
