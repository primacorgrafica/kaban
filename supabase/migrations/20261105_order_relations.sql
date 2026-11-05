-- ====================================================================
-- PRIMACOR KABAN: VINCULAÇÃO DE O.S. RELACIONADAS (BIDIRECIONAL)
-- ====================================================================

-- 1. Criação da tabela order_relations para integridade referencial estrita
CREATE TABLE IF NOT EXISTS public.order_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  related_order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  CONSTRAINT order_relations_no_self_link CHECK (order_id <> related_order_id),
  CONSTRAINT order_relations_unique_pair UNIQUE (order_id, related_order_id)
);

-- Índices para buscas ultrarrápidas em ambos os sentidos da relação
CREATE INDEX IF NOT EXISTS idx_order_relations_order_id ON public.order_relations(order_id);
CREATE INDEX IF NOT EXISTS idx_order_relations_related_order_id ON public.order_relations(related_order_id);

-- 2. Habilitação de RLS e políticas de segurança
ALTER TABLE public.order_relations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view order relations" ON public.order_relations;
CREATE POLICY "Authenticated users can view order relations"
ON public.order_relations FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert order relations" ON public.order_relations;
CREATE POLICY "Authenticated users can insert order relations"
ON public.order_relations FOR INSERT TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete order relations" ON public.order_relations;
CREATE POLICY "Authenticated users can delete order relations"
ON public.order_relations FOR DELETE TO authenticated
USING (true);

-- 3. Adiciona coluna desnormalizada related_order_ids na tabela orders para performance imediata no Kanban
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS related_order_ids TEXT[] DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_orders_related_order_ids ON public.orders USING GIN (related_order_ids);

-- 4. Prevenção de bounce para coordenadorpre@primacorgrafica.com.br em notificações pendentes
UPDATE public.order_seller_notifications
SET sent_status = 'failed',
    error_message = 'Cancelado: coordenadorpre@primacorgrafica.com.br não existe como caixa no Exchange'
WHERE lower(vendedor_email) = 'coordenadorpre@primacorgrafica.com.br'
  AND sent_status = 'pending';
