# Roteiro Sequencial de Homologação em Nuvem — Módulo Entregas

> [!IMPORTANT]
> **Ambiente Exclusivo:** Realize os passos abaixo **apenas** no projeto Supabase de **Homologação/Staging**. Nunca execute em produção. Não requer Docker ou WSL.

---

## Passo 1: Executar as Migrations (Ordem Estrita no SQL Editor)

Acesse o painel do Supabase de Homologação ([app.supabase.com](https://app.supabase.com)), abra o **SQL Editor** e execute os arquivos na seguinte ordem:

1. **`01_add_role_entregador.sql`**
   - Adiciona o valor `'entregador'` ao enum `public.app_role`.
   - *Nota:* Execute individualmente fora de bloco de transação (`autocommit`).
2. **`02_create_entregadores_table.sql`**
   - Cria tabela `public.entregadores`, índices, RLS e habilita publicação em `supabase_realtime`.
3. **`03_add_delivery_columns_to_orders.sql`**
   - Adiciona colunas de entrega (`entregador_id`, `status_entrega`, `ordem_parada`, geolocalização e comprovantes).
4. **`04_create_entregador_posicoes.sql`**
   - Cria telemetria de posições em tempo real `public.entregador_posicoes` e rotina de purge.
5. **`05_delivery_rls_and_rpc_protection.sql`**
   - Restringe DELETE de ordens exclusivamente a administradores e coordenadores (`Admins and coordinators can delete orders`).
   - Bloqueia entregadores de excluir O.S. ou visualizar dados fabris de PCP/Pré-impressão.
   - Instala RPCs atômicas com locking: `driver_update_delivery_status` e `manager_assign_delivery_driver`.
6. **`06_storage_comprovantes_bucket_setup.sql`**
   - Cria o bucket privado `comprovantes-entrega` (10 MB máx, JPG/PNG/WEBP/PDF) com RLS atrelada à O.S. atribuída.

---

## Passo 2: Validar a Segurança (18 Testes Automatizados)

No SQL Editor, execute:
* **Arquivo**: `supabase/delivery_module_v2/delivery_security_tests.sql`
* **Resultado Esperado**:
  - Verifique na aba **Messages / Results** se todas as 18 validações retornaram `[PASS]`.
  - O script executa em transação protegida com `ROLLBACK;` automático ao final, sem gravar resíduos de teste no banco.

---

## Passo 3: Criar Usuário de Teste (Supabase Dashboard)

1. Acesse o menu **Authentication > Users** no painel do Supabase de Homologação.
2. Clique em **Add User > Create User**.
3. Preencha:
   - **Email:** `motoboy.teste@primacorgrafica.com.br`
   - **Password:** defina uma senha temporária da sua escolha.
   - **Auto Confirm User?**: Ativado.
4. Clique em **Create User**.

---

## Passo 4: Executar o Seed de Teste (Carga de Ordens)

No SQL Editor, execute:
* **Arquivo**: `supabase/delivery_module_v2/seed_staging_delivery_test.sql`
* **Resultado**:
  - Vincula o usuário criado à tabela `public.entregadores` e define sua role como `entregador` em `public.user_roles`.
  - Cria 2 O.S. de teste (#99001 e #99002) atribuídas ao entregador, já geocodificadas para rotas de Belo Horizonte.

---

## Passo 5: Teste Funcional na Aplicação

1. Conecte o frontend local ao projeto Supabase de Homologação (ajustando `.env.local` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`).
2. Acesse a rota `/entregador` e faça login com `motoboy.teste@primacorgrafica.com.br`.
3. Verifique:
   - **Isolamento:** Apenas as 2 ordens atribuídas são exibidas. Nenhuma O.S. de PCP/Pré-Impressão é visível.
   - **Telemetria:** Ao iniciar entrega, o hook `useRealGpsTracker` grava coordenadas em `entregador_posicoes`.
   - **Monitoramento:** No Kaban (logado como gestor), abra o modal de monitoramento e veja o traçado viário OSRM e o marcador do entregador.
   - **Finalização e Comprovante:** Capture a foto do canhoto; a foto é salva no bucket `comprovantes-entrega` e a Edge Function `sync-delivery-proof-to-sharepoint` valida JWT/permissões e sincroniza via Graph API App-Only.

---

## Passo 6: Reversão / Rollback (Se Necessário)

Caso precise reverter o módulo de homologação:
* **Arquivo**: `supabase/delivery_module_v2/rollback_delivery_module.sql`
