-- ====================================================================
-- Primacor Gráfica - Módulo Gestão e Monitoramento de Entregas (v2)
-- Migration 05: Ajuste de RLS, RPC de máquina de estados e proteção contra adulteração
-- Arquivo: supabase/delivery_module_v2/05_delivery_rls_and_rpc_protection.sql
-- Status: PREPARADA PARA REVISÃO (NÃO APLICADA)
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. REFINAMENTO DE RLS NA TABELA public.orders
-- --------------------------------------------------------------------

-- 1.1 Documentação e remoção de políticas permissivas legadas:
-- A política legada "Authenticated users can view all orders" (USING: true de 20260218145019)
-- combinava via OR no PostgreSQL, permitindo que qualquer usuário autenticado (inclusive entregador)
-- visualizasse todas as ordens de serviço. Ela é revogada e substituída por separação estrita.
-- As políticas legadas de INSERT e UPDATE (de 20260614122744) permitiam qualquer auth.uid().
DROP POLICY IF EXISTS "Authenticated users can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can create orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can update orders" ON public.orders;

-- 1.2 Políticas de SELECT em public.orders:
-- Equipe interna (admin, coordenador, operador, vendedor, impressor, etc.) visualiza todas as ordens
-- para manter operação fluida de PCP, produção, faturamento e expedição.
DROP POLICY IF EXISTS "Staff can view all orders" ON public.orders;
CREATE POLICY "Staff can view all orders"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    COALESCE(public.get_user_role(auth.uid()), 'user') != 'entregador'
  );

-- Entregador visualiza exclusivamente as O.S. que lhe foram expressamente atribuídas
DROP POLICY IF EXISTS "Drivers can view only assigned orders" ON public.orders;
CREATE POLICY "Drivers can view only assigned orders"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    public.get_user_role(auth.uid()) = 'entregador'
    AND entregador_id = auth.uid()
  );

-- 1.3 Políticas de INSERT em public.orders:
-- Apenas equipe interna pode criar ordens. Entregadores são expressamente impedidos de criar ordens.
DROP POLICY IF EXISTS "Staff can create orders" ON public.orders;
CREATE POLICY "Staff can create orders"
  ON public.orders
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND COALESCE(public.get_user_role(auth.uid()), 'user') != 'entregador'
  );

-- 1.4 Políticas de UPDATE em public.orders:
-- Apenas equipe interna pode atualizar ordens diretamente via SQL/PostgREST.
-- Entregadores NÃO POSSUEM política de UPDATE direto em orders (default deny do RLS).
-- Qualquer alteração de status por entregadores DEVE passar pela RPC pública driver_update_delivery_status.
DROP POLICY IF EXISTS "Staff can update orders" ON public.orders;
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

-- (Nota: A política "Admins and coordinators can delete orders" de 20261013 é mantida intacta).

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
  v_driver_active BOOLEAN := FALSE;
  v_driver_name TEXT;
  v_current_order RECORD;
  v_is_entregador BOOLEAN := FALSE;
  v_is_gestor BOOLEAN := FALSE;
BEGIN
  -- 1. Identificação e autenticação do chamador
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sessão não autenticada.');
  END IF;

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

  IF v_driver_name IS NULL THEN
    SELECT COALESCE(nome, 'Entregador') INTO v_driver_name
    FROM public.profiles
    WHERE user_id = auth.uid();
  END IF;

  -- 3. Sanitização e limites de comprimento de campos de texto
  IF p_entregue_para IS NOT NULL AND length(trim(p_entregue_para)) > 150 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nome do recebedor excede o limite de 150 caracteres.');
  END IF;

  IF p_obs_entrega IS NOT NULL AND length(trim(p_obs_entrega)) > 1000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Observação de entrega excede o limite de 1000 caracteres.');
  END IF;

  IF p_motivo_insucesso IS NOT NULL AND length(trim(p_motivo_insucesso)) > 500 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Motivo do insucesso excede o limite de 500 caracteres.');
  END IF;

  -- 4. Bloqueio transacional de concorrência (SELECT ... FOR UPDATE)
  SELECT id, status_entrega, entregador_id, data_saida_entrega, data_chegada_entrega, entregue_em, entregue_para, entregue_por, obs_entrega
  INTO v_current_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ordem de serviço não encontrada.');
  END IF;

  -- 5. Se for entregador (e não gestor), valida rigorosamente a custódia da ordem
  IF NOT v_is_gestor THEN
    IF v_current_order.entregador_id IS DISTINCT FROM auth.uid() THEN
      RETURN jsonb_build_object('success', false, 'error', 'Esta ordem não está atribuída ao seu usuário de entregador.');
    END IF;
  END IF;

  -- 6. Imutabilidade de entregas já finalizadas (Terminal State Protection)
  IF COALESCE(v_current_order.status_entrega, 'pendente') = 'entregue' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta entrega já foi concluída e não pode mais ser alterada.');
  END IF;

  -- 7. Validação da Máquina de Estados Finita (FSM)
  IF p_new_status = 'em_rota' THEN
    IF COALESCE(v_current_order.status_entrega, 'pendente') NOT IN ('atribuido', 'pendente', 'insucesso') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Não é possível iniciar rota a partir do status atual (' || COALESCE(v_current_order.status_entrega, 'indefinido') || ').');
    END IF;

  ELSIF p_new_status = 'no_local' THEN
    IF COALESCE(v_current_order.status_entrega, 'pendente') != 'em_rota' THEN
      RETURN jsonb_build_object('success', false, 'error', 'A ordem deve estar em rota para marcar chegada no local.');
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

  -- 8. Atualização atômica exclusiva dos campos de entrega
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
  RETURN jsonb_build_object('success', false, 'error', 'Erro no banco (' || SQLSTATE || '): ' || SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.driver_update_delivery_status(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.driver_update_delivery_status(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.driver_update_delivery_status IS 'Atualiza com segurança o status de entrega garantindo FSM, row-locking FOR UPDATE e sanitização de dados.';

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
  v_driver_active BOOLEAN;
  v_driver_role TEXT;
  v_order_record RECORD;
  v_affected_rows INT;
BEGIN
  -- 1. Valida se o chamador possui perfil de gestão
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sessão não autenticada.');
  END IF;

  v_caller_role := public.get_user_role(auth.uid());
  IF v_caller_role NOT IN ('admin', 'coordenador') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas administradores e coordenadores podem atribuir entregadores.');
  END IF;

  -- 2. Concorrência e bloqueio: valida existência da ordem
  SELECT id, status_entrega, entregador_id
  INTO v_order_record
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ordem de serviço não encontrada.');
  END IF;

  -- 2.1 Imutabilidade de entregas já finalizadas
  IF v_order_record.status_entrega = 'entregue' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não é possível alterar a atribuição de uma entrega já concluída.');
  END IF;

  -- 2.2 Proteção contra desatribuição indevida com mercadoria em trânsito
  -- Impede que o gestor desatribua (p_entregador_id IS NULL) uma O.S. que já saiu para entrega ('em_rota' ou 'no_local').
  -- Se o motoboy teve um imprevisto/acidente, o gestor deve reatribuir diretamente a outro entregador ou registrar insucesso.
  IF p_entregador_id IS NULL AND v_order_record.status_entrega IN ('em_rota', 'no_local') THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Não é possível desatribuir uma entrega que já está em trânsito (' || v_order_record.status_entrega || '). Registre a ocorrência de insucesso ou reatribua diretamente a outro entregador ativo.'
    );
  END IF;

  -- 3. Se for informada atribuição de entregador, valida integridade cadastral e papel
  IF p_entregador_id IS NOT NULL THEN
    SELECT e.ativo, r.role
    INTO v_driver_active, v_driver_role
    FROM public.entregadores e
    LEFT JOIN public.user_roles r ON r.user_id = e.user_id
    WHERE e.user_id = p_entregador_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Entregador selecionado não possui cadastro de entregador.');
    END IF;

    IF v_driver_active IS NOT TRUE THEN
      RETURN jsonb_build_object('success', false, 'error', 'Entregador selecionado está inativo.');
    END IF;

    IF v_driver_role IS DISTINCT FROM 'entregador' THEN
      RETURN jsonb_build_object('success', false, 'error', 'O usuário indicado não possui o papel de entregador.');
    END IF;
  END IF;

  -- 4. Atualização da atribuição
  UPDATE public.orders
  SET
    entregador_id = p_entregador_id,
    status_entrega = CASE 
      WHEN p_entregador_id IS NOT NULL THEN 'atribuido' 
      ELSE 'pendente' 
    END,
    ordem_parada = CASE
      WHEN p_entregador_id IS NOT NULL THEN p_ordem_parada
      ELSE NULL
    END,
    empresa_entrega = CASE 
      WHEN p_entregador_id IS NOT NULL THEN 'Motoboy Primacor' 
      ELSE empresa_entrega 
    END,
    updated_at = now()
  WHERE id = p_order_id;

  GET DIAGNOSTICS v_affected_rows = ROW_COUNT;
  IF v_affected_rows = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nenhum registro foi atualizado.');
  END IF;

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'entregador_id', p_entregador_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', 'Erro no banco ao atribuir entregador (' || SQLSTATE || '): ' || SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.manager_assign_delivery_driver(UUID, UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manager_assign_delivery_driver(UUID, UUID, INT) TO authenticated;

COMMENT ON FUNCTION public.manager_assign_delivery_driver IS 'Atribui ou desatribui entregador com bloqueio FOR UPDATE e validação de papel e atividade.';

-- --------------------------------------------------------------------
-- 4. TRIGGER DE DEFESA EM PROFUNDIDADE CONTRA ADULTERAÇÃO
-- --------------------------------------------------------------------
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

  -- Se o chamador for do papel entregador, bloqueia qualquer tentativa de alteração
  -- que viole o isolamento de privilégios ou adultere dados comerciais/industriais
  IF v_role = 'entregador' THEN
    -- Entregador não pode reatribuir ordem nem assumir ordens de outros
    IF OLD.entregador_id IS NOT NULL AND NEW.entregador_id IS DISTINCT FROM OLD.entregador_id THEN
      RAISE EXCEPTION 'Acesso negado: entregadores não podem reatribuir ordens de serviço.';
    END IF;

    -- Entregador não pode alterar dados comerciais e de produção fundamentais
    IF NEW.cliente IS DISTINCT FROM OLD.cliente
       OR NEW.titulo IS DISTINCT FROM OLD.titulo
       OR NEW.descricao IS DISTINCT FROM OLD.descricao
       OR NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Acesso negado: entregadores não podem modificar dados industriais ou comerciais da O.S.';
    END IF;

    -- Entregador não pode reabrir entrega já finalizada
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

-- --------------------------------------------------------------------
-- 5. REFINAMENTO DE RLS NA TABELA public.order_attachments
-- --------------------------------------------------------------------
-- Remove todas as políticas antigas permissivas que concediam acesso sem filtrar papel
DROP POLICY IF EXISTS "Authenticated users can view order attachments" ON public.order_attachments;
DROP POLICY IF EXISTS "Authenticated users can insert order attachments" ON public.order_attachments;
DROP POLICY IF EXISTS "Authenticated users can update order attachments" ON public.order_attachments;
DROP POLICY IF EXISTS "Admins coordinators or uploader can delete order attachments" ON public.order_attachments;

-- Remove versões anteriores das novas políticas para permitir idempotência
DROP POLICY IF EXISTS "Staff can view all attachments" ON public.order_attachments;
DROP POLICY IF EXISTS "Drivers can view only assigned order attachments" ON public.order_attachments;
DROP POLICY IF EXISTS "Staff can insert attachments" ON public.order_attachments;
DROP POLICY IF EXISTS "Drivers can insert attachments for assigned order" ON public.order_attachments;
DROP POLICY IF EXISTS "Staff can update attachments" ON public.order_attachments;
DROP POLICY IF EXISTS "Staff can delete attachments" ON public.order_attachments;

-- 5.1 SELECT:
-- Equipe interna enxerga todos os anexos de O.S.
CREATE POLICY "Staff can view all attachments"
  ON public.order_attachments
  FOR SELECT
  TO authenticated
  USING (
    COALESCE(public.get_user_role(auth.uid()), 'user') != 'entregador'
  );

-- Entregador enxerga exclusivamente anexos da O.S. que lhe está expressamente atribuída
CREATE POLICY "Drivers can view only assigned order attachments"
  ON public.order_attachments
  FOR SELECT
  TO authenticated
  USING (
    public.get_user_role(auth.uid()) = 'entregador'
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_attachments.order_id
        AND o.entregador_id = auth.uid()
    )
  );

-- 5.2 INSERT:
-- Equipe interna pode inserir anexos em qualquer O.S.
CREATE POLICY "Staff can insert attachments"
  ON public.order_attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    COALESCE(public.get_user_role(auth.uid()), 'user') != 'entregador'
  );

-- Entregador só pode inserir comprovante na O.S. que lhe está atribuída e assinando criado_por
CREATE POLICY "Drivers can insert attachments for assigned order"
  ON public.order_attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_user_role(auth.uid()) = 'entregador'
    AND (criado_por IS NULL OR criado_por = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_attachments.order_id
        AND o.entregador_id = auth.uid()
    )
  );

-- 5.3 UPDATE:
-- Equipe interna pode atualizar metadados (ex: sincronização SharePoint)
CREATE POLICY "Staff can update attachments"
  ON public.order_attachments
  FOR UPDATE
  TO authenticated
  USING (
    COALESCE(public.get_user_role(auth.uid()), 'user') != 'entregador'
  )
  WITH CHECK (
    COALESCE(public.get_user_role(auth.uid()), 'user') != 'entregador'
  );
-- NOTA: Entregador NÃO possui política de UPDATE em order_attachments (imutabilidade dos comprovantes).

-- 5.4 DELETE:
-- Apenas gestores internos ou o criador interno podem remover anexos. Entregadores não podem deletar comprovantes.
CREATE POLICY "Staff can delete attachments"
  ON public.order_attachments
  FOR DELETE
  TO authenticated
  USING (
    COALESCE(public.get_user_role(auth.uid()), 'user') != 'entregador'
    AND (
      auth.uid() = criado_por 
      OR public.get_user_role(auth.uid()) IN ('admin', 'coordenador')
    )
  );
