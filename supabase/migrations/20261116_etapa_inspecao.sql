-- ====================================================================
-- Primacor Gráfica - Nova Etapa do Kanban: INSPEÇÃO
-- Migration: 20261116_etapa_inspecao.sql
-- Fases: ENTRADA -> INSPEÇÃO -> PARADO -> SAÍDA -> EXPEDIÇÃO
-- Totalmente idempotente para execução direta no SQL Editor do Supabase
-- ====================================================================

-- 1. ADICIONA CAMPOS DE INSPEÇÃO NA TABELA ORDERS
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS inspecao_checklist JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS inspecao_fotos JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS inspecao_status TEXT DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS inspecao_motivo_parada TEXT;

-- 2. ADICIONA CATEGORIA NA TABELA ORDER_ATTACHMENTS
ALTER TABLE public.order_attachments
  ADD COLUMN IF NOT EXISTS categoria TEXT DEFAULT 'geral';

CREATE INDEX IF NOT EXISTS idx_order_attachments_categoria 
  ON public.order_attachments(order_id, categoria);

-- 3. TABELA DE RASTREABILIDADE E HISTÓRICO DE EVENTOS DA INSPEÇÃO
CREATE TABLE IF NOT EXISTS public.order_inspecao_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  tipo_evento TEXT NOT NULL CHECK (tipo_evento IN ('entrada', 'checklist_item', 'foto_anexada', 'foto_removida', 'parada', 'retomada', 'saida', 'envio_expedicao')),
  descricao TEXT NOT NULL,
  detalhes JSONB DEFAULT '{}'::jsonb,
  usuario_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  usuario_nome TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para histórico de inspeção
CREATE INDEX IF NOT EXISTS idx_order_inspecao_history_order_id 
  ON public.order_inspecao_history(order_id, created_at DESC);

-- Habilita Row Level Security (RLS)
ALTER TABLE public.order_inspecao_history ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso (idênticas a order_status_history e sector_history)
DROP POLICY IF EXISTS "Authenticated users can view order inspecao history" ON public.order_inspecao_history;
CREATE POLICY "Authenticated users can view order inspecao history" 
  ON public.order_inspecao_history 
  FOR SELECT 
  TO authenticated 
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert order inspecao history" ON public.order_inspecao_history;
CREATE POLICY "Authenticated users can insert order inspecao history" 
  ON public.order_inspecao_history 
  FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

-- Realtime para histórico de inspeção
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'order_inspecao_history'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_inspecao_history;
  END IF;
END $$;

-- 4. FUNÇÃO E TRIGGER DE VALIDAÇÃO ESTREITA NO BACKEND / API (PostgreSQL)
CREATE OR REPLACE FUNCTION public.validate_inspecao_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fotos_count INTEGER;
  v_chk JSONB;
  v_item JSONB;
  v_item_key TEXT;
  v_keys TEXT[] := ARRAY['etapas_executadas', 'qualidade_impressao', 'qualidade_acabamento', 'quantidade', 'rotulagem'];
  v_labels TEXT[] := ARRAY['Todas as etapas executadas', 'Qualidade Impressão', 'Qualidade acabamento', 'Quantidade', 'Rotulagem'];
  v_status TEXT;
  v_obs TEXT;
  v_motivo TEXT;
  i INTEGER;
BEGIN
  -- Apenas valida operações do setor 'inspecao'
  IF NEW.setor = 'inspecao' THEN
    
    -- REGRA 1: PARADO NA INSPEÇÃO EXIGE MOTIVO OBRIGATÓRIO (CAMPO PRÓPRIO OU OBSERVAÇÃO)
    IF NEW.setor_status = 'parado' THEN
      v_motivo := trim(COALESCE(NEW.inspecao_motivo_parada, NEW.observacao, ''));
      IF v_motivo = '' THEN
        RAISE EXCEPTION 'Ao mover para Parado na etapa Inspeção, o motivo é OBRIGATÓRIO.';
      END IF;
    END IF;

    -- REGRA 2: QUALQUER ITEM REPROVADO NO CHECKLIST EXIGE OBSERVAÇÃO OBRIGATÓRIA
    IF NEW.inspecao_checklist IS NOT NULL THEN
      v_chk := NEW.inspecao_checklist;
      FOR i IN 1..5 LOOP
        v_item_key := v_keys[i];
        v_item := v_chk -> v_item_key;
        IF v_item IS NOT NULL AND (v_item ->> 'status') = 'reprovado' THEN
          v_obs := trim(COALESCE(v_item ->> 'observacao', ''));
          IF v_obs = '' THEN
            RAISE EXCEPTION 'O item "%" foi marcado como Reprovado e exige observação obrigatória justificando a reprovação.', v_labels[i];
          END IF;
        END IF;
      END LOOP;
    END IF;

    -- REGRA 3: SAÍDA NA INSPEÇÃO EXIGE TODAS AS CONDIÇÕES VERDADEIRAS
    IF NEW.setor_status = 'saida' THEN
      v_chk := COALESCE(NEW.inspecao_checklist, '{}'::jsonb);

      -- a) Valida os 5 itens do checklist
      FOR i IN 1..5 LOOP
        v_item_key := v_keys[i];
        v_item := v_chk -> v_item_key;

        IF v_item IS NULL OR (v_item ->> 'status') IS NULL OR trim(v_item ->> 'status') = '' THEN
          RAISE EXCEPTION 'Não é permitido mover para Saída: O item "%" do checklist não foi respondido.', v_labels[i];
        END IF;

        v_status := v_item ->> 'status';
        IF v_status = 'reprovado' THEN
          RAISE EXCEPTION 'Não é permitido mover para Saída: O item "%" foi REPROVADO. A O.S. deve permanecer em Inspeção ou ir para Parado.', v_labels[i];
        END IF;

        IF v_status NOT IN ('aprovado', 'aprovado_restricao') THEN
          RAISE EXCEPTION 'Não é permitido mover para Saída: Status inválido para o item "%".', v_labels[i];
        END IF;
      END LOOP;

      -- b) Valida fotos anexadas: mínimo 1 e máximo 5
      v_fotos_count := jsonb_array_length(COALESCE(NEW.inspecao_fotos, '[]'::jsonb));
      IF v_fotos_count < 1 THEN
        RAISE EXCEPTION 'Não é permitido mover para Saída: É obrigatório anexar no mínimo 1 foto da inspeção concluída no SharePoint (atualmente: 0).';
      END IF;

      IF v_fotos_count > 5 THEN
        RAISE EXCEPTION 'Não é permitido mover para Saída: Limite máximo de fotos excedido (máximo 5, atualmente: %).', v_fotos_count;
      END IF;

    END IF;

  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_validate_inspecao_rules ON public.orders;
CREATE TRIGGER trigger_validate_inspecao_rules
  BEFORE INSERT OR UPDATE OF setor, setor_status, inspecao_checklist, inspecao_fotos, inspecao_motivo_parada, observacao
  ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_inspecao_rules();

-- Notifica o PostgREST para recarregar o schema imediatamente
NOTIFY pgrst, 'reload schema';
