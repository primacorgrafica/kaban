-- ==================================================================
-- PRIMACOR - RESTAURAÇÃO COMPLETA DE EQUIPAMENTOS
-- Projeto Supabase: zkpfuotxkdbokytqtjgj
-- Total: 22 Equipamentos
-- ==================================================================

DO $$
BEGIN

  -- Limpar equipamentos prévios para evitar duplicatas de migrações
  DELETE FROM public.equipamentos;

  INSERT INTO public.equipamentos (
    id, nome, created_at, codigo, setor, fabricante, modelo,
    ano_fabricacao, especificacoes, consumiveis, pecas_sobressalentes,
    manutencoes, apontamentos, operadores
  ) VALUES
    ('10fb9305-d51a-4769-afc7-2dc3e40239b7', 'ALCEADEIRA STITCHLINER 5500', '2026-04-14T10:25:01.94046+00:00', 'ALC1', 'Acabamento', 'HORIZON', 'STITCHLINER 5500', NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[]),
    ('99282c82-90c3-4f7a-898d-3e0f05b79cd4', 'CAPA DURA', '2026-06-17T09:50:57.254293+00:00', 'CAPA DURA', 'Acabamento', 'MCF', NULL, 2018, NULL, NULL, NULL, NULL, NULL, '{}'::text[]),
    ('1b71a83b-740b-4996-bb6d-3cdacc83ce04', 'CARTUCHEIRA 2', '2026-06-17T09:49:28.34788+00:00', 'CARTUCHEIRA 2', 'Acabamento', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[]),
    ('cca4102d-8d6b-4701-8f26-644ee8c305a1', 'CARTUCHEIRA DIAMOND', '2026-06-17T09:49:08.034245+00:00', 'CARTUCHEIRA 1', 'Acabamento', 'DIAMOND', '80 CM', NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[]),
    ('547d456b-e26c-41a5-8eda-ed55fd798215', 'COLADORA PUR', '2026-04-06T17:18:28.69077+00:00', 'PUR', 'Acabamento', 'HORIZON', 'BQ-470', NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[]),
    ('041f4a9b-5274-43a3-af68-65fa85c5905c', 'COMPRESSOR METALPLAN 10HP', '2026-04-23T16:28:01.514256+00:00', 'COMPRESSOR METALPLAN 10HP', 'Pré-Impressão', 'METALPLAN', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[]),
    ('9cffed64-d760-4406-b11d-93a7b4931d08', 'Comprssor Shulz 15HP', '2026-04-23T16:30:12.226636+00:00', 'Compressor Shulz 15HP', 'Pré-Impressão', 'SHULZ', 'SRP 3015 COMPACT', NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[]),
    ('ee0e7225-23eb-42b4-a54c-5e15d5c908af', 'CORTE VINCO ETERNA', '2026-06-05T19:22:24.278315+00:00', 'CVM ETERNA', 'Acabamento', 'ETERNA', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[]),
    ('6a9ef2b8-b734-4908-ac2a-46e735745977', 'CTP (IMPRIMASET)', '2026-04-14T13:10:03.011221+00:00', 'CTP1', 'Pré-Impressão', 'KODAK', 'TRENDSETTER 400', NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[]),
    ('fc3ab32c-003d-4b66-86c3-97074df9a9f6', 'DESTACADOR PNEUMÁTICO', '2026-06-11T09:59:34.469599+00:00', 'DESTACADOR', 'Acabamento', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[]),
    ('3ad641fb-775b-4d0d-9c02-a66217126abb', 'DIGITAL', '2026-03-09T18:05:00.704722+00:00', '', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[]),
    ('a729a5b8-32fd-4961-a6b9-a4aade33e8c9', 'DOBRADEIRA HEIDELBERG', '2026-06-10T17:12:53.438947+00:00', 'DOBRADEIRA HEIDELBERG', 'Acabamento', 'HEIDELBERG', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[]),
    ('be7716eb-2da5-4fbb-8ca6-07985287fa30', 'DOBRADEIRA HORIZON', '2026-05-25T16:55:42.58568+00:00', 'DOBHORIZON', 'Acabamento', 'HORIZON', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[]),
    ('8d2596ca-0144-4787-9521-d31a761ccdf6', 'EMPILHADEIRA ELÉTRICA', '2026-09-15T20:40:23.304296+00:00', 'EMPILHADEIRA ELÉTRICA', 'Expedição', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[]),
    ('5853b832-cc96-41aa-ba35-b124a64ca8b4', 'HOT STAMPING', '2026-05-05T16:31:24.800763+00:00', 'HOT', 'Acabamento', 'CATU', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[]),
    ('e5652de4-3d94-483b-8fea-1b62f152a5e6', 'KOMORI LITHRONE S29', '2026-03-09T12:55:35.13422+00:00', 'KOMS29', 'Off-Set', 'KOMORI', 'LITHRONE S29', 2013, NULL, 'BOTTCHER F1000 (LIMPEZA ROLO ÁGUA)', NULL, NULL, NULL, '{}'::text[]),
    ('b29a09ba-dbbb-46d3-9bb7-597ba28762a6', 'LAMINADORA PSG', '2026-04-09T16:45:21.224628+00:00', 'LAM1', 'Acabamento', 'PSG', '680', 2015, NULL, NULL, NULL, NULL, NULL, '{}'::text[]),
    ('efae52ef-8878-4d03-be57-3892e5d3f2ad', 'Laminadora Thinker', '2026-07-14T09:38:32.556012+00:00', 'Laminadora Thinker', 'Acabamento', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[]),
    ('4307a379-10a2-406a-aed1-6bf697143792', 'RYOBI 524 GE', '2026-03-09T12:55:35.13422+00:00', 'RYO524', 'Off-Set', 'RYOBI', '524 GE', 2012, NULL, NULL, NULL, NULL, NULL, '{}'::text[]),
    ('76c33a64-3847-4739-86f2-576ddbbd35f5', 'RYOBI 685', '2026-03-09T12:55:35.13422+00:00', 'RYO685', 'Off-Set', 'RYOBI', '685', 2003, NULL, NULL, NULL, NULL, NULL, '{}'::text[]),
    ('1aa86ae5-fdd4-4bd3-b3b4-cc0e0fc6225a', 'RYOBI 754', '2026-03-09T12:55:35.13422+00:00', 'RYOBI 754', 'Off-Set', 'RYOBI', '754', NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[]),
    ('35449754-1f53-49f8-9506-acb9a02000b9', 'Vincadeira', '2026-07-06T15:04:14.122388+00:00', 'Vincadeira', 'Acabamento', 'Horizon', 'CRF-362', NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[]);

END $$;

SELECT 'Restauração de 22 equipamentos finalizada com sucesso!' AS status;
