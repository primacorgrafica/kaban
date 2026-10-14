-- ====================================================================
-- PRIMACOR GRÁFICA - MÓDULO FUNIL DE VENDAS & CRM COMERCIAL
-- Script de execução rápida para o Supabase SQL Editor
-- ====================================================================

-- 1. TABELA DE ETAPAS DO FUNIL COMERCIAL (CONFIGURÁVEL)
CREATE TABLE IF NOT EXISTS public.crm_etapas_funil (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  ordem INTEGER NOT NULL,
  cor TEXT NOT NULL DEFAULT '#06b6d4',
  tipo_sistema TEXT NOT NULL DEFAULT 'padrao' CHECK (tipo_sistema IN ('padrao', 'ganha', 'perdida', 'cancelada')),
  ativo BOOLEAN NOT NULL DEFAULT true,
  regras JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 2. TABELA DE CLIENTES (CENTRALIZADA PARA O CRM E VÍNCULO COM O KANBAN)
CREATE TABLE IF NOT EXISTS public.crm_clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_fantasia TEXT NOT NULL,
  razao_social TEXT,
  cnpj_cpf TEXT,
  contato_principal TEXT,
  cargo TEXT,
  telefone TEXT,
  whatsapp TEXT,
  email TEXT,
  cidade TEXT,
  uf TEXT DEFAULT 'MG',
  endereco TEXT,
  observacoes TEXT,
  criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3. TABELA DE OPORTUNIDADES / LEADS COMERCIAIS
CREATE TABLE IF NOT EXISTS public.crm_oportunidades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_sequencial SERIAL,
  codigo_identificador TEXT,
  titulo TEXT NOT NULL,
  cliente_id UUID REFERENCES public.crm_clientes(id) ON DELETE SET NULL,
  cliente_nome TEXT NOT NULL,
  contato_nome TEXT,
  contato_telefone TEXT,
  contato_email TEXT,
  origem_lead TEXT NOT NULL DEFAULT 'Outros',
  servico_solicitado TEXT NOT NULL,
  descricao_necessidade TEXT,
  valor_estimado NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  vendedor_id UUID,
  vendedor_nome TEXT,
  prioridade TEXT NOT NULL DEFAULT 'media' CHECK (prioridade IN ('baixa', 'media', 'alta', 'urgente')),
  etapa_id UUID NOT NULL REFERENCES public.crm_etapas_funil(id),
  posicao INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'fechada_ganha', 'fechada_perdida', 'cancelada', 'pausada')),
  motivo_perda TEXT,
  detalhes_motivo_perda TEXT,
  prazo_fechamento_previsto TIMESTAMP WITH TIME ZONE,
  proxima_acao_descricao TEXT,
  proxima_acao_data TIMESTAMP WITH TIME ZONE,
  data_ultimo_contato TIMESTAMP WITH TIME ZONE,
  anexos JSONB DEFAULT '[]'::jsonb,
  tags TEXT[] DEFAULT '{}'::text[],
  convertida_os_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  convertida_em TIMESTAMP WITH TIME ZONE,
  criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  atualizado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT uq_crm_oportunidade_os UNIQUE (convertida_os_id)
);

-- 4. TABELA DE PROPOSTAS COMERCIAIS & ORÇAMENTOS (COM VERSIONAMENTO E HISTÓRICO)
CREATE TABLE IF NOT EXISTS public.crm_propostas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oportunidade_id UUID NOT NULL REFERENCES public.crm_oportunidades(id) ON DELETE CASCADE,
  numero_proposta TEXT NOT NULL,
  versao_numero INTEGER NOT NULL DEFAULT 1,
  proposta_anterior_id UUID REFERENCES public.crm_propostas(id) ON DELETE SET NULL,
  valor_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  desconto_percentual NUMERIC(5, 2) DEFAULT 0.00,
  desconto_valor NUMERIC(12, 2) DEFAULT 0.00,
  valor_liquido NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  condicoes_pagamento TEXT,
  prazo_producao_dias INTEGER,
  validade_dias INTEGER DEFAULT 10,
  data_validade TIMESTAMP WITH TIME ZONE,
  data_envio TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'enviada', 'aguardando_aprovacao', 'aprovada', 'recusada', 'revisada')),
  observacoes TEXT,
  criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 5. TABELA DE ITENS E SERVIÇOS DA PROPOSTA
CREATE TABLE IF NOT EXISTS public.crm_proposta_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposta_id UUID NOT NULL REFERENCES public.crm_propostas(id) ON DELETE CASCADE,
  posicao INTEGER NOT NULL DEFAULT 0,
  descricao_item TEXT NOT NULL,
  formato_aberto TEXT,
  formato_fechado TEXT,
  papel_substrato TEXT,
  cores_impressao TEXT,
  acabamentos_especiais TEXT,
  quantidade INTEGER NOT NULL DEFAULT 1,
  preco_unitario NUMERIC(12, 4) NOT NULL DEFAULT 0.00,
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 6. TABELA DE ATIVIDADES E FOLLOW-UPS
CREATE TABLE IF NOT EXISTS public.crm_atividades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oportunidade_id UUID NOT NULL REFERENCES public.crm_oportunidades(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('ligacao', 'whatsapp', 'email', 'reuniao', 'envio_amostra', 'followup_orcamento', 'visita', 'outro')),
  titulo TEXT NOT NULL,
  descricao TEXT,
  data_agendada TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'concluido', 'cancelado')),
  resultado TEXT,
  responsavel_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  responsavel_nome TEXT,
  concluido_em TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 7. TABELA DE HISTÓRICO DE AUDITORIA DA OPORTUNIDADE
CREATE TABLE IF NOT EXISTS public.crm_oportunidade_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oportunidade_id UUID NOT NULL REFERENCES public.crm_oportunidades(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  usuario_nome TEXT,
  tipo_evento TEXT NOT NULL,
  descricao TEXT NOT NULL,
  dados_anteriores JSONB,
  dados_novos JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ÍNDICES DE PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_crm_oportunidades_etapa ON public.crm_oportunidades(etapa_id, posicao);
CREATE INDEX IF NOT EXISTS idx_crm_oportunidades_cliente ON public.crm_oportunidades(cliente_id);
CREATE INDEX IF NOT EXISTS idx_crm_oportunidades_vendedor ON public.crm_oportunidades(vendedor_id);
CREATE INDEX IF NOT EXISTS idx_crm_oportunidades_status ON public.crm_oportunidades(status);
CREATE INDEX IF NOT EXISTS idx_crm_oportunidades_proxima_acao ON public.crm_oportunidades(proxima_acao_data) WHERE status = 'aberta';
CREATE INDEX IF NOT EXISTS idx_crm_propostas_oportunidade ON public.crm_propostas(oportunidade_id, versao_numero DESC);
CREATE INDEX IF NOT EXISTS idx_crm_atividades_oportunidade ON public.crm_atividades(oportunidade_id, data_agendada);
CREATE INDEX IF NOT EXISTS idx_crm_atividades_pendentes ON public.crm_atividades(status, data_agendada) WHERE status = 'pendente';
CREATE INDEX IF NOT EXISTS idx_crm_clientes_busca ON public.crm_clientes(nome_fantasia, razao_social, cnpj_cpf);

-- TRIGGERS E FUNÇÕES AUXILIARES
CREATE OR REPLACE FUNCTION public.fn_crm_generate_opportunity_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.codigo_identificador IS NULL OR NEW.codigo_identificador = '' THEN
    NEW.codigo_identificador := 'OPT-' || TO_CHAR(COALESCE(NEW.created_at, now()), 'YYYY') || '-' || LPAD(NEW.numero_sequencial::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_generate_opportunity_code ON public.crm_oportunidades;
CREATE TRIGGER trg_crm_generate_opportunity_code
  BEFORE INSERT OR UPDATE ON public.crm_oportunidades
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_crm_generate_opportunity_code();

CREATE OR REPLACE FUNCTION public.fn_crm_sync_opportunity_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.status = 'concluido' THEN
      UPDATE public.crm_oportunidades
      SET data_ultimo_contato = COALESCE(NEW.concluido_em, now()),
          updated_at = now()
      WHERE id = NEW.oportunidade_id;
    ELSIF NEW.status = 'pendente' THEN
      UPDATE public.crm_oportunidades
      SET proxima_acao_descricao = NEW.titulo,
          proxima_acao_data = NEW.data_agendada,
          updated_at = now()
      WHERE id = NEW.oportunidade_id
        AND (proxima_acao_data IS NULL OR NEW.data_agendada <= proxima_acao_data);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_sync_opportunity_activity ON public.crm_atividades;
CREATE TRIGGER trg_crm_sync_opportunity_activity
  AFTER INSERT OR UPDATE ON public.crm_atividades
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_crm_sync_opportunity_activity();

-- Triggers de updated_at
CREATE TRIGGER update_crm_etapas_updated_at BEFORE UPDATE ON public.crm_etapas_funil FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_crm_clientes_updated_at BEFORE UPDATE ON public.crm_clientes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_crm_oportunidades_updated_at BEFORE UPDATE ON public.crm_oportunidades FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_crm_propostas_updated_at BEFORE UPDATE ON public.crm_propostas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_crm_atividades_updated_at BEFORE UPDATE ON public.crm_atividades FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- POPULAÇÃO INICIAL DAS ETAPAS DO FUNIL
INSERT INTO public.crm_etapas_funil (nome, ordem, cor, tipo_sistema)
VALUES
  ('Novo Lead', 1, '#3b82f6', 'padrao'),
  ('Primeiro Contato', 2, '#06b6d4', 'padrao'),
  ('Levantamento de Necessidades', 3, '#8b5cf6', 'padrao'),
  ('Orçamento em Elaboração', 4, '#f59e0b', 'padrao'),
  ('Orçamento Enviado', 5, '#ec4899', 'padrao'),
  ('Negociação', 6, '#f97316', 'padrao'),
  ('Venda Fechada', 7, '#10b981', 'ganha')
ON CONFLICT DO NOTHING;

-- ROW LEVEL SECURITY (RLS)
ALTER TABLE public.crm_etapas_funil ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_oportunidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_propostas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_proposta_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_atividades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_oportunidade_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_etapas_read" ON public.crm_etapas_funil FOR SELECT TO authenticated USING (true);
CREATE POLICY "crm_etapas_write" ON public.crm_etapas_funil FOR ALL TO authenticated
  USING (public.get_user_role(auth.uid()) IN ('admin', 'coordenador'))
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'coordenador'));

CREATE POLICY "crm_clientes_read" ON public.crm_clientes FOR SELECT TO authenticated USING (true);
CREATE POLICY "crm_clientes_insert" ON public.crm_clientes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "crm_clientes_update" ON public.crm_clientes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "crm_clientes_delete" ON public.crm_clientes FOR DELETE TO authenticated
  USING (public.get_user_role(auth.uid()) IN ('admin', 'coordenador'));

CREATE POLICY "crm_oportunidades_read" ON public.crm_oportunidades FOR SELECT TO authenticated USING (true);
CREATE POLICY "crm_oportunidades_insert" ON public.crm_oportunidades FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "crm_oportunidades_update" ON public.crm_oportunidades FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "crm_oportunidades_delete" ON public.crm_oportunidades FOR DELETE TO authenticated
  USING (public.get_user_role(auth.uid()) IN ('admin', 'coordenador'));

CREATE POLICY "crm_propostas_read" ON public.crm_propostas FOR SELECT TO authenticated USING (true);
CREATE POLICY "crm_propostas_insert" ON public.crm_propostas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "crm_propostas_update" ON public.crm_propostas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "crm_propostas_delete" ON public.crm_propostas FOR DELETE TO authenticated
  USING (public.get_user_role(auth.uid()) IN ('admin', 'coordenador'));

CREATE POLICY "crm_proposta_itens_read" ON public.crm_proposta_itens FOR SELECT TO authenticated USING (true);
CREATE POLICY "crm_proposta_itens_write" ON public.crm_proposta_itens FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "crm_atividades_read" ON public.crm_atividades FOR SELECT TO authenticated USING (true);
CREATE POLICY "crm_atividades_write" ON public.crm_atividades FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "crm_historico_read" ON public.crm_oportunidade_historico FOR SELECT TO authenticated USING (true);
CREATE POLICY "crm_historico_insert" ON public.crm_oportunidade_historico FOR INSERT TO authenticated WITH CHECK (true);

-- REALTIME
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'crm_oportunidades'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_etapas_funil;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_oportunidades;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_propostas;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_atividades;
  END IF;
END $$;
