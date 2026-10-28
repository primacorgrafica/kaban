-- ==============================================================================
-- SCRIPT DE CARGA / CENÁRIO DE TESTE PARA HOMOLOGAÇÃO
-- Arquivo: supabase/delivery_module_v2/seed_staging_delivery_test.sql
-- ATENÇÃO: EXECUTAR EXCLUSIVAMENTE NO PROJETO SUPABASE DE HOMOLOGAÇÃO (NUVEM).
-- NUNCA EXECUTAR EM PRODUÇÃO.
-- ==============================================================================

DO $$
BEGIN
  -- Verificação de segurança: impede execução acidental se houver mais de 50 ordens reais
  IF (SELECT count(*) FROM public.orders) > 200 THEN
    RAISE EXCEPTION 'BLOQUEIO DE SEGURANÇA: Este banco aparenta ser de PRODUÇÃO (> 200 ordens). Abortando carga de teste.';
  END IF;
END $$;

BEGIN;

-- 1. Cria ou atualiza usuário de teste para o motoboy (se auth.users permitir inserção direta em homologação)
-- Nota: Caso prefira criar o usuário via Dashboard do Supabase Auth:
--   E-mail: motoboy.teste@primacorgrafica.com.br
--   Senha:  SenhaTeste123!
--   Em seguida vincule o ID retornado na tabela entregadores.

-- 2. Insere ou atualiza motoboy na tabela public.entregadores
INSERT INTO public.entregadores (
  id,
  user_id,
  nome_completo,
  telefone,
  placa_veiculo,
  modelo_veiculo,
  ativo
) VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'Carlos Eduardo (Motoboy Teste Homologação)',
  '(11) 98765-4321',
  'BRA-2E19',
  'Honda CG 160 Cargo',
  true
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
  'b0000000-0000-0000-0000-000000000001',
  'Carlos Eduardo Motoboy',
  ARRAY['entregador']
)
ON CONFLICT (user_id) DO UPDATE SET
  modulos_acesso = ARRAY['entregador'];

INSERT INTO public.user_roles (user_id, role)
VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'entregador'
)
ON CONFLICT (user_id) DO UPDATE SET
  role = 'entregador';

-- 4. Cria 2 Ordens de Serviço de teste prontas para entrega
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
  destinatario
) VALUES (
  'c0000000-0000-0000-0000-000000000001',
  '99001',
  'FARMÁCIA CENTRAL DROGARIAS LTDA',
  '5.000 un. Caixas de Medicamentos com Verniz Localizado',
  'expedicao',
  'aguardando_retirada',
  false,
  now() + interval '2 hours',
  'Av. Paulista, 1578 - Bela Vista, São Paulo - SP, 01310-200',
  'Av. Paulista, 1578 - Bela Vista, São Paulo - SP, 01310-200',
  'b0000000-0000-0000-0000-000000000001',
  'atribuido',
  1,
  'Marcos Vendas',
  'Dr. Roberto (Almoxarifado)'
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
  'Rua Vergueiro, 2000 - Vila Mariana, São Paulo - SP, 04102-000',
  'Rua Vergueiro, 2000 - Vila Mariana, São Paulo - SP, 04102-000',
  'b0000000-0000-0000-0000-000000000001',
  'atribuido',
  2,
  'Juliana Comercial',
  'Portaria 2 - Recebimento'
)
ON CONFLICT (id) DO UPDATE SET
  status_entrega = EXCLUDED.status_entrega,
  entregador_id = EXCLUDED.entregador_id,
  ordem_parada = EXCLUDED.ordem_parada;

-- 5. Insere 1 ponto de telemetria inicial para verificação no painel de monitoramento
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
  'b0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001',
  -23.56168,
  -46.65598,
  8.5,
  38.0,
  92
)
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ==============================================================================
-- FIM DA CARGA DE TESTE
-- ==============================================================================
