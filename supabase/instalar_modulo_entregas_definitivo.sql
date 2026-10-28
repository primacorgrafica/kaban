-- ====================================================================
-- Primacor Gráfica - Instalação e Correção Definitiva do Módulo de Entregas
-- Arquivo: supabase/instalar_modulo_entregas_definitivo.sql
-- Finalidade: Executar no SQL Editor do Supabase para corrigir e garantir
--             todas as colunas, constraints, tabelas e funções RPC necessárias.
-- ====================================================================

-- 1. ADICIONA O VALOR 'entregador' AO ENUM app_role CASO NÃO EXISTA
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

-- 2. CRIA A TABELA public.entregadores SE NÃO EXISTIR
CREATE TABLE IF NOT EXISTS public.entregadores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_completo TEXT NOT NULL,
  telefone TEXT,
  placa_veiculo TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.entregadores ENABLE ROW LEVEL SECURITY;

-- Políticas para public.entregadores
DROP POLICY IF EXISTS "Todos autenticados podem ver entregadores ativos" ON public.entregadores;
CREATE POLICY "Todos autenticados podem ver entregadores ativos"
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

-- 3. CRIA A TABELA public.delivery_tracking SE NÃO EXISTIR
CREATE TABLE IF NOT EXISTS public.delivery_tracking (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  entregador_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  latitude NUMERIC(10, 8) NOT NULL,
  longitude NUMERIC(11, 8) NOT NULL,
  precisao_metros NUMERIC(8, 2),
  velocidade_kmh NUMERIC(6, 2),
  bateria_percentual INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.delivery_tracking ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Todos autenticados podem ver telemetria" ON public.delivery_tracking;
CREATE POLICY "Todos autenticados podem ver telemetria"
  ON public.delivery_tracking FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Entregadores e gestores inserem telemetria" ON public.delivery_tracking;
CREATE POLICY "Entregadores e gestores inserem telemetria"
  ON public.delivery_tracking FOR INSERT
  TO authenticated
  WITH CHECK (
    entregador_id = auth.uid() 
    OR COALESCE(public.get_user_role(auth.uid()), 'user') IN ('admin', 'coordenador')
  );

-- 4. ADICIONA TODAS AS COLUNAS DE ENTREGA NA TABELA public.orders DE FORMA INDIVIDUAL E SEGURA
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS entregador_id UUID;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS status_entrega TEXT DEFAULT 'pendente';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS ordem_parada INT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS data_saida_entrega TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS data_chegada_entrega TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS motivo_insucesso TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS status_comprovante_sync TEXT DEFAULT 'pendente';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS entregue_em TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS entregue_para TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS entregue_por TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS obs_entrega TEXT;

-- 5. NORMALIZA OS STATUS EXISTENTES PARA EVITAR CONFLITO DE CONSTRAINT
UPDATE public.orders 
SET status_entrega = 'pendente' 
WHERE status_entrega IS NULL;

-- 6. ATUALIZA A CONSTRAINT DE status_entrega COM SEGURANÇA
DO $$
BEGIN
  ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_entrega_check;
  ALTER TABLE public.orders ADD CONSTRAINT orders_status_entrega_check 
    CHECK (status_entrega IN ('pendente', 'atribuido', 'em_rota', 'no_local', 'entregue', 'insucesso'));
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 7. ÍNDICES DE PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_orders_entregador_id ON public.orders(entregador_id) WHERE entregador_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_status_entrega ON public.orders(status_entrega);
CREATE INDEX IF NOT EXISTS idx_orders_entregador_status ON public.orders(entregador_id, status_entrega) WHERE entregador_id IS NOT NULL;

-- 8. TRIGGER DE SEGURANÇA CONTRA ADULTERAÇÃO (SEM BLOQUEAR GESTORES OU ATUALIZAÇÕES LEGÍTIMAS)
CREATE OR REPLACE FUNCTION public.guard_order_driver_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  v_role := public.get_user_role(auth.uid());

  -- Gestores têm autorização para atualizar qualquer aspecto da O.S.
  IF v_role IN ('admin', 'coordenador') THEN
    RETURN NEW;
  END IF;

  -- Se for entregador puro, bloqueia manipulação de campos industriais ou fiscais
  IF v_role = 'entregador' THEN
    -- Não pode trocar entregador responsável
    IF OLD.entregador_id IS NOT NULL AND NEW.entregador_id IS DISTINCT FROM OLD.entregador_id THEN
      RAISE EXCEPTION 'Acesso negado: entregadores não podem reatribuir ordens de serviço.';
    END IF;

    -- Não pode alterar dados comerciais e de produção fundamentais
    IF NEW.cliente IS DISTINCT FROM OLD.cliente
       OR NEW.titulo IS DISTINCT FROM OLD.titulo
       OR NEW.descricao IS DISTINCT FROM OLD.descricao
       OR NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Acesso negado: entregadores não podem modificar dados industriais ou comerciais da O.S.';
    END IF;

    -- Não pode reverter entrega já concluída
    IF OLD.status_entrega = 'entregue' AND NEW.status_entrega IS DISTINCT FROM 'entregue' THEN
      RAISE EXCEPTION 'Acesso negado: uma entrega finalizada não pode ter seu status retrocedido.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_order_driver_tampering ON public.orders;
CREATE TRIGGER trg_guard_order_driver_tampering
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_order_driver_tampering();

-- 9. RPC CRÍTICA: driver_update_delivery_status
-- Permite que entregadores atribuídos e gestores atualizem status de rota
CREATE OR REPLACE FUNCTION public.driver_update_delivery_status(
  p_order_id UUID,
  p_new_status TEXT,
  p_entregue_para TEXT DEFAULT NULL,
  p_obs_entrega TEXT DEFAULT NULL,
  p_motivo_insucesso TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_role TEXT;
  v_driver_active BOOLEAN := FALSE;
  v_driver_name TEXT;
  v_current_order RECORD;
  v_is_entregador BOOLEAN := FALSE;
  v_is_gestor BOOLEAN := FALSE;
BEGIN
  -- 1. Sessão autenticada
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sessão não autenticada.');
  END IF;

  -- 2. Identifica permissão do chamador
  v_caller_role := COALESCE(public.get_user_role(auth.uid()), 'user');

  IF v_caller_role IN ('admin', 'coordenador') THEN
    v_is_gestor := TRUE;
  END IF;

  -- Verifica se está cadastrado na tabela pública de entregadores
  SELECT ativo, nome_completo INTO v_driver_active, v_driver_name
  FROM public.entregadores
  WHERE user_id = auth.uid();

  IF v_caller_role = 'entregador' OR v_driver_active IS TRUE THEN
    v_is_entregador := TRUE;
  END IF;

  IF NOT v_is_gestor AND NOT v_is_entregador THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas entregadores atribuídos ou gestores podem atualizar status de entrega.');
  END IF;

  -- Se o nome do motorista ainda não foi localizado, busca no profile
  IF v_driver_name IS NULL THEN
    SELECT COALESCE(nome, 'Entregador') INTO v_driver_name
    FROM public.profiles
    WHERE user_id = auth.uid();
  END IF;

  -- 3. Sanitização de limites
  IF p_entregue_para IS NOT NULL AND length(trim(p_entregue_para)) > 150 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nome do recebedor excede o limite de 150 caracteres.');
  END IF;

  IF p_obs_entrega IS NOT NULL AND length(trim(p_obs_entrega)) > 1000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Observação de entrega excede o limite de 1000 caracteres.');
  END IF;

  IF p_motivo_insucesso IS NOT NULL AND length(trim(p_motivo_insucesso)) > 500 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Motivo do insucesso excede o limite de 500 caracteres.');
  END IF;

  -- 4. Bloqueio FOR UPDATE para garantir atomicidade e evitar race conditions
  SELECT id, status_entrega, entregador_id, data_saida_entrega, data_chegada_entrega, entregue_em, entregue_para, entregue_por, obs_entrega
  INTO v_current_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ordem de serviço não encontrada.');
  END IF;

  -- 5. Se for entregador (e não gestor), valida que a ordem está atribuída a ele
  IF NOT v_is_gestor THEN
    IF v_current_order.entregador_id IS DISTINCT FROM auth.uid() THEN
      RETURN jsonb_build_object('success', false, 'error', 'Esta ordem não está atribuída ao seu usuário de entregador.');
    END IF;
  END IF;

  -- 6. Terminal State Protection: entregas concluídas são imutáveis
  IF COALESCE(v_current_order.status_entrega, 'pendente') = 'entregue' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta entrega já foi concluída e não pode mais ser alterada.');
  END IF;

  -- 7. Máquina de Estados Finita (FSM)
  IF p_new_status = 'em_rota' THEN
    IF COALESCE(v_current_order.status_entrega, 'pendente') NOT IN ('atribuido', 'pendente', 'insucesso') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Não é possível iniciar rota a partir do status atual (' || COALESCE(v_current_order.status_entrega, 'indefinido') || ').');
    END IF;

  ELSIF p_new_status = 'no_local' THEN
    IF COALESCE(v_current_order.status_entrega, 'pendente') != 'em_rota' THEN
      RETURN jsonb_build_object('success', false, 'error', 'A ordem precisa estar em rota para registrar chegada ao local.');
    END IF;

  ELSIF p_new_status = 'entregue' THEN
    IF COALESCE(v_current_order.status_entrega, 'pendente') NOT IN ('no_local', 'em_rota') THEN
      RETURN jsonb_build_object('success', false, 'error', 'A entrega deve estar no local ou em rota para ser concluída.');
    END IF;
    IF p_entregue_para IS NULL OR trim(p_entregue_para) = '' THEN
      RETURN jsonb_build_object('success', false, 'error', 'O nome de quem recebeu a entrega é obrigatório.');
    END IF;

  ELSIF p_new_status = 'insucesso' THEN
    IF COALESCE(v_current_order.status_entrega, 'pendente') NOT IN ('em_rota', 'no_local') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Insucesso só pode ser registrado após início do deslocamento.');
    END IF;
    IF p_motivo_insucesso IS NULL OR trim(p_motivo_insucesso) = '' THEN
      RETURN jsonb_build_object('success', false, 'error', 'O motivo do insucesso deve ser informado.');
    END IF;

  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Status de transição de entrega inválido: ' || COALESCE(p_new_status, 'vazio'));
  END IF;

  -- 8. Atualização atômica na tabela public.orders
  UPDATE public.orders
  SET
    status_entrega = p_new_status,
    data_saida_entrega = CASE 
      WHEN p_new_status = 'em_rota' AND data_saida_entrega IS NULL THEN now() 
      ELSE data_saida_entrega 
    END,
    data_chegada_entrega = CASE 
      WHEN p_new_status = 'no_local' THEN now() 
      ELSE data_chegada_entrega 
    END,
    entregue_em = CASE 
      WHEN p_new_status = 'entregue' THEN now() 
      ELSE entregue_em 
    END,
    entregue_para = CASE 
      WHEN p_new_status = 'entregue' THEN trim(p_entregue_para) 
      ELSE entregue_para 
    END,
    entregue_por = CASE 
      WHEN p_new_status = 'entregue' THEN COALESCE(v_driver_name, 'Entregador') 
      ELSE entregue_por 
    END,
    motivo_insucesso = CASE 
      WHEN p_new_status = 'insucesso' THEN trim(p_motivo_insucesso) 
      ELSE NULL 
    END,
    obs_entrega = CASE 
      WHEN p_obs_entrega IS NOT NULL AND trim(p_obs_entrega) != '' THEN trim(p_obs_entrega) 
      ELSE obs_entrega 
    END,
    updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'status_entrega', p_new_status);
EXCEPTION WHEN OTHERS THEN
  -- Retorna a mensagem de erro exata do PostgreSQL para diagnóstico imediato
  RETURN jsonb_build_object('success', false, 'error', 'Erro no banco (' || SQLSTATE || '): ' || SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.driver_update_delivery_status(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.driver_update_delivery_status(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- 10. RPC PARA ATRIBUIÇÃO DE ENTREGADOR PELO GESTOR
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
  v_caller_role TEXT;
  v_is_driver_active BOOLEAN;
  v_order_record RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sessão não autenticada.');
  END IF;

  v_caller_role := COALESCE(public.get_user_role(auth.uid()), 'user');
  IF v_caller_role NOT IN ('admin', 'coordenador') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas gestores (administradores ou coordenadores) podem atribuir entregadores.');
  END IF;

  -- Se estiver atribuindo a um motorista, valida se ele está ativo
  IF p_entregador_id IS NOT NULL THEN
    SELECT ativo INTO v_is_driver_active
    FROM public.entregadores
    WHERE user_id = p_entregador_id;

    -- Se não encontrar na tabela entregadores, verifica se possui perfil entregador
    IF v_is_driver_active IS NULL THEN
      IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_entregador_id AND role = 'entregador'::app_role) THEN
        v_is_driver_active := TRUE;
      END IF;
    END IF;

    IF v_is_driver_active IS NOT TRUE THEN
      RETURN jsonb_build_object('success', false, 'error', 'O usuário selecionado não é um entregador ativo.');
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

-- 11. BUCKET DE COMPROVANTES DE ENTREGA (STORAGE)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'comprovantes-entrega',
  'comprovantes-entrega',
  false,
  10485760, -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

-- Políticas de Storage
DROP POLICY IF EXISTS "Autenticados podem fazer download de comprovantes" ON storage.objects;
CREATE POLICY "Autenticados podem fazer download de comprovantes"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'comprovantes-entrega');

DROP POLICY IF EXISTS "Autenticados podem fazer upload de comprovantes" ON storage.objects;
CREATE POLICY "Autenticados podem fazer upload de comprovantes"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'comprovantes-entrega');

SELECT 'MÓDULO DE ENTREGAS INSTALADO E CORRIGIDO COM SUCESSO!' AS status;
