
-- Trigger: auto-create faturamento child order on INSERT
CREATE OR REPLACE FUNCTION public.auto_create_faturamento_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only for new pre-press orders (setor IS NULL means it's created in Pré-Impressão)
  IF NEW.setor IS NULL AND NEW.arquivado = false THEN
    INSERT INTO public.orders (
      titulo, descricao, cliente, vendedor, observacao,
      nf, protocolo, empresa_entrega, obs_entrega,
      setor, setor_status, posicao,
      parent_order_id, criado_por, atualizado_por,
      status, arquivado
    ) VALUES (
      NEW.titulo, NEW.descricao, NEW.cliente, NEW.vendedor, NEW.observacao,
      NEW.nf, NEW.protocolo, NEW.empresa_entrega, NEW.obs_entrega,
      'faturamento', 'entrada', 9999,
      NEW.id, NEW.criado_por, NEW.atualizado_por,
      NEW.status, false
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_create_faturamento
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_faturamento_order();

-- Trigger: sync fields from parent to faturamento child on UPDATE
CREATE OR REPLACE FUNCTION public.sync_faturamento_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only sync if this is a parent order (not a faturamento child itself)
  IF NEW.setor IS DISTINCT FROM 'faturamento' THEN
    UPDATE public.orders
    SET
      titulo = NEW.titulo,
      descricao = NEW.descricao,
      cliente = NEW.cliente,
      vendedor = NEW.vendedor,
      observacao = NEW.observacao,
      nf = NEW.nf,
      protocolo = NEW.protocolo,
      empresa_entrega = NEW.empresa_entrega,
      obs_entrega = NEW.obs_entrega,
      atualizado_por = NEW.atualizado_por
    WHERE parent_order_id = NEW.id
      AND setor = 'faturamento';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_faturamento
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  WHEN (
    OLD.titulo IS DISTINCT FROM NEW.titulo OR
    OLD.descricao IS DISTINCT FROM NEW.descricao OR
    OLD.cliente IS DISTINCT FROM NEW.cliente OR
    OLD.vendedor IS DISTINCT FROM NEW.vendedor OR
    OLD.observacao IS DISTINCT FROM NEW.observacao OR
    OLD.nf IS DISTINCT FROM NEW.nf OR
    OLD.protocolo IS DISTINCT FROM NEW.protocolo OR
    OLD.empresa_entrega IS DISTINCT FROM NEW.empresa_entrega OR
    OLD.obs_entrega IS DISTINCT FROM NEW.obs_entrega
  )
  EXECUTE FUNCTION public.sync_faturamento_order();
