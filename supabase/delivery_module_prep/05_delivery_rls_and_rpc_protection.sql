-- ====================================================================
-- Primacor Gráfica - Módulo Gestão e Monitoramento de Entregas
-- Migration 05: Ajuste de RLS, RPC de máquina de estados e proteção contra adulteração
-- Arquivo: supabase/delivery_module_prep/05_delivery_rls_and_rpc_protection.sql
-- Status: PREPARADA PARA REVISÃO (NÃO APLICADA)
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. REFINAMENTO DE RLS NA TABELA public.orders
-- --------------------------------------------------------------------

-- 1.1 Remove políticas antigas permissivas que concediam acesso irrestrito
DROP POLICY IF EXISTS "Authenticated users can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can create orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can update orders" ON public.orders;

-- 1.2 Políticas de SELECT:
-- Equipe interna continua enxergando todas as ordens para manter o fluxo de produção, PCP e faturamento
CREATE POLICY "Staff can view all orders"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    COALESCE(public.get_user_role(auth.uid()), 'user') != 'entregador'
  );

-- Entregador enxerga exclusivamente as O.S. que lhe foram expressamente atribuídas
CREATE POLICY "Drivers can view only assigned orders"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    public.get_user_role(auth.uid()) = 'entregador'
    AND entregador_id = auth.uid()
  );

-- 1.3 Políticas de INSERT:
-- Apenas equipe interna pode cadastrar ordens. Entregadores não podem forjar O.S.
CREATE POLICY "Staff can create orders"
  ON public.orders
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND COALESCE(public.get_user_role(auth.uid()), 'user') != 'entregador'
  );

-- 1.4 Políticas de UPDATE:
-- Equipe interna atualiza as ordens de acordo com o fluxo do sistema
CREATE POLICY "Staff can update orders"
  ON public.orders
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND COALESCE(public.get_user_role(auth.uid()), 'user') != 'entregador'
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND COALESCE(public.get_user_role(auth.uid()), 'user') != 'entregador'
  );

-- NOTA ARQUITETURAL: Não há política de UPDATE direto em orders para entregadores.
-- Qualquer transição de entrega executada pelo motoboy DEVE ocorrer através da RPC
-- segura public.driver_update_delivery_status abaixo, blindando 100% os campos industriais e financeiros.

-- --------------------------------------------------------------------
-- 2. RPC SEGURA (SECURITY DEFINER): MÁQUINA DE ESTADOS DO ENTREGADOR
-- --------------------------------------------------------------------
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
  v_driver_active BOOLEAN;
  v_driver_name TEXT;
  v_current_order RECORD;
BEGIN
  -- 1. Identifica o chamador
  v_caller_role := public.get_user_role(auth.uid());
  IF v_caller_role != 'entregador' AND v_caller_role NOT IN ('admin', 'coordenador') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas entregadores atribuídos ou gestores podem atualizar status de entrega.');
  END IF;

  -- 2. Se for entregador, valida se está ativo no cadastro
  IF v_caller_role = 'entregador' THEN
    SELECT ativo, nome_completo INTO v_driver_active, v_driver_name
    FROM public.entregadores
    WHERE user_id = auth.uid();

    IF v_driver_active IS NOT TRUE THEN
      RETURN jsonb_build_object('success', false, 'error', 'Entregador inativo ou não cadastrado.');
    END IF;
  ELSE
    SELECT COALESCE(nome, 'Gestor') INTO v_driver_name
    FROM public.profiles
    WHERE user_id = auth.uid();
  END IF;

  -- 3. Localiza a ordem e valida atribuição
  SELECT id, status_entrega, entregador_id, data_saida_entrega
  INTO v_current_order
  FROM public.orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ordem de serviço não encontrada.');
  END IF;

  -- Se for motoboy, valida rigorosamente se a O.S. está sob sua custódia
  IF v_caller_role = 'entregador' AND v_current_order.entregador_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta ordem não está atribuída a você.');
  END IF;

  -- 4. Validação da Máquina de Estados (State Machine)
  -- Transições permitidas:
  -- atribuido -> em_rota
  -- em_rota -> no_local
  -- no_local -> entregue
  -- em_rota / no_local -> insucesso
  IF p_new_status = 'em_rota' THEN
    IF v_current_order.status_entrega NOT IN ('atribuido', 'pendente', 'insucesso') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Não é possível iniciar rota a partir do status atual.');
    END IF;

  ELSIF p_new_status = 'no_local' THEN
    IF v_current_order.status_entrega != 'em_rota' THEN
      RETURN jsonb_build_object('success', false, 'error', 'A ordem deve estar em rota para marcar chegada no local.');
    END IF;

  ELSIF p_new_status = 'entregue' THEN
    IF v_current_order.status_entrega NOT IN ('no_local', 'em_rota') THEN
      RETURN jsonb_build_object('success', false, 'error', 'A entrega deve estar no local ou em rota para ser concluída.');
    END IF;
    IF p_entregue_para IS NULL OR trim(p_entregue_para) = '' THEN
      RETURN jsonb_build_object('success', false, 'error', 'O nome de quem recebeu a entrega é obrigatório.');
    END IF;

  ELSIF p_new_status = 'insucesso' THEN
    IF v_current_order.status_entrega NOT IN ('em_rota', 'no_local') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Insucesso só pode ser registrado durante a rota.');
    END IF;
    IF p_motivo_insucesso IS NULL OR trim(p_motivo_insucesso) = '' THEN
      RETURN jsonb_build_object('success', false, 'error', 'O motivo do insucesso deve ser informado.');
    END IF;

  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Status de entrega inválido.');
  END IF;

  -- 5. Atualização atômica estritamente nos campos de entrega
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
      WHEN p_new_status = 'entregue' THEN v_driver_name 
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
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.driver_update_delivery_status(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- --------------------------------------------------------------------
-- 3. RPC SEGURA PARA ATRIBUIÇÃO DE O.S. PELO GESTOR
-- --------------------------------------------------------------------
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
  v_driver_exists BOOLEAN;
BEGIN
  -- 1. Valida se o chamador é gestor
  v_caller_role := public.get_user_role(auth.uid());
  IF v_caller_role NOT IN ('admin', 'coordenador') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas administradores e coordenadores podem atribuir entregadores.');
  END IF;

  -- 2. Se for informado um entregador, valida se ele existe e está ativo
  IF p_entregador_id IS NOT NULL THEN
    SELECT ativo INTO v_driver_exists
    FROM public.entregadores
    WHERE user_id = p_entregador_id;

    IF v_driver_exists IS NOT TRUE THEN
      RETURN jsonb_build_object('success', false, 'error', 'Entregador selecionado não existe ou está inativo.');
    END IF;
  END IF;

  -- 3. Atualiza a atribuição na ordem
  UPDATE public.orders
  SET
    entregador_id = p_entregador_id,
    status_entrega = CASE 
      WHEN p_entregador_id IS NOT NULL THEN 'atribuido' 
      ELSE 'pendente' 
    END,
    ordem_parada = p_ordem_parada,
    empresa_entrega = CASE 
      WHEN p_entregador_id IS NOT NULL THEN 'Motoboy Primacor' 
      ELSE empresa_entrega 
    END,
    updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'entregador_id', p_entregador_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.manager_assign_delivery_driver(UUID, UUID, INT) TO authenticated;

-- --------------------------------------------------------------------
-- 4. TRIGGER DE DEFESA EM PROFUNDIDADE CONTRA ADULTERAÇÃO
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_order_driver_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Se o chamador for do papel entregador, bloqueia qualquer tentativa de alteração
  -- que escape da RPC controlada
  IF public.get_user_role(auth.uid()) = 'entregador' THEN
    IF OLD.entregador_id IS DISTINCT FROM auth.uid() OR NEW.entregador_id IS DISTINCT FROM OLD.entregador_id THEN
      RAISE EXCEPTION 'Acesso negado: entregador não autorizado a reatribuir ordens.';
    END IF;

    IF NEW.cliente IS DISTINCT FROM OLD.cliente
       OR NEW.titulo IS DISTINCT FROM OLD.titulo
       OR NEW.descricao IS DISTINCT FROM OLD.descricao
       OR NEW.setor IS DISTINCT FROM OLD.setor
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.prazo IS DISTINCT FROM OLD.prazo
       OR NEW.valor IS DISTINCT FROM OLD.valor THEN
      RAISE EXCEPTION 'Acesso negado: entregadores só podem alterar informações de entrega através da rota autorizada.';
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

-- --------------------------------------------------------------------
-- 5. REFINAMENTO DE RLS NA TABELA public.order_attachments
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view order attachments" ON public.order_attachments;
DROP POLICY IF EXISTS "Authenticated users can insert order attachments" ON public.order_attachments;
DROP POLICY IF EXISTS "Authenticated users can update order attachments" ON public.order_attachments;

-- Equipe interna enxerga todos os anexos de O.S.
CREATE POLICY "Staff can view all attachments"
  ON public.order_attachments
  FOR SELECT
  TO authenticated
  USING (
    COALESCE(public.get_user_role(auth.uid()), 'user') != 'entregador'
  );

-- Entregador enxerga exclusivamente anexos da O.S. que lhe está atribuída
CREATE POLICY "Drivers can view only assigned order attachments"
  ON public.order_attachments
  FOR SELECT
  TO authenticated
  USING (
    public.get_user_role(auth.uid()) = 'entregador'
    AND EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_attachments.order_id
        AND orders.entregador_id = auth.uid()
    )
  );

-- Equipe interna pode inserir anexos em qualquer O.S.
CREATE POLICY "Staff can insert attachments"
  ON public.order_attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    COALESCE(public.get_user_role(auth.uid()), 'user') != 'entregador'
  );

-- Entregador só pode inserir anexo na O.S. que lhe está atribuída
CREATE POLICY "Drivers can insert attachments for assigned order"
  ON public.order_attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_user_role(auth.uid()) = 'entregador'
    AND EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_attachments.order_id
        AND orders.entregador_id = auth.uid()
    )
  );
