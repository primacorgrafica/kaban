-- ==============================================================================
-- SCRIPT DE CARGA / CENÁRIO DE TESTE PARA HOMOLOGAÇÃO
-- Arquivo: supabase/delivery_module_v2/seed_staging_delivery_test.sql
-- ATENÇÃO: EXECUTAR EXCLUSIVAMENTE NO PROJETO SUPABASE DE HOMOLOGAÇÃO (NUVEM).
-- NUNCA EXECUTAR EM PRODUÇÃO.
-- ==============================================================================

DO $$
DECLARE
  v_test_user_id UUID;
BEGIN
  -- Verificação de segurança: impede execução acidental se houver mais de 200 ordens
  IF (SELECT count(*) FROM public.orders) > 200 THEN
    RAISE EXCEPTION 'BLOQUEIO DE SEGURANÇA: Este banco aparenta ser de PRODUÇÃO (> 200 ordens). Abortando carga de teste.';
  END IF;

  -- 1. Localiza o usuário de teste previamente criado no Supabase Auth pelo gestor
  -- Nenhuma senha ou credencial fica armazenada no repositório de código.
  -- O gestor cria o usuário no painel do Supabase (Authentication > Users > Add User)
  -- com o e-mail 'motoboy.teste@primacorgrafica.com.br' e define senha temporária segura.
  SELECT id INTO v_test_user_id
  FROM auth.users
  WHERE email = 'motoboy.teste@primacorgrafica.com.br';

  IF v_test_user_id IS NULL THEN
    RAISE EXCEPTION 'PRÉ-REQUISITO PENDENTE: Usuário "motoboy.teste@primacorgrafica.com.br" não encontrado em auth.users. Crie-o previamente no Supabase Dashboard (Authentication > Users > Add User) com senha temporária segura antes de executar este seed.';
  END IF;

  -- 2. Insere ou atualiza motoboy na tabela public.entregadores vinculado ao user_id real
  INSERT INTO public.entregadores (
    user_id,
    nome_completo,
    telefone,
    placa_veiculo,
    modelo_veiculo,
    ativo,
    status
  ) VALUES (
    v_test_user_id,
    'Carlos Eduardo (Motoboy Teste)',
    '(31) 98765-4321',
    'BRA-2E19',
    'Honda CG 160 Cargo',
    true,
    'disponivel'
  )
  ON CONFLICT (user_id) DO UPDATE SET
    nome_completo = EXCLUDED.nome_completo,
    telefone = EXCLUDED.telefone,
    placa_veiculo = EXCLUDED.placa_veiculo,
    modelo_veiculo = EXCLUDED.modelo_veiculo,
    ativo = EXCLUDED.ativo;

  -- 3. Insere perfil e role correspondente no ambiente de homologação
  INSERT INTO public.profiles (user_id, nome, modulos_acesso)
  VALUES (
    v_test_user_id,
    'Carlos Eduardo Motoboy',
    ARRAY['entregador']
  )
  ON CONFLICT (user_id) DO UPDATE SET
    modulos_acesso = ARRAY['entregador'];

  DELETE FROM public.user_roles WHERE user_id = v_test_user_id;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    v_test_user_id,
    'entregador'
  )
  ON CONFLICT (user_id, role) DO NOTHING;

  -- 4. Cria 2 Ordens de Serviço de teste prontas para entrega vinculadas a este entregador
  INSERT INTO public.orders (
    id,
    titulo,
    cliente,
    descricao,
    setor,
    setor_status,
    arquivado,
    entrega_data_limite,
    entrega_endereco,
    endereco_entrega,
    entregador_id,
    status_entrega,
    ordem_parada,
    vendedor,
    destinatario,
    destino_latitude,
    destino_longitude,
    geocoding_status
  ) VALUES (
    'c0000000-0000-0000-0000-000000000001',
    '99001',
    'FARMÁCIA CENTRAL DROGARIAS LTDA',
    '5.000 un. Caixas de Medicamentos com Verniz Localizado',
    'expedicao',
    'aguardando_retirada',
    false,
    now() + interval '2 hours',
    'Av. Afonso Pena, 1500 - Centro, Belo Horizonte - MG, 30130-005',
    'Av. Afonso Pena, 1500 - Centro, Belo Horizonte - MG, 30130-005',
    v_test_user_id,
    'atribuido',
    1,
    'Marcos Vendas',
    'Dr. Roberto (Almoxarifado)',
    -19.9227,
    -43.9372,
    'geocodificado'
  ),
  (
    'c0000000-0000-0000-0000-000000000002',
    '99002',
    'LABORATÓRIOS BIOCLIN BRASIL',
    '2.500 un. Bulas Dobradas 4 Dobras Papel Bíblia 40g',
    'expedicao',
    'aguardando_retirada',
    false,
    now() + interval '4 hours',
    'Rua dos Guajajaras, 1200 - Barro Preto, Belo Horizonte - MG, 30180-101',
    'Rua dos Guajajaras, 1200 - Barro Preto, Belo Horizonte - MG, 30180-101',
    v_test_user_id,
    'atribuido',
    2,
    'Juliana Comercial',
    'Portaria 2 - Recebimento',
    -19.9234,
    -43.9456,
    'geocodificado'
  )
  ON CONFLICT (id) DO UPDATE SET
    status_entrega = EXCLUDED.status_entrega,
    entregador_id = EXCLUDED.entregador_id,
    ordem_parada = EXCLUDED.ordem_parada,
    destino_latitude = EXCLUDED.destino_latitude,
    destino_longitude = EXCLUDED.destino_longitude,
    geocoding_status = EXCLUDED.geocoding_status;

  -- 5. Insere 1 ponto de telemetria inicial para visualização imediata no mapa do gestor
  INSERT INTO public.entregador_posicoes (
    id,
    entregador_id,
    order_id,
    latitude,
    longitude,
    precisao_metros,
    velocidade_kmh,
    bateria_percentual
  ) VALUES (
    'd0000000-0000-0000-0000-000000000001',
    v_test_user_id,
    'c0000000-0000-0000-0000-000000000001',
    -19.9167,
    -43.9345,
    8.5,
    35.0,
    90
  )
  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE 'Cenário de teste de homologação aplicado com sucesso para o usuário %!', v_test_user_id;
END $$;

-- ==============================================================================
-- FIM DA CARGA DE TESTE
-- ==============================================================================
