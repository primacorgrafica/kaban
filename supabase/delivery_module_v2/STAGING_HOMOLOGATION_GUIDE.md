# Guia de Homologação em Nuvem — Módulo de Entregas & Motoboys

Este documento descreve o procedimento operacional padrão para homologar o módulo de entregas em um projeto **Supabase na nuvem**, isolado e separado da produção, sem uso de Docker, Podman ou WSL.

---

## 1. Pré-Requisitos

1. Acesso ao painel web do Supabase ([app.supabase.com](https://app.supabase.com)).
2. Um projeto separado de **Homologação/Staging** (ex: `primacor-kaban-homolog`).
3. **NUNCA** execute estes passos no projeto de produção.

---

## 2. Ordem de Execução das Migrations (SQL Editor)

No painel do projeto de homologação, abra o **SQL Editor** e execute os arquivos na ordem estrita abaixo:

### Passo 1: Adicionar Papel 'entregador'
* **Arquivo**: `supabase/delivery_module_v2/01_add_role_entregador.sql`
* **Instrução**: Execute este comando de forma isolada, pois `ALTER TYPE ... ADD VALUE` exige autocommit no PostgreSQL.
* **Validação**: Verifique se o enum `app_role` contém o valor `'entregador'`.

### Passo 2: Criar Tabela de Motoboys
* **Arquivo**: `supabase/delivery_module_v2/02_create_entregadores_table.sql`
* **Resultado**: Cria `public.entregadores`, ativa RLS, índices e publicação no canal Realtime.

### Passo 3: Colunas Logísticas na Tabela de Ordens
* **Arquivo**: `supabase/delivery_module_v2/03_add_delivery_columns_to_orders.sql`
* **Resultado**: Adiciona `entregador_id`, `status_entrega`, `ordem_parada`, `data_saida_entrega`, `data_chegada_entrega`, `motivo_insucesso`, `status_comprovante_sync`.

### Passo 4: Telemetria GPS e Checkpoints
* **Arquivo**: `supabase/delivery_module_v2/04_create_entregador_posicoes.sql`
* **Resultado**: Cria `public.entregador_posicoes` e função de limpeza periódica de retenção (>= 7 dias).

### Passo 5: Políticas RLS e RPCs Seguras
* **Arquivo**: `supabase/delivery_module_v2/05_delivery_rls_and_rpc_protection.sql`
* **Resultado**:
  - Implanta RLS estrito: motoboys visualizam **apenas** suas próprias O.S. atribuídas e não visualizam dados fabris de PCP/Pré-Impressão.
  - Implanta a RPC `driver_update_delivery_status` com locking `FOR UPDATE` e proteção de estado terminal.
  - Implanta a RPC `manager_assign_delivery_driver` com trava de desatribuição em trânsito.
  - Implanta trigger `guard_order_driver_tampering` impedindo manipulação direta de colunas protegidas.

### Passo 6: Bucket de Comprovantes
* **Arquivo**: `supabase/delivery_module_v2/06_storage_comprovantes_bucket_setup.sql`
* **Resultado**: Cria o bucket privado `comprovantes-entrega` (10 MB, apenas JPG/PNG/WEBP/PDF) com RLS que restringe uploads ao entregador vinculado à ordem.

---

## 3. Verificação Automatizada de Segurança (SQL)

Execute no SQL Editor de homologação:
* **Arquivo**: `supabase/delivery_module_v2/delivery_security_tests.sql`
* **Propósito**: Executa **18 cenários de teste de segurança** cobrindo isolamento RLS, bloqueio de adulteração, regras de transição de status e permissões de storage.
* **Comportamento**: O script roda dentro de uma transação com `ROLLBACK;` automático ao final, sem poluir os dados. Todas as 18 asserções devem retornar `[PASS]`.

---

## 4. Carga do Cenário de Teste Prático

Após os testes de segurança aprovados, carregue os dados de simulação:
* **Arquivo**: `supabase/delivery_module_v2/seed_staging_delivery_test.sql`
* **Conteúdo Criado**:
  1. Motoboy teste: `Carlos Eduardo` (Placa: `BRA-2E19`).
  2. O.S. `#99001` (Parada 1): Farmácia Central Drogarias (Av. Paulista, 1578).
  3. O.S. `#99002` (Parada 2): Laboratórios Bioclin Brasil (Rua Vergueiro, 2000).
  4. 1 Ponto de telemetria GPS para visualização imediata no mapa do gestor.

---

## 5. Roteiro de Teste Funcional Ponta a Ponta

| Etapa | Perfil | Tela | Ação | Resultado Esperado |
| :--- | :--- | :--- | :--- | :--- |
| **1** | Gestor | `/entregas` | Clicar em **"Monitoramento"** | Abre o painel com o motoboy teste, contadores e ponto no mapa |
| **2** | Gestor | `/entregas` | Clicar em **"Atribuir"** na O.S. | Abre o modal de atribuição com lista de motoboys e campo de parada |
| **3** | Gestor | `/entregas` | Clicar em **"App Entregador"** | Abre a rota `/entregador` em nova aba |
| **4** | Motoboy | `/entregador` | Visualizar lista de entregas | Mostra `#99001` (Parada 1) e `#99002` (Parada 2) |
| **5** | Motoboy | `/entregador` | Clicar em **"Navegar (Google Maps)"** | Abre o Google Maps com o trajeto traçado |
| **6** | Motoboy | `/entregador` | Clicar em **"Iniciar Rota"** | Status muda para `em_rota` e registra GPS |
| **7** | Motoboy | `/entregador` | Clicar em **"Cheguei no Local"** | Status muda para `no_local` |
| **8** | Motoboy | `/entregador` | Clicar em **"Concluir Entrega"** | Abre modal, exige nome de quem recebeu, aceita foto do canhoto |
| **9** | Motoboy | `/entregador` | Confirmar conclusão | Status muda para `entregue`, salva comprovante e bloqueia edições posteriores |
| **10** | Gestor | `/entregas` | Abrir O.S. no Kanban / SlideOver | Aba "Entrega" exibe badge `Entregue`, data/hora e recebedor |

---

## 6. Procedimento de Rollback (Se Necessário)

Se por qualquer motivo for necessário desfazer a implantação no ambiente de homologação:
* **Arquivo**: `supabase/delivery_module_v2/rollback_delivery_module.sql`
* O script restaura as políticas anteriores de forma segura, removendo os componentes de entrega sem afetar as tabelas principais de produção.
