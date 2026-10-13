-- ==================================================================
-- PRIMACOR - RESTAURAÇÃO COMPLETA DE USUÁRIOS, SENHAS E VENDEDORES
-- Projeto Supabase: zkpfuotxkdbokytqtjgj
-- Senha padrão para todos: primacor2026
-- Total: 30 Usuários | 6 Vendedores
-- ==================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Desativar temporariamente o trigger em auth.users para evitar conflito com profiles durante a restauração
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

DO $$
BEGIN

  -- ==================================================================
  -- 1. ALEXANDRE (alexandre@primacorgrafica.com.br) - Coordenador
  -- ==================================================================
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', '0d04088d-4e76-496f-84fd-61c5d8f8cb0e',
    'authenticated', 'authenticated', 'alexandre@primacorgrafica.com.br',
    crypt('primacor2026', gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('nome', 'Alexandre'), now(), now(), '', '', '', ''
  ) ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email, encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now()),
    raw_user_meta_data = EXCLUDED.raw_user_meta_data, updated_at = now();

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES ('0d04088d-4e76-496f-84fd-61c5d8f8cb0e', '0d04088d-4e76-496f-84fd-61c5d8f8cb0e',
    jsonb_build_object('sub', '0d04088d-4e76-496f-84fd-61c5d8f8cb0e', 'email', 'alexandre@primacorgrafica.com.br', 'email_verified', true),
    'email', '0d04088d-4e76-496f-84fd-61c5d8f8cb0e', now(), now(), now())
  ON CONFLICT (provider, provider_id) DO UPDATE SET identity_data = EXCLUDED.identity_data, updated_at = now();

  INSERT INTO public.profiles (user_id, nome, modulos_acesso, created_at)
  VALUES ('0d04088d-4e76-496f-84fd-61c5d8f8cb0e', 'Alexandre', '{}'::text[], now())
  ON CONFLICT (user_id) DO UPDATE SET nome = EXCLUDED.nome, modulos_acesso = EXCLUDED.modulos_acesso;

  INSERT INTO public.user_roles (user_id, role)
  VALUES ('0d04088d-4e76-496f-84fd-61c5d8f8cb0e', 'coordenador'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;


  -- ==================================================================
  -- 2. ANDRE (andre@primacorgrafica.com.br) - Coordenador
  -- ==================================================================
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', '937b3c41-feaf-4d48-8459-289337aa299c',
    'authenticated', 'authenticated', 'andre@primacorgrafica.com.br',
    crypt('primacor2026', gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('nome', 'Andre'), now(), now(), '', '', '', ''
  ) ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email, encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now()),
    raw_user_meta_data = EXCLUDED.raw_user_meta_data, updated_at = now();

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES ('937b3c41-feaf-4d48-8459-289337aa299c', '937b3c41-feaf-4d48-8459-289337aa299c',
    jsonb_build_object('sub', '937b3c41-feaf-4d48-8459-289337aa299c', 'email', 'andre@primacorgrafica.com.br', 'email_verified', true),
    'email', '937b3c41-feaf-4d48-8459-289337aa299c', now(), now(), now())
  ON CONFLICT (provider, provider_id) DO UPDATE SET identity_data = EXCLUDED.identity_data, updated_at = now();

  INSERT INTO public.profiles (user_id, nome, modulos_acesso, created_at)
  VALUES ('937b3c41-feaf-4d48-8459-289337aa299c', 'Andre', '{}'::text[], now())
  ON CONFLICT (user_id) DO UPDATE SET nome = EXCLUDED.nome, modulos_acesso = EXCLUDED.modulos_acesso;

  INSERT INTO public.user_roles (user_id, role)
  VALUES ('937b3c41-feaf-4d48-8459-289337aa299c', 'coordenador'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;


  -- ==================================================================
  -- 3. ARYANE (aryane@primacorgrafica.com.br) - Orçamentista
  -- ==================================================================
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', 'a760e12b-fb5b-4df7-8c3e-8542a1156f47',
    'authenticated', 'authenticated', 'aryane@primacorgrafica.com.br',
    crypt('primacor2026', gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('nome', 'Aryane'), now(), now(), '', '', '', ''
  ) ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email, encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now()),
    raw_user_meta_data = EXCLUDED.raw_user_meta_data, updated_at = now();

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES ('a760e12b-fb5b-4df7-8c3e-8542a1156f47', 'a760e12b-fb5b-4df7-8c3e-8542a1156f47',
    jsonb_build_object('sub', 'a760e12b-fb5b-4df7-8c3e-8542a1156f47', 'email', 'aryane@primacorgrafica.com.br', 'email_verified', true),
    'email', 'a760e12b-fb5b-4df7-8c3e-8542a1156f47', now(), now(), now())
  ON CONFLICT (provider, provider_id) DO UPDATE SET identity_data = EXCLUDED.identity_data, updated_at = now();

  INSERT INTO public.profiles (user_id, nome, modulos_acesso, created_at)
  VALUES ('a760e12b-fb5b-4df7-8c3e-8542a1156f47', 'Aryane', '{}'::text[], now())
  ON CONFLICT (user_id) DO UPDATE SET nome = EXCLUDED.nome, modulos_acesso = EXCLUDED.modulos_acesso;

  INSERT INTO public.user_roles (user_id, role)
  VALUES ('a760e12b-fb5b-4df7-8c3e-8542a1156f47', 'orcamentista'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;


  -- ==================================================================
  -- 4. BIANCA (bianca@primacorgrafica.com.br) - Vendedor
  -- ==================================================================
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', '3011f0f8-e3a7-4ba7-9d9c-11a39614bd60',
    'authenticated', 'authenticated', 'bianca@primacorgrafica.com.br',
    crypt('primacor2026', gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('nome', 'Bianca'), now(), now(), '', '', '', ''
  ) ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email, encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now()),
    raw_user_meta_data = EXCLUDED.raw_user_meta_data, updated_at = now();

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES ('3011f0f8-e3a7-4ba7-9d9c-11a39614bd60', '3011f0f8-e3a7-4ba7-9d9c-11a39614bd60',
    jsonb_build_object('sub', '3011f0f8-e3a7-4ba7-9d9c-11a39614bd60', 'email', 'bianca@primacorgrafica.com.br', 'email_verified', true),
    'email', '3011f0f8-e3a7-4ba7-9d9c-11a39614bd60', now(), now(), now())
  ON CONFLICT (provider, provider_id) DO UPDATE SET identity_data = EXCLUDED.identity_data, updated_at = now();

  INSERT INTO public.profiles (user_id, nome, modulos_acesso, created_at)
  VALUES ('3011f0f8-e3a7-4ba7-9d9c-11a39614bd60', 'Bianca', '{}'::text[], now())
  ON CONFLICT (user_id) DO UPDATE SET nome = EXCLUDED.nome, modulos_acesso = EXCLUDED.modulos_acesso;

  INSERT INTO public.user_roles (user_id, role)
  VALUES ('3011f0f8-e3a7-4ba7-9d9c-11a39614bd60', 'vendedor'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;


  -- ==================================================================
  -- 5. CARLOS (carlos@primacorgrafica.com.br) - Coordenador
  -- ==================================================================
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', '12610a1b-8862-4357-9272-948a35483532',
    'authenticated', 'authenticated', 'carlos@primacorgrafica.com.br',
    crypt('primacor2026', gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('nome', 'Carlos'), now(), now(), '', '', '', ''
  ) ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email, encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now()),
    raw_user_meta_data = EXCLUDED.raw_user_meta_data, updated_at = now();

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES ('12610a1b-8862-4357-9272-948a35483532', '12610a1b-8862-4357-9272-948a35483532',
    jsonb_build_object('sub', '12610a1b-8862-4357-9272-948a35483532', 'email', 'carlos@primacorgrafica.com.br', 'email_verified', true),
    'email', '12610a1b-8862-4357-9272-948a35483532', now(), now(), now())
  ON CONFLICT (provider, provider_id) DO UPDATE SET identity_data = EXCLUDED.identity_data, updated_at = now();

  INSERT INTO public.profiles (user_id, nome, modulos_acesso, created_at)
  VALUES ('12610a1b-8862-4357-9272-948a35483532', 'Carlos', '{}'::text[], now())
  ON CONFLICT (user_id) DO UPDATE SET nome = EXCLUDED.nome, modulos_acesso = EXCLUDED.modulos_acesso;

  INSERT INTO public.user_roles (user_id, role)
  VALUES ('12610a1b-8862-4357-9272-948a35483532', 'coordenador'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;


  -- ==================================================================
  -- 6. CLEO (cleo@primacorgrafica.com.br) - Orçamentista com Módulos
  -- ==================================================================
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', '7d7fc4d0-548d-4976-a324-87e51581110a',
    'authenticated', 'authenticated', 'cleo@primacorgrafica.com.br',
    crypt('primacor2026', gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('nome', 'Cleo'), now(), now(), '', '', '', ''
  ) ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email, encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now()),
    raw_user_meta_data = EXCLUDED.raw_user_meta_data, updated_at = now();

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES ('7d7fc4d0-548d-4976-a324-87e51581110a', '7d7fc4d0-548d-4976-a324-87e51581110a',
    jsonb_build_object('sub', '7d7fc4d0-548d-4976-a324-87e51581110a', 'email', 'cleo@primacorgrafica.com.br', 'email_verified', true),
    'email', '7d7fc4d0-548d-4976-a324-87e51581110a', now(), now(), now())
  ON CONFLICT (provider, provider_id) DO UPDATE SET identity_data = EXCLUDED.identity_data, updated_at = now();

  INSERT INTO public.profiles (user_id, nome, modulos_acesso, created_at)
  VALUES ('7d7fc4d0-548d-4976-a324-87e51581110a', 'Cleo', ARRAY['producao','trabalhos_concluidos','manutencao','cadastro','comercial','pcp','expedicao','dashboard','compras']::text[], now())
  ON CONFLICT (user_id) DO UPDATE SET nome = EXCLUDED.nome, modulos_acesso = EXCLUDED.modulos_acesso;

  INSERT INTO public.user_roles (user_id, role)
  VALUES ('7d7fc4d0-548d-4976-a324-87e51581110a', 'orcamentista'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;


  -- ==================================================================
  -- 7. COMERCIAL (comercial@primacorgrafica.com.br) - Coordenador
  -- ==================================================================
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', 'd3bce37a-3a3a-4557-8744-f5120b196bf7',
    'authenticated', 'authenticated', 'comercial@primacorgrafica.com.br',
    crypt('primacor2026', gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('nome', 'Comercial'), now(), now(), '', '', '', ''
  ) ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email, encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now()),
    raw_user_meta_data = EXCLUDED.raw_user_meta_data, updated_at = now();

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES ('d3bce37a-3a3a-4557-8744-f5120b196bf7', 'd3bce37a-3a3a-4557-8744-f5120b196bf7',
    jsonb_build_object('sub', 'd3bce37a-3a3a-4557-8744-f5120b196bf7', 'email', 'comercial@primacorgrafica.com.br', 'email_verified', true),
    'email', 'd3bce37a-3a3a-4557-8744-f5120b196bf7', now(), now(), now())
  ON CONFLICT (provider, provider_id) DO UPDATE SET identity_data = EXCLUDED.identity_data, updated_at = now();

  INSERT INTO public.profiles (user_id, nome, modulos_acesso, created_at)
  VALUES ('d3bce37a-3a3a-4557-8744-f5120b196bf7', 'Comercial', '{}'::text[], now())
  ON CONFLICT (user_id) DO UPDATE SET nome = EXCLUDED.nome, modulos_acesso = EXCLUDED.modulos_acesso;

  INSERT INTO public.user_roles (user_id, role)
  VALUES ('d3bce37a-3a3a-4557-8744-f5120b196bf7', 'coordenador'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;


  -- ==================================================================
  -- 8. CRISTINA (cristina@primacorgrafica.com.br) - Coordenador com Módulos
  -- ==================================================================
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', '4c8ef4bf-de82-42f4-b6bb-071ea62e705f',
    'authenticated', 'authenticated', 'cristina@primacorgrafica.com.br',
    crypt('primacor2026', gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('nome', 'Cristina'), now(), now(), '', '', '', ''
  ) ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email, encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now()),
    raw_user_meta_data = EXCLUDED.raw_user_meta_data, updated_at = now();

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES ('4c8ef4bf-de82-42f4-b6bb-071ea62e705f', '4c8ef4bf-de82-42f4-b6bb-071ea62e705f',
    jsonb_build_object('sub', '4c8ef4bf-de82-42f4-b6bb-071ea62e705f', 'email', 'cristina@primacorgrafica.com.br', 'email_verified', true),
    'email', '4c8ef4bf-de82-42f4-b6bb-071ea62e705f', now(), now(), now())
  ON CONFLICT (provider, provider_id) DO UPDATE SET identity_data = EXCLUDED.identity_data, updated_at = now();

  INSERT INTO public.profiles (user_id, nome, modulos_acesso, created_at)
  VALUES ('4c8ef4bf-de82-42f4-b6bb-071ea62e705f', 'Cristina', ARRAY['comercial','pcp','producao','expedicao','trabalhos_concluidos','compras','manutencao','dashboard']::text[], now())
  ON CONFLICT (user_id) DO UPDATE SET nome = EXCLUDED.nome, modulos_acesso = EXCLUDED.modulos_acesso;

  INSERT INTO public.user_roles (user_id, role)
  VALUES ('4c8ef4bf-de82-42f4-b6bb-071ea62e705f', 'coordenador'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;


  -- ==================================================================
  -- 9. DEBORAH (deborah@primacorgrafica.com.br) - Vendedor
  -- ==================================================================
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', '8713c922-2c4c-419e-ae73-0bc1c9ea989f',
    'authenticated', 'authenticated', 'deborah@primacorgrafica.com.br',
    crypt('primacor2026', gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('nome', 'deborah'), now(), now(), '', '', '', ''
  ) ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email, encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now()),
    raw_user_meta_data = EXCLUDED.raw_user_meta_data, updated_at = now();

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES ('8713c922-2c4c-419e-ae73-0bc1c9ea989f', '8713c922-2c4c-419e-ae73-0bc1c9ea989f',
    jsonb_build_object('sub', '8713c922-2c4c-419e-ae73-0bc1c9ea989f', 'email', 'deborah@primacorgrafica.com.br', 'email_verified', true),
    'email', '8713c922-2c4c-419e-ae73-0bc1c9ea989f', now(), now(), now())
  ON CONFLICT (provider, provider_id) DO UPDATE SET identity_data = EXCLUDED.identity_data, updated_at = now();

  INSERT INTO public.profiles (user_id, nome, modulos_acesso, created_at)
  VALUES ('8713c922-2c4c-419e-ae73-0bc1c9ea989f', 'deborah', '{}'::text[], now())
  ON CONFLICT (user_id) DO UPDATE SET nome = EXCLUDED.nome, modulos_acesso = EXCLUDED.modulos_acesso;

  INSERT INTO public.user_roles (user_id, role)
  VALUES ('8713c922-2c4c-419e-ae73-0bc1c9ea989f', 'vendedor'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;


  -- ==================================================================
  -- 10. DIGITAL / SARAIVA (digital@primacorgrafica.com.br) - Operador
  -- ==================================================================
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', '48251567-8f50-4fb7-b8c3-76491e5133b0',
    'authenticated', 'authenticated', 'digital@primacorgrafica.com.br',
    crypt('primacor2026', gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('nome', 'saraiva'), now(), now(), '', '', '', ''
  ) ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email, encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now()),
    raw_user_meta_data = EXCLUDED.raw_user_meta_data, updated_at = now();

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES ('48251567-8f50-4fb7-b8c3-76491e5133b0', '48251567-8f50-4fb7-b8c3-76491e5133b0',
    jsonb_build_object('sub', '48251567-8f50-4fb7-b8c3-76491e5133b0', 'email', 'digital@primacorgrafica.com.br', 'email_verified', true),
    'email', '48251567-8f50-4fb7-b8c3-76491e5133b0', now(), now(), now())
  ON CONFLICT (provider, provider_id) DO UPDATE SET identity_data = EXCLUDED.identity_data, updated_at = now();

  INSERT INTO public.profiles (user_id, nome, modulos_acesso, created_at)
  VALUES ('48251567-8f50-4fb7-b8c3-76491e5133b0', 'saraiva', '{}'::text[], now())
  ON CONFLICT (user_id) DO UPDATE SET nome = EXCLUDED.nome, modulos_acesso = EXCLUDED.modulos_acesso;

  INSERT INTO public.user_roles (user_id, role)
  VALUES ('48251567-8f50-4fb7-b8c3-76491e5133b0', 'operador'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;


  -- ==================================================================
  -- 11. DIOGO (diogo@primacorgrafica.com.br) - Admin
  -- ==================================================================
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', '31ae0aee-aa99-4ac0-b864-876f963b2f1f',
    'authenticated', 'authenticated', 'diogo@primacorgrafica.com.br',
    crypt('primacor2026', gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('nome', 'Diogo'), now(), now(), '', '', '', ''
  ) ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email, encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now()),
    raw_user_meta_data = EXCLUDED.raw_user_meta_data, updated_at = now();

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES ('31ae0aee-aa99-4ac0-b864-876f963b2f1f', '31ae0aee-aa99-4ac0-b864-876f963b2f1f',
    jsonb_build_object('sub', '31ae0aee-aa99-4ac0-b864-876f963b2f1f', 'email', 'diogo@primacorgrafica.com.br', 'email_verified', true),
    'email', '31ae0aee-aa99-4ac0-b864-876f963b2f1f', now(), now(), now())
  ON CONFLICT (provider, provider_id) DO UPDATE SET identity_data = EXCLUDED.identity_data, updated_at = now();

  INSERT INTO public.profiles (user_id, nome, modulos_acesso, created_at)
  VALUES ('31ae0aee-aa99-4ac0-b864-876f963b2f1f', 'Diogo', '{}'::text[], now())
  ON CONFLICT (user_id) DO UPDATE SET nome = EXCLUDED.nome, modulos_acesso = EXCLUDED.modulos_acesso;

  INSERT INTO public.user_roles (user_id, role)
  VALUES ('31ae0aee-aa99-4ac0-b864-876f963b2f1f', 'admin'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;


  -- ==================================================================
  -- 12. ELANA (elana@primacorgrafica.com.br) - Orçamentista
  -- ==================================================================
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', 'a2a24a41-12d6-480f-823f-b4f1429488b3',
    'authenticated', 'authenticated', 'elana@primacorgrafica.com.br',
    crypt('primacor2026', gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('nome', 'Elana'), now(), now(), '', '', '', ''
  ) ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email, encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now()),
    raw_user_meta_data = EXCLUDED.raw_user_meta_data, updated_at = now();

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES ('a2a24a41-12d6-480f-823f-b4f1429488b3', 'a2a24a41-12d6-480f-823f-b4f1429488b3',
    jsonb_build_object('sub', 'a2a24a41-12d6-480f-823f-b4f1429488b3', 'email', 'elana@primacorgrafica.com.br', 'email_verified', true),
    'email', 'a2a24a41-12d6-480f-823f-b4f1429488b3', now(), now(), now())
  ON CONFLICT (provider, provider_id) DO UPDATE SET identity_data = EXCLUDED.identity_data, updated_at = now();

  INSERT INTO public.profiles (user_id, nome, modulos_acesso, created_at)
  VALUES ('a2a24a41-12d6-480f-823f-b4f1429488b3', 'Elana', '{}'::text[], now())
  ON CONFLICT (user_id) DO UPDATE SET nome = EXCLUDED.nome, modulos_acesso = EXCLUDED.modulos_acesso;

  INSERT INTO public.user_roles (user_id, role)
  VALUES ('a2a24a41-12d6-480f-823f-b4f1429488b3', 'orcamentista'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;


  -- ==================================================================
  -- 13. EXPEDIÇÃO / LAILA (expedicao@primacorgrafica.com.br) - Coordenador
  -- ==================================================================
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', 'ef9f1161-93db-431e-9313-a3cfc8dd163a',
    'authenticated', 'authenticated', 'expedicao@primacorgrafica.com.br',
    crypt('primacor2026', gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('nome', 'Laila'), now(), now(), '', '', '', ''
  ) ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email, encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now()),
    raw_user_meta_data = EXCLUDED.raw_user_meta_data, updated_at = now();

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES ('ef9f1161-93db-431e-9313-a3cfc8dd163a', 'ef9f1161-93db-431e-9313-a3cfc8dd163a',
    jsonb_build_object('sub', 'ef9f1161-93db-431e-9313-a3cfc8dd163a', 'email', 'expedicao@primacorgrafica.com.br', 'email_verified', true),
    'email', 'ef9f1161-93db-431e-9313-a3cfc8dd163a', now(), now(), now())
  ON CONFLICT (provider, provider_id) DO UPDATE SET identity_data = EXCLUDED.identity_data, updated_at = now();

  INSERT INTO public.profiles (user_id, nome, modulos_acesso, created_at)
  VALUES ('ef9f1161-93db-431e-9313-a3cfc8dd163a', 'Laila', '{}'::text[], now())
  ON CONFLICT (user_id) DO UPDATE SET nome = EXCLUDED.nome, modulos_acesso = EXCLUDED.modulos_acesso;

  INSERT INTO public.user_roles (user_id, role)
  VALUES ('ef9f1161-93db-431e-9313-a3cfc8dd163a', 'coordenador'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;


  -- ==================================================================
  -- 14. FERNANDA (fernanda@primacorgrafica.com.br) - Orçamentista
  -- ==================================================================
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', '9e173520-a3cc-4ffc-9a40-44e0b795c120',
    'authenticated', 'authenticated', 'fernanda@primacorgrafica.com.br',
    crypt('primacor2026', gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('nome', 'Fernanda'), now(), now(), '', '', '', ''
  ) ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email, encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now()),
    raw_user_meta_data = EXCLUDED.raw_user_meta_data, updated_at = now();

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES ('9e173520-a3cc-4ffc-9a40-44e0b795c120', '9e173520-a3cc-4ffc-9a40-44e0b795c120',
    jsonb_build_object('sub', '9e173520-a3cc-4ffc-9a40-44e0b795c120', 'email', 'fernanda@primacorgrafica.com.br', 'email_verified', true),
    'email', '9e173520-a3cc-4ffc-9a40-44e0b795c120', now(), now(), now())
  ON CONFLICT (provider, provider_id) DO UPDATE SET identity_data = EXCLUDED.identity_data, updated_at = now();

  INSERT INTO public.profiles (user_id, nome, modulos_acesso, created_at)
  VALUES ('9e173520-a3cc-4ffc-9a40-44e0b795c120', 'Fernanda', '{}'::text[], now())
  ON CONFLICT (user_id) DO UPDATE SET nome = EXCLUDED.nome, modulos_acesso = EXCLUDED.modulos_acesso;

  INSERT INTO public.user_roles (user_id, role)
  VALUES ('9e173520-a3cc-4ffc-9a40-44e0b795c120', 'orcamentista'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;


  -- ==================================================================
  -- 15. IGOR (igor@primacorgrafica.com.br) - Admin
  -- ==================================================================
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', '05a19ae2-8ff0-4f37-b63d-742cdf368883',
    'authenticated', 'authenticated', 'igor@primacorgrafica.com.br',
    crypt('primacor2026', gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('nome', 'Igor'), now(), now(), '', '', '', ''
  ) ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email, encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now()),
    raw_user_meta_data = EXCLUDED.raw_user_meta_data, updated_at = now();

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES ('05a19ae2-8ff0-4f37-b63d-742cdf368883', '05a19ae2-8ff0-4f37-b63d-742cdf368883',
    jsonb_build_object('sub', '05a19ae2-8ff0-4f37-b63d-742cdf368883', 'email', 'igor@primacorgrafica.com.br', 'email_verified', true),
    'email', '05a19ae2-8ff0-4f37-b63d-742cdf368883', now(), now(), now())
  ON CONFLICT (provider, provider_id) DO UPDATE SET identity_data = EXCLUDED.identity_data, updated_at = now();

  INSERT INTO public.profiles (user_id, nome, modulos_acesso, created_at)
  VALUES ('05a19ae2-8ff0-4f37-b63d-742cdf368883', 'Igor', '{}'::text[], now())
  ON CONFLICT (user_id) DO UPDATE SET nome = EXCLUDED.nome, modulos_acesso = EXCLUDED.modulos_acesso;

  INSERT INTO public.user_roles (user_id, role)
  VALUES ('05a19ae2-8ff0-4f37-b63d-742cdf368883', 'admin'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;


  -- ==================================================================
  -- 16. JEFFERSON (jefferson@primacorgrafica.com.br) - Orçamentista
  -- ==================================================================
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', '2a7767fd-245e-4102-84f3-893eb12f5d95',
    'authenticated', 'authenticated', 'jefferson@primacorgrafica.com.br',
    crypt('primacor2026', gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('nome', 'Jefferson'), now(), now(), '', '', '', ''
  ) ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email, encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now()),
    raw_user_meta_data = EXCLUDED.raw_user_meta_data, updated_at = now();

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES ('2a7767fd-245e-4102-84f3-893eb12f5d95', '2a7767fd-245e-4102-84f3-893eb12f5d95',
    jsonb_build_object('sub', '2a7767fd-245e-4102-84f3-893eb12f5d95', 'email', 'jefferson@primacorgrafica.com.br', 'email_verified', true),
    'email', '2a7767fd-245e-4102-84f3-893eb12f5d95', now(), now(), now())
  ON CONFLICT (provider, provider_id) DO UPDATE SET identity_data = EXCLUDED.identity_data, updated_at = now();

  INSERT INTO public.profiles (user_id, nome, modulos_acesso, created_at)
  VALUES ('2a7767fd-245e-4102-84f3-893eb12f5d95', 'Jefferson', '{}'::text[], now())
  ON CONFLICT (user_id) DO UPDATE SET nome = EXCLUDED.nome, modulos_acesso = EXCLUDED.modulos_acesso;

  INSERT INTO public.user_roles (user_id, role)
  VALUES ('2a7767fd-245e-4102-84f3-893eb12f5d95', 'orcamentista'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;


  -- ==================================================================
  -- 17. KENIA (kenia@primacorgrafica.com.br) - Orçamentista
  -- ==================================================================
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', 'c1391467-29c6-4cae-a2b0-7d85eeede372',
    'authenticated', 'authenticated', 'kenia@primacorgrafica.com.br',
    crypt('primacor2026', gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('nome', 'Kenia'), now(), now(), '', '', '', ''
  ) ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email, encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now()),
    raw_user_meta_data = EXCLUDED.raw_user_meta_data, updated_at = now();

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES ('c1391467-29c6-4cae-a2b0-7d85eeede372', 'c1391467-29c6-4cae-a2b0-7d85eeede372',
    jsonb_build_object('sub', 'c1391467-29c6-4cae-a2b0-7d85eeede372', 'email', 'kenia@primacorgrafica.com.br', 'email_verified', true),
    'email', 'c1391467-29c6-4cae-a2b0-7d85eeede372', now(), now(), now())
  ON CONFLICT (provider, provider_id) DO UPDATE SET identity_data = EXCLUDED.identity_data, updated_at = now();

  INSERT INTO public.profiles (user_id, nome, modulos_acesso, created_at)
  VALUES ('c1391467-29c6-4cae-a2b0-7d85eeede372', 'Kenia', '{}'::text[], now())
  ON CONFLICT (user_id) DO UPDATE SET nome = EXCLUDED.nome, modulos_acesso = EXCLUDED.modulos_acesso;

  INSERT INTO public.user_roles (user_id, role)
  VALUES ('c1391467-29c6-4cae-a2b0-7d85eeede372', 'orcamentista'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;


  -- ==================================================================
  -- 18. LEO (leo@primacorgrafica.com.br) - Admin
  -- ==================================================================
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', '6f9213f6-49f8-4d3e-adc6-f026c7d353a1',
    'authenticated', 'authenticated', 'leo@primacorgrafica.com.br',
    crypt('primacor2026', gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('nome', 'Leonardo'), now(), now(), '', '', '', ''
  ) ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email, encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now()),
    raw_user_meta_data = EXCLUDED.raw_user_meta_data, updated_at = now();

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES ('6f9213f6-49f8-4d3e-adc6-f026c7d353a1', '6f9213f6-49f8-4d3e-adc6-f026c7d353a1',
    jsonb_build_object('sub', '6f9213f6-49f8-4d3e-adc6-f026c7d353a1', 'email', 'leo@primacorgrafica.com.br', 'email_verified', true),
    'email', '6f9213f6-49f8-4d3e-adc6-f026c7d353a1', now(), now(), now())
  ON CONFLICT (provider, provider_id) DO UPDATE SET identity_data = EXCLUDED.identity_data, updated_at = now();

  INSERT INTO public.profiles (user_id, nome, modulos_acesso, created_at)
  VALUES ('6f9213f6-49f8-4d3e-adc6-f026c7d353a1', 'Leonardo', '{}'::text[], now())
  ON CONFLICT (user_id) DO UPDATE SET nome = EXCLUDED.nome, modulos_acesso = EXCLUDED.modulos_acesso;

  INSERT INTO public.user_roles (user_id, role)
  VALUES ('6f9213f6-49f8-4d3e-adc6-f026c7d353a1', 'admin'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;


  -- ==================================================================
  -- 19. LEONARDO (leonardoenigma@hotmail.com) - Admin
  -- ==================================================================
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', '0926b9b3-fe98-4a45-b449-79ed850b469f',
    'authenticated', 'authenticated', 'leonardoenigma@hotmail.com',
    crypt('primacor2026', gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('nome', 'Leonardo'), now(), now(), '', '', '', ''
  ) ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email, encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now()),
    raw_user_meta_data = EXCLUDED.raw_user_meta_data, updated_at = now();

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES ('0926b9b3-fe98-4a45-b449-79ed850b469f', '0926b9b3-fe98-4a45-b449-79ed850b469f',
    jsonb_build_object('sub', '0926b9b3-fe98-4a45-b449-79ed850b469f', 'email', 'leonardoenigma@hotmail.com', 'email_verified', true),
    'email', '0926b9b3-fe98-4a45-b449-79ed850b469f', now(), now(), now())
  ON CONFLICT (provider, provider_id) DO UPDATE SET identity_data = EXCLUDED.identity_data, updated_at = now();

  INSERT INTO public.profiles (user_id, nome, modulos_acesso, created_at)
  VALUES ('0926b9b3-fe98-4a45-b449-79ed850b469f', 'Leonardo', '{}'::text[], now())
  ON CONFLICT (user_id) DO UPDATE SET nome = EXCLUDED.nome, modulos_acesso = EXCLUDED.modulos_acesso;

  INSERT INTO public.user_roles (user_id, role)
  VALUES ('0926b9b3-fe98-4a45-b449-79ed850b469f', 'admin'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;


  -- ==================================================================
  -- 20. MARCELO (marcelo@primacorgrafica.com.br) - Coordenador
  -- ==================================================================
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', '4bbfbed7-35cf-4301-b165-308799da633e',
    'authenticated', 'authenticated', 'marcelo@primacorgrafica.com.br',
    crypt('primacor2026', gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('nome', 'Marcelo'), now(), now(), '', '', '', ''
  ) ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email, encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now()),
    raw_user_meta_data = EXCLUDED.raw_user_meta_data, updated_at = now();

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES ('4bbfbed7-35cf-4301-b165-308799da633e', '4bbfbed7-35cf-4301-b165-308799da633e',
    jsonb_build_object('sub', '4bbfbed7-35cf-4301-b165-308799da633e', 'email', 'marcelo@primacorgrafica.com.br', 'email_verified', true),
    'email', '4bbfbed7-35cf-4301-b165-308799da633e', now(), now(), now())
  ON CONFLICT (provider, provider_id) DO UPDATE SET identity_data = EXCLUDED.identity_data, updated_at = now();

  INSERT INTO public.profiles (user_id, nome, modulos_acesso, created_at)
  VALUES ('4bbfbed7-35cf-4301-b165-308799da633e', 'Marcelo', '{}'::text[], now())
  ON CONFLICT (user_id) DO UPDATE SET nome = EXCLUDED.nome, modulos_acesso = EXCLUDED.modulos_acesso;

  INSERT INTO public.user_roles (user_id, role)
  VALUES ('4bbfbed7-35cf-4301-b165-308799da633e', 'coordenador'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;


  -- ==================================================================
  -- 21. OZEAS (ozeas@primacorgrafica.com.br) - Vendedor
  -- ==================================================================
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', 'dfcf8a88-b38f-4fa8-af2b-c36f69e56df2',
    'authenticated', 'authenticated', 'ozeas@primacorgrafica.com.br',
    crypt('primacor2026', gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('nome', 'Ozeas'), now(), now(), '', '', '', ''
  ) ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email, encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now()),
    raw_user_meta_data = EXCLUDED.raw_user_meta_data, updated_at = now();

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES ('dfcf8a88-b38f-4fa8-af2b-c36f69e56df2', 'dfcf8a88-b38f-4fa8-af2b-c36f69e56df2',
    jsonb_build_object('sub', 'dfcf8a88-b38f-4fa8-af2b-c36f69e56df2', 'email', 'ozeas@primacorgrafica.com.br', 'email_verified', true),
    'email', 'dfcf8a88-b38f-4fa8-af2b-c36f69e56df2', now(), now(), now())
  ON CONFLICT (provider, provider_id) DO UPDATE SET identity_data = EXCLUDED.identity_data, updated_at = now();

  INSERT INTO public.profiles (user_id, nome, modulos_acesso, created_at)
  VALUES ('dfcf8a88-b38f-4fa8-af2b-c36f69e56df2', 'Ozeas', '{}'::text[], now())
  ON CONFLICT (user_id) DO UPDATE SET nome = EXCLUDED.nome, modulos_acesso = EXCLUDED.modulos_acesso;

  INSERT INTO public.user_roles (user_id, role)
  VALUES ('dfcf8a88-b38f-4fa8-af2b-c36f69e56df2', 'vendedor'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;


  -- ==================================================================
  -- 22. PCP / ELANA (pcp@primacorgrafica.com.br) - Coordenador
  -- ==================================================================
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', '6eaa6d06-1ab5-4347-a677-8b5da0700274',
    'authenticated', 'authenticated', 'pcp@primacorgrafica.com.br',
    crypt('primacor2026', gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('nome', 'Elana'), now(), now(), '', '', '', ''
  ) ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email, encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now()),
    raw_user_meta_data = EXCLUDED.raw_user_meta_data, updated_at = now();

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES ('6eaa6d06-1ab5-4347-a677-8b5da0700274', '6eaa6d06-1ab5-4347-a677-8b5da0700274',
    jsonb_build_object('sub', '6eaa6d06-1ab5-4347-a677-8b5da0700274', 'email', 'pcp@primacorgrafica.com.br', 'email_verified', true),
    'email', '6eaa6d06-1ab5-4347-a677-8b5da0700274', now(), now(), now())
  ON CONFLICT (provider, provider_id) DO UPDATE SET identity_data = EXCLUDED.identity_data, updated_at = now();

  INSERT INTO public.profiles (user_id, nome, modulos_acesso, created_at)
  VALUES ('6eaa6d06-1ab5-4347-a677-8b5da0700274', 'Elana', '{}'::text[], now())
  ON CONFLICT (user_id) DO UPDATE SET nome = EXCLUDED.nome, modulos_acesso = EXCLUDED.modulos_acesso;

  INSERT INTO public.user_roles (user_id, role)
  VALUES ('6eaa6d06-1ab5-4347-a677-8b5da0700274', 'coordenador'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;


  -- ==================================================================
  -- 23. PCP2 / WELLINGTON FERREIRA (pcp2@primacorgrafica.com.br) - Coordenador
  -- ==================================================================
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', '916f93ad-ae84-4dee-86a4-38bd12daeb0a',
    'authenticated', 'authenticated', 'pcp2@primacorgrafica.com.br',
    crypt('primacor2026', gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('nome', 'Wellington Ferreira'), now(), now(), '', '', '', ''
  ) ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email, encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now()),
    raw_user_meta_data = EXCLUDED.raw_user_meta_data, updated_at = now();

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES ('916f93ad-ae84-4dee-86a4-38bd12daeb0a', '916f93ad-ae84-4dee-86a4-38bd12daeb0a',
    jsonb_build_object('sub', '916f93ad-ae84-4dee-86a4-38bd12daeb0a', 'email', 'pcp2@primacorgrafica.com.br', 'email_verified', true),
    'email', '916f93ad-ae84-4dee-86a4-38bd12daeb0a', now(), now(), now())
  ON CONFLICT (provider, provider_id) DO UPDATE SET identity_data = EXCLUDED.identity_data, updated_at = now();

  INSERT INTO public.profiles (user_id, nome, modulos_acesso, created_at)
  VALUES ('916f93ad-ae84-4dee-86a4-38bd12daeb0a', 'Wellington Ferreira', '{}'::text[], now())
  ON CONFLICT (user_id) DO UPDATE SET nome = EXCLUDED.nome, modulos_acesso = EXCLUDED.modulos_acesso;

  INSERT INTO public.user_roles (user_id, role)
  VALUES ('916f93ad-ae84-4dee-86a4-38bd12daeb0a', 'coordenador'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;


  -- ==================================================================
  -- 24. QUEIROZ (queiroz@primacorgrafica.com.br) - Coordenador
  -- ==================================================================
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', '77e02d83-a7b1-4641-9730-c604fff5075c',
    'authenticated', 'authenticated', 'queiroz@primacorgrafica.com.br',
    crypt('primacor2026', gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('nome', 'Leonardo Queiroz'), now(), now(), '', '', '', ''
  ) ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email, encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now()),
    raw_user_meta_data = EXCLUDED.raw_user_meta_data, updated_at = now();

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES ('77e02d83-a7b1-4641-9730-c604fff5075c', '77e02d83-a7b1-4641-9730-c604fff5075c',
    jsonb_build_object('sub', '77e02d83-a7b1-4641-9730-c604fff5075c', 'email', 'queiroz@primacorgrafica.com.br', 'email_verified', true),
    'email', '77e02d83-a7b1-4641-9730-c604fff5075c', now(), now(), now())
  ON CONFLICT (provider, provider_id) DO UPDATE SET identity_data = EXCLUDED.identity_data, updated_at = now();

  INSERT INTO public.profiles (user_id, nome, modulos_acesso, created_at)
  VALUES ('77e02d83-a7b1-4641-9730-c604fff5075c', 'Leonardo Queiroz', '{}'::text[], now())
  ON CONFLICT (user_id) DO UPDATE SET nome = EXCLUDED.nome, modulos_acesso = EXCLUDED.modulos_acesso;

  INSERT INTO public.user_roles (user_id, role)
  VALUES ('77e02d83-a7b1-4641-9730-c604fff5075c', 'coordenador'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;


  -- ==================================================================
  -- 25. RODRIGO (rodrigo@imprimaset.com.br) - User
  -- ==================================================================
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', '83cc1254-af29-45d3-a7e7-f7fecc6a6912',
    'authenticated', 'authenticated', 'rodrigo@imprimaset.com.br',
    crypt('primacor2026', gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('nome', 'rodrigo'), now(), now(), '', '', '', ''
  ) ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email, encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now()),
    raw_user_meta_data = EXCLUDED.raw_user_meta_data, updated_at = now();

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES ('83cc1254-af29-45d3-a7e7-f7fecc6a6912', '83cc1254-af29-45d3-a7e7-f7fecc6a6912',
    jsonb_build_object('sub', '83cc1254-af29-45d3-a7e7-f7fecc6a6912', 'email', 'rodrigo@imprimaset.com.br', 'email_verified', true),
    'email', '83cc1254-af29-45d3-a7e7-f7fecc6a6912', now(), now(), now())
  ON CONFLICT (provider, provider_id) DO UPDATE SET identity_data = EXCLUDED.identity_data, updated_at = now();

  INSERT INTO public.profiles (user_id, nome, modulos_acesso, created_at)
  VALUES ('83cc1254-af29-45d3-a7e7-f7fecc6a6912', 'rodrigo', '{}'::text[], now())
  ON CONFLICT (user_id) DO UPDATE SET nome = EXCLUDED.nome, modulos_acesso = EXCLUDED.modulos_acesso;

  INSERT INTO public.user_roles (user_id, role)
  VALUES ('83cc1254-af29-45d3-a7e7-f7fecc6a6912', 'user'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;


  -- ==================================================================
  -- 26. RODRIGO (rodrigo@primacorgrafica.com.br) - Coordenador
  -- ==================================================================
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', 'f0c17841-4235-4a48-be21-2e6473e29234',
    'authenticated', 'authenticated', 'rodrigo@primacorgrafica.com.br',
    crypt('primacor2026', gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('nome', 'rodrigo'), now(), now(), '', '', '', ''
  ) ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email, encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now()),
    raw_user_meta_data = EXCLUDED.raw_user_meta_data, updated_at = now();

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES ('f0c17841-4235-4a48-be21-2e6473e29234', 'f0c17841-4235-4a48-be21-2e6473e29234',
    jsonb_build_object('sub', 'f0c17841-4235-4a48-be21-2e6473e29234', 'email', 'rodrigo@primacorgrafica.com.br', 'email_verified', true),
    'email', 'f0c17841-4235-4a48-be21-2e6473e29234', now(), now(), now())
  ON CONFLICT (provider, provider_id) DO UPDATE SET identity_data = EXCLUDED.identity_data, updated_at = now();

  INSERT INTO public.profiles (user_id, nome, modulos_acesso, created_at)
  VALUES ('f0c17841-4235-4a48-be21-2e6473e29234', 'rodrigo', '{}'::text[], now())
  ON CONFLICT (user_id) DO UPDATE SET nome = EXCLUDED.nome, modulos_acesso = EXCLUDED.modulos_acesso;

  INSERT INTO public.user_roles (user_id, role)
  VALUES ('f0c17841-4235-4a48-be21-2e6473e29234', 'coordenador'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;


  -- ==================================================================
  -- 27. ROGÉRIO (rogerio@primacorgrafica.com.br) - Coordenador
  -- ==================================================================
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', '4adda301-df8c-427f-9f6f-02e2a939fb35',
    'authenticated', 'authenticated', 'rogerio@primacorgrafica.com.br',
    crypt('primacor2026', gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('nome', 'rogerio'), now(), now(), '', '', '', ''
  ) ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email, encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now()),
    raw_user_meta_data = EXCLUDED.raw_user_meta_data, updated_at = now();

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES ('4adda301-df8c-427f-9f6f-02e2a939fb35', '4adda301-df8c-427f-9f6f-02e2a939fb35',
    jsonb_build_object('sub', '4adda301-df8c-427f-9f6f-02e2a939fb35', 'email', 'rogerio@primacorgrafica.com.br', 'email_verified', true),
    'email', '4adda301-df8c-427f-9f6f-02e2a939fb35', now(), now(), now())
  ON CONFLICT (provider, provider_id) DO UPDATE SET identity_data = EXCLUDED.identity_data, updated_at = now();

  INSERT INTO public.profiles (user_id, nome, modulos_acesso, created_at)
  VALUES ('4adda301-df8c-427f-9f6f-02e2a939fb35', 'rogerio', '{}'::text[], now())
  ON CONFLICT (user_id) DO UPDATE SET nome = EXCLUDED.nome, modulos_acesso = EXCLUDED.modulos_acesso;

  INSERT INTO public.user_roles (user_id, role)
  VALUES ('4adda301-df8c-427f-9f6f-02e2a939fb35', 'coordenador'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;


  -- ==================================================================
  -- 28. RONALDO (ronaldo@primacorgrafica.com.br) - Vendedor
  -- ==================================================================
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', '09dfa978-8d68-47aa-8a81-14e9c6891ca1',
    'authenticated', 'authenticated', 'ronaldo@primacorgrafica.com.br',
    crypt('primacor2026', gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('nome', 'Ronaldo'), now(), now(), '', '', '', ''
  ) ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email, encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now()),
    raw_user_meta_data = EXCLUDED.raw_user_meta_data, updated_at = now();

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES ('09dfa978-8d68-47aa-8a81-14e9c6891ca1', '09dfa978-8d68-47aa-8a81-14e9c6891ca1',
    jsonb_build_object('sub', '09dfa978-8d68-47aa-8a81-14e9c6891ca1', 'email', 'ronaldo@primacorgrafica.com.br', 'email_verified', true),
    'email', '09dfa978-8d68-47aa-8a81-14e9c6891ca1', now(), now(), now())
  ON CONFLICT (provider, provider_id) DO UPDATE SET identity_data = EXCLUDED.identity_data, updated_at = now();

  INSERT INTO public.profiles (user_id, nome, modulos_acesso, created_at)
  VALUES ('09dfa978-8d68-47aa-8a81-14e9c6891ca1', 'Ronaldo', '{}'::text[], now())
  ON CONFLICT (user_id) DO UPDATE SET nome = EXCLUDED.nome, modulos_acesso = EXCLUDED.modulos_acesso;

  INSERT INTO public.user_roles (user_id, role)
  VALUES ('09dfa978-8d68-47aa-8a81-14e9c6891ca1', 'vendedor'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;


  -- ==================================================================
  -- 29. ROODS / RONALDO (roods@primacorgrafica.com.br) - Coordenador
  -- ==================================================================
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', '0346d288-54a0-4490-8843-c2c1eb97e12e',
    'authenticated', 'authenticated', 'roods@primacorgrafica.com.br',
    crypt('primacor2026', gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('nome', 'Ronaldo Roods'), now(), now(), '', '', '', ''
  ) ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email, encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now()),
    raw_user_meta_data = EXCLUDED.raw_user_meta_data, updated_at = now();

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES ('0346d288-54a0-4490-8843-c2c1eb97e12e', '0346d288-54a0-4490-8843-c2c1eb97e12e',
    jsonb_build_object('sub', '0346d288-54a0-4490-8843-c2c1eb97e12e', 'email', 'roods@primacorgrafica.com.br', 'email_verified', true),
    'email', '0346d288-54a0-4490-8843-c2c1eb97e12e', now(), now(), now())
  ON CONFLICT (provider, provider_id) DO UPDATE SET identity_data = EXCLUDED.identity_data, updated_at = now();

  INSERT INTO public.profiles (user_id, nome, modulos_acesso, created_at)
  VALUES ('0346d288-54a0-4490-8843-c2c1eb97e12e', 'Ronaldo Roods', '{}'::text[], now())
  ON CONFLICT (user_id) DO UPDATE SET nome = EXCLUDED.nome, modulos_acesso = EXCLUDED.modulos_acesso;

  INSERT INTO public.user_roles (user_id, role)
  VALUES ('0346d288-54a0-4490-8843-c2c1eb97e12e', 'coordenador'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;


  -- ==================================================================
  -- 30. WELL (well@primacorgrafica.com.br) - Vendedor
  -- ==================================================================
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', 'cac0c4fa-f98f-47fa-b16d-61a3e23e4408',
    'authenticated', 'authenticated', 'well@primacorgrafica.com.br',
    crypt('primacor2026', gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('nome', 'well'), now(), now(), '', '', '', ''
  ) ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email, encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now()),
    raw_user_meta_data = EXCLUDED.raw_user_meta_data, updated_at = now();

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES ('cac0c4fa-f98f-47fa-b16d-61a3e23e4408', 'cac0c4fa-f98f-47fa-b16d-61a3e23e4408',
    jsonb_build_object('sub', 'cac0c4fa-f98f-47fa-b16d-61a3e23e4408', 'email', 'well@primacorgrafica.com.br', 'email_verified', true),
    'email', 'cac0c4fa-f98f-47fa-b16d-61a3e23e4408', now(), now(), now())
  ON CONFLICT (provider, provider_id) DO UPDATE SET identity_data = EXCLUDED.identity_data, updated_at = now();

  INSERT INTO public.profiles (user_id, nome, modulos_acesso, created_at)
  VALUES ('cac0c4fa-f98f-47fa-b16d-61a3e23e4408', 'well', '{}'::text[], now())
  ON CONFLICT (user_id) DO UPDATE SET nome = EXCLUDED.nome, modulos_acesso = EXCLUDED.modulos_acesso;

  INSERT INTO public.user_roles (user_id, role)
  VALUES ('cac0c4fa-f98f-47fa-b16d-61a3e23e4408', 'vendedor'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;


  -- ==================================================================
  -- VENDEDORES
  -- ==================================================================
  INSERT INTO public.vendedores (id, nome, created_at)
  VALUES ('038515c4-27a6-4f2c-bed1-0d2efb37bd27', 'Bianca', '2026-03-09T14:01:15.174785+00:00')
  ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome;

  INSERT INTO public.vendedores (id, nome, created_at)
  VALUES ('46d8d35f-e44d-4b8c-be9f-e070d621c1d7', 'Wellington', '2026-03-09T14:01:15.174785+00:00')
  ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome;

  INSERT INTO public.vendedores (id, nome, created_at)
  VALUES ('43480e02-a9a4-4242-bd41-163c16f0c938', 'Ronaldo', '2026-03-09T14:24:38.627013+00:00')
  ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome;

  INSERT INTO public.vendedores (id, nome, created_at)
  VALUES ('a83466ee-67af-4798-b399-0c3e33e9f0d5', 'Primacor', '2026-03-09T14:24:38.627013+00:00')
  ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome;

  INSERT INTO public.vendedores (id, nome, created_at)
  VALUES ('3ec50a98-7bca-4dc6-a689-0956daa0cb38', 'Ozeas', '2026-03-09T14:01:15.174785+00:00')
  ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome;

  INSERT INTO public.vendedores (id, nome, created_at)
  VALUES ('05bbd42e-1b93-43cb-b3f5-fe8e7394ae31', 'Deborah', '2026-03-09T14:01:15.174785+00:00')
  ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome;

END $$;

-- Recriar trigger automático em auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

SELECT 'Restauração de 30 usuários e 6 vendedores finalizada com sucesso!' AS status;
