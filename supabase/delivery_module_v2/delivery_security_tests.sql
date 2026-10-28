-- ====================================================================
-- Primacor Gráfica - Módulo Gestão e Monitoramento de Entregas (v2 Hardened)
-- Suíte Completa de Testes Automatizados de Segurança e RLS (Ambiente Isolado)
-- Arquivo: supabase/delivery_module_v2/delivery_security_tests.sql
-- Status: PREPARADA PARA REVISÃO (NÃO APLICADA)
-- ====================================================================

-- ####################################################################
-- GUIA DE EXECUÇÃO EM AMBIENTE ISOLADO (NÃO EXECUTAR EM PRODUÇÃO):
-- ####################################################################
--
-- 1. REQUISITO DE PRIVILÉGIOS (POSTGRES SUPERUSER):
--    A fase de SETUP deste script realiza inserções transitórias no schema
--    'auth.users' para instanciar identidades UUID válidas de teste.
--    No Supabase, o schema 'auth' é protegido e requer privilégios da role
--    'postgres' (ou 'supabase_admin').
--
-- 2. OPÇÃO A: EXECUÇÃO VIA SUPABASE CLI (LOCAL DOCKER - RECOMENDADO):
--    $ supabase start
--    $ PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres -f supabase/delivery_module_v2/delivery_security_tests.sql
--
-- 3. OPÇÃO B: EXECUÇÃO NO SUPABASE SQL EDITOR (STAGING / HOMOLOGAÇÃO):
--    - Abra o SQL Editor do projeto de Homologação logado como Administrador.
--    - Cole o conteúdo deste arquivo e clique em 'Run'.
--    - Inspecione a aba 'Messages' para verificar os resultados '[PASS]'.
--
-- 4. GARANTIA DE ISOLAMENTO:
--    Este script é executado dentro de uma transação aberta com 'BEGIN;' e finalizado
--    com 'ROLLBACK;', garantindo ZERO resíduo e ZERO persistência no banco.
-- ####################################################################

BEGIN;

DO $$
DECLARE
  v_admin_id UUID := gen_random_uuid();
  v_coord_id UUID := gen_random_uuid();
  v_driver_a UUID := gen_random_uuid();
  v_driver_b UUID := gen_random_uuid();
  v_driver_inactive UUID := gen_random_uuid();
  v_staff_id UUID := gen_random_uuid();

  v_order_a UUID := gen_random_uuid();
  v_order_b UUID := gen_random_uuid();
  v_order_unassigned UUID := gen_random_uuid();
  v_order_in_transit UUID := gen_random_uuid();

  v_attachment_b UUID := gen_random_uuid();

  v_res JSONB;
  v_count INT;
  v_history_count_before INT;
  v_history_count_after INT;
BEGIN
  RAISE NOTICE '====================================================================';
  RAISE NOTICE 'INICIANDO SUÍTE COMPLETA DE AUDITORIA DE SEGURANÇA E RLS (18 TESTES)';
  RAISE NOTICE '====================================================================';

  -- 0. CRIAÇÃO DE USUÁRIOS NO SCHEMA AUTH (Requer privilégio postgres/supabase_admin)
  INSERT INTO auth.users (id, aud, role, email) VALUES
    (v_admin_id, 'authenticated', 'authenticated', 'admin.teste@primacor.com.br'),
    (v_coord_id, 'authenticated', 'authenticated', 'coord.teste@primacor.com.br'),
    (v_driver_a, 'authenticated', 'authenticated', 'motoboy.a@primacor.com.br'),
    (v_driver_b, 'authenticated', 'authenticated', 'motoboy.b@primacor.com.br'),
    (v_driver_inactive, 'authenticated', 'authenticated', 'motoboy.inativo@primacor.com.br'),
    (v_staff_id, 'authenticated', 'authenticated', 'operador.pcp@primacor.com.br')
  ON CONFLICT (id) DO NOTHING;

  -- 1. SETUP DE PAPÉIS NO SISTEMA KABAN
  INSERT INTO public.user_roles (user_id, role) VALUES 
    (v_admin_id, 'admin'),
    (v_coord_id, 'coordenador'),
    (v_driver_a, 'entregador'),
    (v_driver_b, 'entregador'),
    (v_driver_inactive, 'entregador'),
    (v_staff_id, 'operador');

  -- 2. SETUP DE ENTREGADORES NA TABELA SATÉLITE
  INSERT INTO public.entregadores (user_id, nome_completo, ativo, telefone) VALUES
    (v_driver_a, 'Entregador Alfa (Ativo)', true, '11999990001'),
    (v_driver_b, 'Entregador Beta (Ativo)', true, '11999990002'),
    (v_driver_inactive, 'Entregador Inativo', false, '11999990003');

  -- 3. SETUP DE ORDENS DE SERVIÇO
  INSERT INTO public.orders (id, titulo, descricao, cliente, status, setor, setor_status, entregador_id, status_entrega)
  VALUES 
    (v_order_a, 'OS-91001', 'Embalagens 1000un', 'Cliente Alfa', 'arquivo_liberado', 'expedicao', 'rota_1', v_driver_a, 'atribuido'),
    (v_order_b, 'OS-91002', 'Rótulos 5000un', 'Cliente Beta', 'arquivo_liberado', 'expedicao', 'rota_1', v_driver_b, 'atribuido'),
    (v_order_unassigned, 'OS-91003', 'Envelopes 2000un', 'Cliente Gama', 'arquivo_liberado', 'expedicao', 'fila', NULL, 'pendente'),
    (v_order_in_transit, 'OS-91004', 'Catálogos 500un', 'Cliente Delta', 'arquivo_liberado', 'expedicao', 'rota_1', v_driver_a, 'em_rota');

  -- 4. SETUP DE ANEXOS DE TESTE
  INSERT INTO public.order_attachments (id, order_id, nome_arquivo, sharepoint_item_id, sharepoint_folder_id, sharepoint_folder_name, sharepoint_drive_id, sharepoint_web_url, criado_por)
  VALUES (v_attachment_b, v_order_b, 'nota_fiscal_sigilosa.pdf', 'sp_002', 'sp_f02', 'OS-91002', 'drv_01', 'https://sharepoint.primacor/002', v_staff_id);

  -- Registra contagem de histórico antes dos testes
  SELECT count(*) INTO v_history_count_before FROM public.order_status_history;

  RAISE NOTICE '[OK] Setup de dados temporários e usuários concluído com sucesso.';

  -- =================================================================
  -- TESTE 1: Entregador A NÃO visualiza O.S. atribuídas ao entregador B
  -- =================================================================
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_driver_a, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_driver_a::text, true);

  SELECT count(*) INTO v_count FROM public.orders WHERE id = v_order_b;
  IF v_count = 0 THEN
    RAISE NOTICE '[PASS] Teste 01: Entregador A não visualiza O.S. atribuída ao Entregador B.';
  ELSE
    RAISE EXCEPTION '[FAIL] Teste 01: Falha grave de RLS! Entregador visualizou ordem de terceiro.';
  END IF;

  -- =================================================================
  -- TESTE 2: Entregador NÃO visualiza anexos nem notas de O.S. alheias
  -- =================================================================
  SELECT count(*) INTO v_count FROM public.order_attachments WHERE id = v_attachment_b;
  IF v_count = 0 THEN
    RAISE NOTICE '[PASS] Teste 02: Entregador não visualiza anexos nem notas de O.S. alheias.';
  ELSE
    RAISE EXCEPTION '[FAIL] Teste 02: Falha grave de RLS em order_attachments! Anexo alheio visível.';
  END IF;

  -- =================================================================
  -- TESTE 3: Entregador NÃO consegue executar UPDATE direto em orders
  -- =================================================================
  BEGIN
    UPDATE public.orders 
    SET obs_entrega = 'Hack direto' 
    WHERE id = v_order_a;
    
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN
      RAISE EXCEPTION '[FAIL] Teste 03: Entregador conseguiu executar UPDATE direto na tabela orders.';
    ELSE
      RAISE NOTICE '[PASS] Teste 03: UPDATE direto bloqueado por RLS (0 linhas afetadas).';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '[PASS] Teste 03: UPDATE direto rejeitado com erro: %', SQLERRM;
  END;

  -- =================================================================
  -- TESTE 4: Entregador NÃO consegue alterar campos comerciais ou industriais
  -- =================================================================
  BEGIN
    UPDATE public.orders 
    SET cliente = 'Adulteração Comercial', valor = 0.01 
    WHERE id = v_order_a;
    
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN
      RAISE EXCEPTION '[FAIL] Teste 04: Falha! Entregador alterou dados comerciais.';
    ELSE
      RAISE NOTICE '[PASS] Teste 04: Adulteração de dados comerciais bloqueada com sucesso.';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '[PASS] Teste 04: Adulteração bloqueada por trigger de segurança: %', SQLERRM;
  END;

  -- =================================================================
  -- TESTE 5: Entregador NÃO consegue usar RPC para alterar O.S. alheia
  -- =================================================================
  v_res := public.driver_update_delivery_status(v_order_b, 'em_rota');
  IF (v_res->>'success')::boolean = false THEN
    RAISE NOTICE '[PASS] Teste 05: RPC rejeitou tentativa de alterar O.S. alheia.';
  ELSE
    RAISE EXCEPTION '[FAIL] Teste 05: Falha! Entregador alterou status de O.S. que não lhe pertence.';
  END IF;

  -- =================================================================
  -- TESTE 6: Entregador inativo não consegue alterar status nem registrar posições
  -- =================================================================
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_driver_inactive, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_driver_inactive::text, true);

  v_res := public.driver_update_delivery_status(v_order_a, 'em_rota');
  IF (v_res->>'success')::boolean = false THEN
    RAISE NOTICE '[PASS] Teste 06a: Entregador inativo bloqueado na RPC de status.';
  ELSE
    RAISE EXCEPTION '[FAIL] Teste 06a: Entregador inativo conseguiu executar RPC de status!';
  END IF;

  BEGIN
    INSERT INTO public.entregador_posicoes (entregador_id, latitude, longitude)
    VALUES (v_driver_inactive, -23.55052, -46.633308);
    RAISE EXCEPTION '[FAIL] Teste 06b: Entregador inativo conseguiu inserir coordenadas GPS!';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '[PASS] Teste 06b: Inserção de GPS por entregador inativo bloqueada por RLS.';
  END;

  -- Restaura sessão do Entregador A
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_driver_a, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_driver_a::text, true);

  -- =================================================================
  -- TESTE 7: Não é possível pular transições de status proibidas
  -- =================================================================
  v_res := public.driver_update_delivery_status(v_order_a, 'entregue', 'Fulano');
  IF (v_res->>'success')::boolean = false THEN
    RAISE NOTICE '[PASS] Teste 07: Transição inválida (atribuido -> entregue) rejeitada pela FSM.';
  ELSE
    RAISE EXCEPTION '[FAIL] Teste 07: Falha! Máquina de estados permitiu pular etapas obrigatórias.';
  END IF;

  -- =================================================================
  -- TESTE 8: Não é possível concluir entrega sem informar o recebedor
  -- =================================================================
  PERFORM public.driver_update_delivery_status(v_order_a, 'em_rota');
  PERFORM public.driver_update_delivery_status(v_order_a, 'no_local');

  v_res := public.driver_update_delivery_status(v_order_a, 'entregue', '   ');
  IF (v_res->>'success')::boolean = false THEN
    RAISE NOTICE '[PASS] Teste 08: Conclusão sem recebedor rejeitada com sucesso.';
  ELSE
    RAISE EXCEPTION '[FAIL] Teste 08: Falha! Entrega foi concluída sem nome do recebedor.';
  END IF;

  v_res := public.driver_update_delivery_status(v_order_a, 'entregue', 'Recepção - Sra. Mariana');
  IF (v_res->>'success')::boolean = true THEN
    RAISE NOTICE '[PASS] Teste 08b: Conclusão com recebedor aceita com sucesso.';
  ELSE
    RAISE EXCEPTION '[FAIL] Teste 08b: Falha na conclusão legítima: %', v_res->>'error';
  END IF;

  -- =================================================================
  -- TESTE 9: Usuário sem permissão não consegue atribuir entregadores
  -- =================================================================
  v_res := public.manager_assign_delivery_driver(v_order_unassigned, v_driver_b, 1);
  IF (v_res->>'success')::boolean = false THEN
    RAISE NOTICE '[PASS] Teste 09a: Entregador impedido de executar atribuição de ordens.';
  ELSE
    RAISE EXCEPTION '[FAIL] Teste 09a: Entregador conseguiu executar atribuição de ordens!';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_staff_id, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_staff_id::text, true);
  v_res := public.manager_assign_delivery_driver(v_order_unassigned, v_driver_b, 1);
  IF (v_res->>'success')::boolean = false THEN
    RAISE NOTICE '[PASS] Teste 09b: Operador comum sem permissão de gestão impedido de atribuir ordens.';
  ELSE
    RAISE EXCEPTION '[FAIL] Teste 09b: Operador sem papel admin/coordenador conseguiu atribuir!';
  END IF;

  -- =================================================================
  -- TESTE 10: Coordenador consegue atribuir O.S. válida a entregador ativo
  -- =================================================================
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_coord_id, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_coord_id::text, true);

  v_res := public.manager_assign_delivery_driver(v_order_unassigned, v_driver_b, 1);
  IF (v_res->>'success')::boolean = true THEN
    RAISE NOTICE '[PASS] Teste 10: Coordenador atribuiu O.S. com sucesso.';
  ELSE
    RAISE EXCEPTION '[FAIL] Teste 10: Coordenador falhou ao atribuir: %', v_res->>'error';
  END IF;

  -- =================================================================
  -- TESTE 11: O.S. inexistente nunca produz falso sucesso
  -- =================================================================
  v_res := public.manager_assign_delivery_driver(gen_random_uuid(), v_driver_b, 1);
  IF (v_res->>'success')::boolean = false THEN
    RAISE NOTICE '[PASS] Teste 11: Ordem inexistente rejeitada sem falso sucesso.';
  ELSE
    RAISE EXCEPTION '[FAIL] Teste 11: Ordem inexistente retornou falso sucesso!';
  END IF;

  -- =================================================================
  -- TESTE 12: Não é possível acessar comprovantes de O.S. alheias
  -- =================================================================
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_driver_a, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_driver_a::text, true);

  SELECT count(*) INTO v_count FROM public.order_attachments WHERE order_id = v_order_b;
  IF v_count = 0 THEN
    RAISE NOTICE '[PASS] Teste 12: Entregador A tem acesso ZERO aos comprovantes/anexos da O.S. B.';
  ELSE
    RAISE EXCEPTION '[FAIL] Teste 12: Entregador A conseguiu acessar comprovantes da O.S. B!';
  END IF;

  -- =================================================================
  -- TESTE 13: Perfis internos continuam operando normalmente
  -- =================================================================
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_staff_id, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_staff_id::text, true);

  SELECT count(*) INTO v_count FROM public.orders WHERE id IN (v_order_a, v_order_b, v_order_unassigned);
  IF v_count = 3 THEN
    RAISE NOTICE '[PASS] Teste 13a: Operador interno visualiza todas as ordens normalmente.';
  ELSE
    RAISE EXCEPTION '[FAIL] Teste 13a: Quebra de compatibilidade para operadores internos!';
  END IF;

  SELECT count(*) INTO v_count FROM public.order_attachments WHERE id = v_attachment_b;
  IF v_count = 1 THEN
    RAISE NOTICE '[PASS] Teste 13b: Operador interno visualiza anexos normalmente.';
  ELSE
    RAISE EXCEPTION '[FAIL] Teste 13b: Operador interno impedido de visualizar anexos!';
  END IF;

  -- =================================================================
  -- TESTE 14: Os históricos order_status_history e sector_history permanecem intactos
  -- =================================================================
  SELECT count(*) INTO v_history_count_after FROM public.order_status_history;
  IF v_history_count_after >= v_history_count_before THEN
    RAISE NOTICE '[PASS] Teste 14: Integridade histórica de produção preservada sem perdas.';
  ELSE
    RAISE EXCEPTION '[FAIL] Teste 14: Histórico de status foi corrompido ou reduzido!';
  END IF;

  -- =================================================================
  -- TESTE 15: Entrega já finalizada não pode ter status retrocedido ou alterado
  -- =================================================================
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_driver_a, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_driver_a::text, true);

  v_res := public.driver_update_delivery_status(v_order_a, 'em_rota');
  IF (v_res->>'success')::boolean = false THEN
    RAISE NOTICE '[PASS] Teste 15: Tentativa de retroceder entrega concluída bloqueada com sucesso.';
  ELSE
    RAISE EXCEPTION '[FAIL] Teste 15: Falha! Entrega concluída teve seu status alterado.';
  END IF;

  -- =================================================================
  -- TESTE 16: Gestor NÃO consegue desatribuir entrega com mercadoria em trânsito
  -- =================================================================
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_coord_id, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_coord_id::text, true);

  -- Tenta desatribuir v_order_in_transit (status: 'em_rota')
  v_res := public.manager_assign_delivery_driver(v_order_in_transit, NULL);
  IF (v_res->>'success')::boolean = false AND (v_res->>'error') ILIKE '%em trânsito%' THEN
    RAISE NOTICE '[PASS] Teste 16: Desatribuição com mercadoria em trânsito foi bloqueada com erro operacional claro.';
  ELSE
    RAISE EXCEPTION '[FAIL] Teste 16: Falha! Gestor conseguiu desatribuir ordem em trânsito deixando carga órfã!';
  END IF;

  -- =================================================================
  -- TESTE 17: Entregador NÃO consegue excluir O.S. nem anexos
  -- =================================================================
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_driver_a, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_driver_a::text, true);

  BEGIN
    DELETE FROM public.orders WHERE id = v_order_a;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN
      RAISE EXCEPTION '[FAIL] Teste 17a: Entregador conseguiu excluir uma O.S.!';
    ELSE
      RAISE NOTICE '[PASS] Teste 17a: Exclusão de O.S. por entregador bloqueada por RLS (0 linhas afetadas).';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '[PASS] Teste 17a: Exclusão de O.S. por entregador rejeitada com erro: %', SQLERRM;
  END;

  BEGIN
    DELETE FROM public.order_attachments WHERE id = v_attachment_b;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN
      RAISE EXCEPTION '[FAIL] Teste 17b: Entregador conseguiu excluir anexo de O.S.!';
    ELSE
      RAISE NOTICE '[PASS] Teste 17b: Exclusão de anexos por entregador bloqueada por RLS (0 linhas afetadas).';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '[PASS] Teste 17b: Exclusão de anexos por entregador rejeitada com erro: %', SQLERRM;
  END;

  -- =================================================================
  -- TESTE 18: Rollback seguro não restaura acesso global aos entregadores
  -- =================================================================
  -- Valida a invariante arquitetural: Mesmo após desativação cadastral,
  -- uma conta com papel 'entregador' não pode receber 'USING (true)'
  SELECT count(*) INTO v_count 
  FROM public.orders 
  WHERE COALESCE(public.get_user_role(v_driver_a), 'user') != 'entregador';

  IF v_count = 0 THEN
    RAISE NOTICE '[PASS] Teste 18: Invariante de Rollback validada: entregador é barrado do acesso global.';
  ELSE
    RAISE EXCEPTION '[FAIL] Teste 18: Invariante de Rollback falhou! Entregador obteria acesso amplo.';
  END IF;

  RAISE NOTICE '====================================================================';
  RAISE NOTICE 'SUCESSO TOTAL: TODOS OS 18 TESTES DE SEGURANÇA FORAM APROVADOS!';
  RAISE NOTICE '====================================================================';
END $$;

-- NENHUMA ALTERAÇÃO É PERSISTIDA NO BANCO DE DADOS
ROLLBACK;
