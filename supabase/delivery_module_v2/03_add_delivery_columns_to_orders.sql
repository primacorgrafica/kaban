-- ====================================================================
-- Primacor Gráfica - Módulo Gestão e Monitoramento de Entregas (v2)
-- Migration 03: Adiciona exclusivamente os campos de entrega ausentes na tabela orders
-- Arquivo: supabase/delivery_module_v2/03_add_delivery_columns_to_orders.sql
-- Status: PREPARADA PARA REVISÃO (NÃO APLICADA)
-- ====================================================================

-- 1. ADIÇÃO DE CAMPOS ESTRITAMENTE NECESSÁRIOS
-- Preserva e reutiliza todos os campos já existentes no schema de produção:
-- (entrega_endereco, endereco_entrega, entrega_para, entrega_ac, destinatario,
--  entrega_data_limite, tipo_entrega, empresa_entrega, obs_entrega, protocolo,
--  nf, entregue_para, entregue_por, entregue_em, sharepoint_folder_id/url/name)

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS entregador_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status_entrega TEXT NOT NULL DEFAULT 'pendente' 
    CHECK (status_entrega IN ('pendente', 'atribuido', 'em_rota', 'no_local', 'entregue', 'insucesso')),
  ADD COLUMN IF NOT EXISTS ordem_parada INT,
  ADD COLUMN IF NOT EXISTS data_saida_entrega TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS data_chegada_entrega TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS motivo_insucesso TEXT,
  ADD COLUMN IF NOT EXISTS status_comprovante_sync TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status_comprovante_sync IN ('pendente', 'sincronizado', 'erro'));

-- 2. ÍNDICES DE ALTA PERFORMANCE PARA O MÓDULO DE ENTREGAS
CREATE INDEX IF NOT EXISTS idx_orders_entregador_id 
  ON public.orders(entregador_id) 
  WHERE entregador_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_status_entrega 
  ON public.orders(status_entrega);

CREATE INDEX IF NOT EXISTS idx_orders_entregador_status 
  ON public.orders(entregador_id, status_entrega) 
  WHERE entregador_id IS NOT NULL;

-- 3. COMENTÁRIOS DE DOCUMENTAÇÃO DE SCHEMA
COMMENT ON COLUMN public.orders.entregador_id IS 'ID do usuário entregador (motoboy) responsável pela entrega física';
COMMENT ON COLUMN public.orders.status_entrega IS 'Ciclo de vida logístico: pendente, atribuido, em_rota, no_local, entregue, insucesso';
COMMENT ON COLUMN public.orders.ordem_parada IS 'Ordem sequencial da parada na rota do motoboy (1, 2, 3...)';
COMMENT ON COLUMN public.orders.data_saida_entrega IS 'Momento em que o motoboy clicou em Iniciar Rota';
COMMENT ON COLUMN public.orders.data_chegada_entrega IS 'Momento em que o motoboy clicou em Cheguei no Local';
COMMENT ON COLUMN public.orders.motivo_insucesso IS 'Justificativa em caso de insucesso (ex: cliente ausente, endereço incorreto)';
COMMENT ON COLUMN public.orders.status_comprovante_sync IS 'Status de replicação do comprovante para o SharePoint: pendente, sincronizado, erro';
