-- =====================================================================================
-- MIGRATION: FASE 3 - INCLUSÃO AUTOMÁTICA E FUSÃO DE OS (EXPEDIÇÃO PRIMACOR)
-- Data: 25/11/2026
-- =====================================================================================

-- 1. Garante colunas de apoio na tabela orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS parada_agrupada_id UUID;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tipo_veiculo_entrega TEXT DEFAULT 'moto';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS status_entrega TEXT DEFAULT 'pendente';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS regional_id UUID REFERENCES public.regionais(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS localidade_id UUID REFERENCES public.localidades(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS regiao TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_prova_entrega BOOLEAN DEFAULT false;

-- Restrição de categoria de veículo (carro ou moto)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_orders_tipo_veiculo_entrega'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT chk_orders_tipo_veiculo_entrega
      CHECK (tipo_veiculo_entrega IS NULL OR tipo_veiculo_entrega IN ('carro', 'moto'));
  END IF;
END $$;

-- 2. Índices de alta performance
CREATE INDEX IF NOT EXISTS idx_orders_parada_agrupada_id
  ON public.orders (parada_agrupada_id)
  WHERE parada_agrupada_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_prova_digital_parent
  ON public.orders (parent_order_id)
  WHERE parent_order_id IS NOT NULL;

-- =====================================================================================
-- 3. FUNÇÃO & TRIGGER: Inclusão Automática da Prova Digital ("P") ao ir para Aguardando Aprovação
-- =====================================================================================
CREATE OR REPLACE FUNCTION public.trg_fn_auto_create_digital_proof_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clean_titulo TEXT;
  v_proof_titulo TEXT;
  v_proof_addr TEXT;
  v_existing_id UUID;
BEGIN
  -- Dispara apenas quando o status muda para 'aguardando_aprovacao' e prova_digital for true
  IF NEW.status = 'aguardando_aprovacao' AND NEW.prova_digital = true AND NEW.arquivado = false THEN
    -- Limpa o título para evitar duplicar 'P' (ex.: '73736' -> 'P73736')
    v_clean_titulo := regexp_replace(COALESCE(NEW.titulo, ''), '^[P|p]', '');
    v_proof_titulo := 'P' || v_clean_titulo;

    -- Define o endereço de entrega da prova (prioridade: endereco_entrega -> entrega_endereco -> destinatario)
    v_proof_addr := COALESCE(NULLIF(trim(NEW.endereco_entrega), ''), NULLIF(trim(NEW.entrega_endereco), ''), NULLIF(trim(NEW.destinatario), ''));

    -- Verifica se já existe uma entrega ativa desta prova vinculada a esta OS pai (idempotência)
    SELECT id INTO v_existing_id
    FROM public.orders
    WHERE parent_order_id = NEW.id
      AND arquivado = false
      AND (titulo = v_proof_titulo OR is_prova_entrega = true OR 'prova_digital' = ANY(tipo_entrega))
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      -- Se já existe, apenas atualiza endereço se mudou, sem duplicar
      UPDATE public.orders
      SET
        entrega_endereco = COALESCE(v_proof_addr, entrega_endereco),
        cliente = NEW.cliente,
        vendedor = NEW.vendedor,
        atualizado_por = NEW.atualizado_por,
        updated_at = now()
      WHERE id = v_existing_id;
    ELSE
      -- Cria nova entrega de prova digital com Tipo Moto obrigatório
      INSERT INTO public.orders (
        titulo,
        cliente,
        descricao,
        vendedor,
        entrega_endereco,
        destinatario,
        tipo_veiculo_entrega,
        status_entrega,
        tipo_entrega,
        parent_order_id,
        is_prova_entrega,
        prova_digital,
        setor,
        setor_status,
        status,
        arquivado,
        posicao,
        criado_por,
        atualizado_por
      ) VALUES (
        v_proof_titulo,
        NEW.cliente,
        CASE
          WHEN NEW.descricao IS NOT NULL AND NEW.descricao <> '' THEN 'Prova Digital - ' || NEW.descricao
          ELSE 'Prova Digital'
        END,
        NEW.vendedor,
        v_proof_addr,
        NEW.destinatario,
        'moto', -- Prova Digital é AUTOMATICAMENTE Moto
        'pendente', -- Aguardando atribuição
        ARRAY['prova_digital', 'moto'],
        NEW.id,
        true,
        true,
        'expedicao',
        'entrada',
        'arquivo_liberado',
        false,
        9999,
        NEW.criado_por,
        NEW.atualizado_por
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_create_digital_proof_delivery ON public.orders;
CREATE TRIGGER trg_auto_create_digital_proof_delivery
  AFTER INSERT OR UPDATE OF status, prova_digital, endereco_entrega ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_auto_create_digital_proof_delivery();

-- =====================================================================================
-- 4. RPC: Fusão de Ordens de Serviço do MESMO Cliente (Transacional e Atômica)
-- =====================================================================================
CREATE OR REPLACE FUNCTION public.merge_orders_for_delivery(
  p_order_ids UUID[],
  p_chosen_address TEXT,
  p_chosen_date TIMESTAMPTZ DEFAULT NULL,
  p_chosen_vehicle TEXT DEFAULT 'moto',
  p_parada_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller UUID;
  v_can_manage BOOLEAN;
  v_client_count INT;
  v_parada_id UUID;
  v_affected_count INT;
  v_first_client TEXT;
BEGIN
  v_caller := auth.uid();

  -- 1. Validação de permissão (apenas gestores da Expedição ou Administradores)
  IF v_caller IS NOT NULL THEN
    SELECT public.can_manage_expedicao(v_caller) INTO v_can_manage;
    IF NOT v_can_manage THEN
      RAISE EXCEPTION 'Acesso negado: apenas o responsável pela Expedição e administradores podem fundir entregas.';
    END IF;
  END IF;

  -- 2. Validação de quantidade
  IF p_order_ids IS NULL OR array_length(p_order_ids, 1) < 2 THEN
    RAISE EXCEPTION 'Para fundir é necessário selecionar no mínimo 2 Ordens de Serviço.';
  END IF;

  -- 3. Validação de cliente: TODAS as OS selecionadas DEVEM ser do MESMO cliente
  SELECT COUNT(DISTINCT lower(trim(cliente))), MIN(cliente)
  INTO v_client_count, v_first_client
  FROM public.orders
  WHERE id = ANY(p_order_ids);

  IF v_client_count > 1 THEN
    RAISE EXCEPTION 'Fusão inválida: todas as Ordens de Serviço devem pertencer ao mesmo cliente.';
  END IF;

  IF v_client_count = 0 THEN
    RAISE EXCEPTION 'Nenhuma Ordem de Serviço encontrada com os identificadores fornecidos.';
  END IF;

  -- 4. Identificador da Parada Agrupada (gera novo ou reaproveita)
  v_parada_id := COALESCE(p_parada_id, gen_random_uuid());

  -- 5. Atualiza todas as ordens selecionadas com os dados unificados
  UPDATE public.orders
  SET
    parada_agrupada_id = v_parada_id,
    entrega_endereco = COALESCE(p_chosen_address, entrega_endereco),
    entrega_data_limite = COALESCE(p_chosen_date, entrega_data_limite),
    tipo_veiculo_entrega = COALESCE(p_chosen_vehicle, tipo_veiculo_entrega, 'moto'),
    atualizado_por = v_caller,
    updated_at = now()
  WHERE id = ANY(p_order_ids);

  GET DIAGNOSTICS v_affected_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'parada_id', v_parada_id,
    'cliente', v_first_client,
    'affected_count', v_affected_count
  );
END;
$$;

-- =====================================================================================
-- 5. RPC: Desfazer Fusão de Ordens de Serviço (Bloqueado se atribuído a Rota)
-- =====================================================================================
CREATE OR REPLACE FUNCTION public.unmerge_orders_from_delivery(
  p_parada_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller UUID;
  v_can_manage BOOLEAN;
  v_has_active_route BOOLEAN;
  v_affected_count INT;
BEGIN
  v_caller := auth.uid();

  -- 1. Validação de permissão
  IF v_caller IS NOT NULL THEN
    SELECT public.can_manage_expedicao(v_caller) INTO v_can_manage;
    IF NOT v_can_manage THEN
      RAISE EXCEPTION 'Acesso negado: apenas o responsável pela Expedição e administradores podem desfazer a fusão.';
    END IF;
  END IF;

  IF p_parada_id IS NULL THEN
    RAISE EXCEPTION 'Identificador de parada agrupada inválido.';
  END IF;

  -- 2. Regra essencial: Não permitir desfazer a fusão se já atribuída a uma Rota
  SELECT EXISTS (
    SELECT 1 FROM public.orders
    WHERE parada_agrupada_id = p_parada_id
      AND rota_numero IS NOT NULL
      AND rota_numero <> ''
  ) INTO v_has_active_route;

  IF v_has_active_route THEN
    RAISE EXCEPTION 'Não é possível desfazer a fusão de uma entrega que já está atribuída a uma rota. Remova a entrega da rota antes de desfazer.';
  END IF;

  -- 3. Limpa o parada_agrupada_id de todas as ordens daquela parada
  UPDATE public.orders
  SET
    parada_agrupada_id = NULL,
    atualizado_por = v_caller,
    updated_at = now()
  WHERE parada_agrupada_id = p_parada_id;

  GET DIAGNOSTICS v_affected_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'unmerged_count', v_affected_count
  );
END;
$$;
