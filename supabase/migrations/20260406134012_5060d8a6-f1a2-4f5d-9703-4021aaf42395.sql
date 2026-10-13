
-- Tabela de resumo de tempos consolidados por setor
CREATE TABLE IF NOT EXISTS public.order_time_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  setor text NOT NULL,
  tempo_ms bigint NOT NULL DEFAULT 0,
  entrada_em timestamptz,
  saida_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_time_summary_order_id ON public.order_time_summary (order_id);

ALTER TABLE public.order_time_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view order_time_summary"
  ON public.order_time_summary FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated can insert order_time_summary"
  ON public.order_time_summary FOR INSERT
  TO authenticated WITH CHECK (true);

-- Função de compactação corrigida
CREATE OR REPLACE FUNCTION public.compact_archived_history()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order RECORD;
  v_entry RECORD;
  v_next_time timestamptz;
  v_processed_orders int := 0;
  v_summaries_created int := 0;
  v_first_time timestamptz;
  v_liberado_time timestamptz;
  v_row_count int;
BEGIN
  FOR v_order IN
    SELECT DISTINCT o.id, o.updated_at
    FROM orders o
    INNER JOIN sector_history sh ON sh.order_id = o.id
    LEFT JOIN order_time_summary ots ON ots.order_id = o.id
    WHERE o.arquivado = true
      AND ots.id IS NULL
    LIMIT 100
  LOOP
    -- Sector times
    FOR v_entry IN
      SELECT sh.*,
        LEAD(sh.created_at) OVER (ORDER BY sh.created_at) as next_created_at
      FROM sector_history sh
      WHERE sh.order_id = v_order.id
      ORDER BY sh.created_at
    LOOP
      IF v_entry.setor_novo IS NOT NULL THEN
        v_next_time := COALESCE(v_entry.next_created_at, v_order.updated_at);
        INSERT INTO order_time_summary (order_id, setor, tempo_ms, entrada_em, saida_em)
        VALUES (
          v_order.id,
          v_entry.setor_novo,
          (EXTRACT(EPOCH FROM (v_next_time - v_entry.created_at)) * 1000)::bigint,
          v_entry.created_at,
          v_next_time
        );
        v_summaries_created := v_summaries_created + 1;
      END IF;
    END LOOP;

    -- Pre-impressão time
    SELECT MIN(created_at) INTO v_first_time
    FROM order_status_history WHERE order_id = v_order.id;
    
    SELECT created_at INTO v_liberado_time
    FROM order_status_history 
    WHERE order_id = v_order.id AND status_novo = 'arquivo_liberado'
    ORDER BY created_at LIMIT 1;

    IF v_first_time IS NOT NULL AND v_liberado_time IS NOT NULL THEN
      INSERT INTO order_time_summary (order_id, setor, tempo_ms, entrada_em, saida_em)
      VALUES (
        v_order.id,
        'pre_impressao',
        (EXTRACT(EPOCH FROM (v_liberado_time - v_first_time)) * 1000)::bigint,
        v_first_time,
        v_liberado_time
      );
      v_summaries_created := v_summaries_created + 1;
    END IF;

    -- Delete detailed history
    DELETE FROM sector_history WHERE order_id = v_order.id;
    DELETE FROM order_status_history WHERE order_id = v_order.id;

    v_processed_orders := v_processed_orders + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'processed_orders', v_processed_orders,
    'summaries_created', v_summaries_created
  );
END;
$$;
