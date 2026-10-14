-- ==============================================================================
-- PRIMACOR GRÁFICA & EDITORA - SCRIPT PARA ZERAR TODOS OS CARDS DO SISTEMA
-- ==============================================================================
-- ATENÇÃO: Esta operação é IRREVERSÍVEL!
-- Ela apagará todos os cards de Ordens de Serviço (OS) e todas as Oportunidades do CRM,
-- zerando contadores e métricas para iniciar o sistema do zero absoluto.
--
-- O QUE SERÁ APAGADO:
-- 1. Todos os Cards de O.S. (Pré-impressão, Produção, Faturamento, Expedição, Arquivados)
-- 2. Histórico de status, setores e tempos de produção de todas as O.S.
-- 3. Todos os Cards de Oportunidades do Funil de Vendas Comercial (CRM)
-- 4. Todas as Propostas Comerciais, itens e orçamentos vinculados
-- 5. Todas as Atividades e históricos de follow-up do CRM
--
-- O QUE SERÁ PRESERVADO (INTACTO):
-- ✔ Usuários, Senhas, Perfis e Permissões (auth.users, profiles, user_roles)
-- ✔ Lista de Vendedores cadastrados (vendedores)
-- ✔ Lista de Equipamentos e Máquinas da Gráfica (equipamentos)
-- ✔ Configuração das Colunas/Etapas do Funil (crm_etapas_funil)
-- ✔ Chat interno e Avisos gerais do sistema
-- ==============================================================================

BEGIN;

-- 1. Limpeza das tabelas filhas e principais do CRM
TRUNCATE TABLE 
  public.crm_proposta_itens,
  public.crm_propostas,
  public.crm_atividades,
  public.crm_oportunidade_historico,
  public.crm_oportunidades
RESTART IDENTITY CASCADE;

-- 2. Limpeza das tabelas filhas e principais de Ordens de Serviço (OS)
TRUNCATE TABLE 
  public.sector_history,
  public.order_status_history,
  public.order_time_summary,
  public.orders
RESTART IDENTITY CASCADE;

COMMIT;

-- ==============================================================================
-- FIM DO SCRIPT: O sistema Kanban agora está 100% zerado e pronto para o reinício!
-- ==============================================================================
