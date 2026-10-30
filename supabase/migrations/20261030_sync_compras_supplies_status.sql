-- Migration: Sincronização automática do status de Compras para a O.S. Pai e seus suprimentos (Pantone e Outros)
-- Regra de Negócio:
-- MAGENTA: material em fase de entrada ou cotação.
-- AMARELO: material em fase de pedido.
-- VERDE: material com lançamento GE realizado ou saída registrada.

CREATE OR REPLACE FUNCTION sync_compras_status_to_parent()
RETURNS TRIGGER AS $$
DECLARE
  v_parent_processos text[];
  v_new_tag text;
  v_cleaned text[];
  v_status text;
BEGIN
  -- Age quando um card do setor compras com parent_order_id vinculado for inserido ou tiver setor_status alterado
  IF NEW.setor = 'compras' AND NEW.parent_order_id IS NOT NULL THEN
    v_status := LOWER(COALESCE(NEW.setor_status, 'entrada'));

    -- Obter os processos atuais do pai
    SELECT processos INTO v_parent_processos
    FROM orders
    WHERE id = NEW.parent_order_id;

    IF v_parent_processos IS NOT NULL THEN
      -- Limpa tags anteriores de status de compras
      SELECT array_agg(elem) INTO v_cleaned
      FROM unnest(v_parent_processos) AS elem
      WHERE elem NOT LIKE 'COMPRAS:status:%' AND elem NOT LIKE 'COMPRA:status:%';

      IF v_cleaned IS NULL THEN
        v_cleaned := ARRAY[]::text[];
      END IF;

      -- Adiciona a nova tag de status correspondente
      v_new_tag := 'COMPRAS:status:' || v_status;
      v_cleaned := array_append(v_cleaned, v_new_tag);

      -- Se for lancamento_ge ou saida, adiciona marcador COMPRADO para assegurar conformidade VERDE
      IF v_status IN ('lancamento_ge', 'saida') THEN
        IF NOT EXISTS (SELECT 1 FROM unnest(v_cleaned) elem WHERE elem LIKE 'COMPRADO%') THEN
          v_cleaned := array_append(v_cleaned, 'COMPRADO:' || (EXTRACT(EPOCH FROM NOW())*1000)::bigint::text || ':Compras');
        END IF;
      ELSIF v_status IN ('entrada', 'cotacao', 'pedido') THEN
        -- Se estiver em entrada, cotacao ou pedido, remove marcador COMPRADO do pai para refletir estado real
        SELECT array_agg(elem) INTO v_cleaned
        FROM unnest(v_cleaned) AS elem
        WHERE elem NOT LIKE 'COMPRADO%' AND elem NOT LIKE 'COMPRA:ok%';

        IF v_cleaned IS NULL THEN
          v_cleaned := ARRAY[]::text[];
        END IF;
        v_cleaned := array_append(v_cleaned, v_new_tag);
      END IF;

      -- Atualiza o pai
      UPDATE orders
      SET processos = v_cleaned,
          atualizado_em = now()
      WHERE id = NEW.parent_order_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_compras_status ON orders;
CREATE TRIGGER trg_sync_compras_status
AFTER INSERT OR UPDATE OF setor_status, arquivado ON orders
FOR EACH ROW
EXECUTE FUNCTION sync_compras_status_to_parent();
