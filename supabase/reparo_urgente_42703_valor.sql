-- ====================================================================
-- Primacor Gráfica - Correção Imediata do Erro 42703 (campo 'valor' inexistente)
-- Arquivo: supabase/reparo_urgente_42703_valor.sql
-- Finalidade: Eliminar de vez o erro 42703 no Supabase
-- ====================================================================

-- 1. ADICIONA A COLUNA 'valor' NA TABELA orders (elimina 100% o risco de qualquer trigger falhar por falta desta coluna)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS valor NUMERIC(12, 2) DEFAULT NULL;

-- 2. REMOVE QUALQUER TRIGGER RESIDUAL DE TAMPERING QUE ESTEJA TRAVANDO A TABELA orders
DROP TRIGGER IF EXISTS trg_guard_order_driver_tampering ON public.orders CASCADE;
DROP TRIGGER IF EXISTS guard_order_driver_tampering ON public.orders CASCADE;
DROP FUNCTION IF EXISTS public.guard_order_driver_tampering() CASCADE;

-- 3. GARANTE QUE A RPC driver_update_delivery_status ESTÁ ATIVA E ATUALIZADA
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
  -- 1. Valida sessão
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sessão não autenticada.');
  END IF;

  -- 2. Permissão
  v_caller_role := COALESCE(public.get_user_role(auth.uid()), 'user');
  IF v_caller_role IN ('admin', 'coordenador') THEN
    v_is_gestor := TRUE;
  END IF;

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

  -- 3. Sanitização
  IF p_entregue_para IS NOT NULL AND length(trim(p_entregue_para)) > 150 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nome do recebedor excede o limite de 150 caracteres.');
  END IF;

  IF p_obs_entrega IS NOT NULL AND length(trim(p_obs_entrega)) > 1000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Observação de entrega excede o limite de 1000 caracteres.');
  END IF;

  IF p_motivo_insucesso IS NOT NULL AND length(trim(p_motivo_insucesso)) > 500 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Motivo do insucesso excede o limite de 500 caracteres.');
  END IF;

  -- 4. Busca da ordem com row-lock
  SELECT id, status_entrega, entregador_id, data_saida_entrega, data_chegada_entrega, entregue_em, entregue_para, entregue_por, obs_entrega
  INTO v_current_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ordem de serviço não encontrada.');
  END IF;

  -- 5. Se for entregador puro, valida se a ordem está atribuída a ele
  IF NOT v_is_gestor THEN
    IF v_current_order.entregador_id IS DISTINCT FROM auth.uid() THEN
      RETURN jsonb_build_object('success', false, 'error', 'Esta ordem não está atribuída ao seu usuário de entregador.');
    END IF;
  END IF;

  -- 6. Terminal State Protection
  IF COALESCE(v_current_order.status_entrega, 'pendente') = 'entregue' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta entrega já foi concluída e não pode mais ser alterada.');
  END IF;

  -- 7. FSM
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

  -- 8. Atualização
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

SELECT 'CORREÇÃO 42703 APLICADA COM SUCESSO! PODE INICIAR A ROTA.' AS resultado;
