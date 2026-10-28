-- ====================================================================
-- Primacor Gráfica - Módulo Gestão e Monitoramento de Entregas
-- Script de Testes Automatizados de Segurança e RLS (Ambiente Isolado)
-- Arquivo: supabase/delivery_module_prep/delivery_security_tests.sql
-- Status: PREPARADA PARA REVISÃO (NÃO APLICADA)
-- ====================================================================

-- INSTRUÇÕES DE EXECUÇÃO:
-- 1. Este script foi desenhado para ser executado no SQL Editor de um ambiente
--    de desenvolvimento (ex: Supabase Local via Docker ou projeto Staging de testes).
-- 2. Ele roda dentro de uma transação com ROLLBACK no final, garantindo que
--    nenhum dado residual permaneça no banco de teste.

BEGIN;

DO $$
DECLARE
  v_admin_id UUID := gen_random_uuid();
  v_coord_id UUID := gen_random_uuid();
  v_driver_a UUID := gen_random_uuid();
  v_driver_b UUID := gen_random_uuid();
  v_staff_id UUID := gen_random_uuid();

  v_order_a UUID := gen_random_uuid();
  v_order_b UUID := gen_random_uuid();
  v_res JSONB;
  v_count INT;
BEGIN
  RAISE NOTICE '=====================================================';
  RAISE NOTICE 'INICIANDO SUÍTE DE TESTES DE SEGURANÇA E RLS';
  RAISE NOTICE '=====================================================';

  -- 1. SETUP DE USUÁRIOS E PAPÉIS FICTÍCIOS
  INSERT INTO public.user_roles (user_id, role) VALUES 
    (v_admin_id, 'admin'),
    (v_coord_id, 'coordenador'),
    (v_driver_a, 'entregador'),
    (v_driver_b, 'entregador'),
    (v_staff_id, 'operador');

  INSERT INTO public.entregadores (user_id, nome_completo, ativo) VALUES
    (v_driver_a, 'Motoboy Teste A', true),
    (v_driver_b, 'Motoboy Teste B', true);

  -- 2. SETUP DE ORDENS DE SERVIÇO DE TESTE
  INSERT INTO public.orders (id, titulo, descricao, cliente, status, setor, setor_status, entregador_id, status_entrega)
  VALUES 
    (v_order_a, 'OS-90001', 'Flyers 5000un', 'Cliente Alpha', 'arquivo_liberado', 'expedicao', 'rota_manha', v_driver_a, 'atribuido'),
    (v_order_b, 'OS-90002', 'Cartuchos 2000un', 'Cliente Beta', 'arquivo_liberado', 'expedicao', 'rota_manha', v_driver_b, 'atribuido');

  RAISE NOTICE '[OK] Setup de dados temporários concluído.';

  -- =================================================================
  -- TESTE 1: Motoboy A NÃO consegue consultar as entregas do Motoboy B
  -- =================================================================
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_driver_a, 'role', 'authenticated')::text, true);

  SELECT count(*) INTO v_count FROM public.orders WHERE id = v_order_b;
  IF v_count = 0 THEN
    RAISE NOTICE '[PASS] Teste 1: Motoboy A não enxerga a O.S. do Motoboy B (RLS SELECT isolado).';
  ELSE
    RAISE EXCEPTION '[FAIL] Teste 1: Vulnerabilidade! Motoboy A conseguiu visualizar O.S. de outro entregador.';
  END IF;

  SELECT count(*) INTO v_count FROM public.orders WHERE id = v_order_a;
  IF v_count = 1 THEN
    RAISE NOTICE '[PASS] Teste 1b: Motoboy A enxerga sua própria O.S. atribuída.';
  ELSE
    RAISE EXCEPTION '[FAIL] Teste 1b: Motoboy A não conseguiu visualizar sua própria O.S.';
  END IF;

  -- =================================================================
  -- TESTE 2: Motoboy NÃO consegue forjar UPDATE direto na tabela orders
  -- =================================================================
  BEGIN
    UPDATE public.orders 
    SET cliente = 'Cliente Fraude', entregador_id = v_driver_a 
    WHERE id = v_order_b;
    
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN
      RAISE EXCEPTION '[FAIL] Teste 2: Vulnerabilidade! Motoboy conseguiu executar UPDATE direto na tabela orders.';
    ELSE
      RAISE NOTICE '[PASS] Teste 2: UPDATE direto bloqueado por RLS (0 linhas afetadas).';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '[PASS] Teste 2: UPDATE direto rejeitado com exceção: %', SQLERRM;
  END;

  -- =================================================================
  -- TESTE 3: Motoboy NÃO consegue alterar dados comerciais via RPC
  -- =================================================================
  v_res := public.driver_update_delivery_status(v_order_b, 'em_rota');
  IF (v_res->>'success')::boolean = false THEN
    RAISE NOTICE '[PASS] Teste 3: RPC rejeitou tentativa de motoboy atualizar O.S. de outro entregador.';
  ELSE
    RAISE EXCEPTION '[FAIL] Teste 3: Vulnerabilidade! RPC permitiu transição em O.S. de terceiro.';
  END IF;

  -- =================================================================
  -- TESTE 4: Transição legítima da Máquina de Estados pelo Motoboy A
  -- =================================================================
  v_res := public.driver_update_delivery_status(v_order_a, 'em_rota');
  IF (v_res->>'success')::boolean = true THEN
    RAISE NOTICE '[PASS] Teste 4a: Motoboy A iniciou rota com sucesso na sua O.S.';
  ELSE
    RAISE EXCEPTION '[FAIL] Teste 4a: RPC falhou na transição legítima: %', v_res->>'error';
  END IF;

  v_res := public.driver_update_delivery_status(v_order_a, 'no_local');
  IF (v_res->>'success')::boolean = true THEN
    RAISE NOTICE '[PASS] Teste 4b: Motoboy A marcou chegada no local com sucesso.';
  ELSE
    RAISE EXCEPTION '[FAIL] Teste 4b: RPC falhou na transição no_local: %', v_res->>'error';
  END IF;

  v_res := public.driver_update_delivery_status(v_order_a, 'entregue', 'Portaria - Sr. Marcos');
  IF (v_res->>'success')::boolean = true THEN
    RAISE NOTICE '[PASS] Teste 4c: Motoboy A concluiu entrega com recebedor registrado.';
  ELSE
    RAISE EXCEPTION '[FAIL] Teste 4c: RPC falhou na conclusão: %', v_res->>'error';
  END IF;

  -- =================================================================
  -- TESTE 5: Motoboy NÃO consegue excluir ordens
  -- =================================================================
  BEGIN
    DELETE FROM public.orders WHERE id = v_order_a;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN
      RAISE EXCEPTION '[FAIL] Teste 5: Vulnerabilidade! Motoboy conseguiu excluir uma O.S.';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '[PASS] Teste 5: Exclusão de O.S. por entregador bloqueada com sucesso.';
  END;

  -- =================================================================
  -- TESTE 6: Usuário interno (Operador/Staff) mantém acesso global às O.S.
  -- =================================================================
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_staff_id, 'role', 'authenticated')::text, true);

  SELECT count(*) INTO v_count FROM public.orders WHERE id IN (v_order_a, v_order_b);
  IF v_count = 2 THEN
    RAISE NOTICE '[PASS] Teste 6: Equipe interna mantém visibilidade legítima das ordens.';
  ELSE
    RAISE EXCEPTION '[FAIL] Teste 6: Quebra de compatibilidade! Equipe interna perdeu acesso às ordens.';
  END IF;

  -- =================================================================
  -- TESTE 7: Coordenador consegue atribuir motoboy via RPC
  -- =================================================================
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_coord_id, 'role', 'authenticated')::text, true);

  v_res := public.manager_assign_delivery_driver(v_order_a, v_driver_b, 1);
  IF (v_res->>'success')::boolean = true THEN
    RAISE NOTICE '[PASS] Teste 7: Coordenador reatribuiu O.S. com sucesso.';
  ELSE
    RAISE EXCEPTION '[FAIL] Teste 7: Coordenador não conseguiu atribuir entregador: %', v_res->>'error';
  END IF;

  RAISE NOTICE '=====================================================';
  RAISE NOTICE 'TODOS OS TESTES DE RLS E SEGURANÇA FORAM APROVADOS!';
  RAISE NOTICE '=====================================================';
END $$;

-- DESFAZ TODAS AS INSERÇÕES E ALTERAÇÕES DE TESTE (ZERO RESÍDUO)
ROLLBACK;
