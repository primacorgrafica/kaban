
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

    v_processed_orders := v_processed_orders + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'processed_orders', v_processed_orders,
    'summaries_created', v_summaries_created
  );
END;
$$;
