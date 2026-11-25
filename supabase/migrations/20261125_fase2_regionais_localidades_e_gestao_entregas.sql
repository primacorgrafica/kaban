-- ====================================================================
-- Primacor Gráfica - FASE 2: Regionais, Localidades & Gestão de Entregas
-- Migration: 20261125_fase2_regionais_localidades_e_gestao_entregas.sql
-- Descrição:
--   1. Cria tabelas relacionais public.regionais e public.localidades com índices e FKs
--   2. Executa seed idempotente das 18 regionais e todas as 287 localidades
--   3. Configura políticas RLS (escrita administrativa, leitura segura)
--   4. Evolui public.orders com regional_id, localidade_id, regiao e tipo_veiculo_entrega
--   5. Mantém 100% de compatibilidade com entregas antigas (status 'pendente' = 'Aguardando atribuição')
-- ====================================================================

-- 1. Tabela public.regionais
CREATE TABLE IF NOT EXISTS public.regionais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  ativo BOOLEAN NOT NULL DEFAULT true,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_regionais_ordem_ativo ON public.regionais(ordem, ativo);
CREATE INDEX IF NOT EXISTS idx_regionais_nome_lower ON public.regionais(lower(nome));

-- 2. Tabela public.localidades
CREATE TABLE IF NOT EXISTS public.localidades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  regional_id UUID NOT NULL REFERENCES public.regionais(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'bairro' CHECK (tipo IN ('bairro', 'cidade')),
  slug TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT localidades_regional_slug_unique UNIQUE (regional_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_localidades_regional_ativo ON public.localidades(regional_id, ativo);
CREATE INDEX IF NOT EXISTS idx_localidades_nome_lower ON public.localidades(lower(nome));
CREATE INDEX IF NOT EXISTS idx_localidades_slug ON public.localidades(slug);

-- Triggers de updated_at
CREATE OR REPLACE FUNCTION public.update_regionais_localidades_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_regionais_updated_at ON public.regionais;
CREATE TRIGGER trg_regionais_updated_at
  BEFORE UPDATE ON public.regionais
  FOR EACH ROW
  EXECUTE FUNCTION public.update_regionais_localidades_updated_at();

DROP TRIGGER IF EXISTS trg_localidades_updated_at ON public.localidades;
CREATE TRIGGER trg_localidades_updated_at
  BEFORE UPDATE ON public.localidades
  FOR EACH ROW
  EXECUTE FUNCTION public.update_regionais_localidades_updated_at();

-- 3. Função de permissão administrativa + RLS
CREATE OR REPLACE FUNCTION public.is_regionais_admin(_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF _user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  v_role := COALESCE(public.get_user_role(_user_id), 'user');
  RETURN v_role IN ('admin', 'coordenador');
END;
$$;

REVOKE ALL ON FUNCTION public.is_regionais_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_regionais_admin(UUID) TO authenticated;

ALTER TABLE public.regionais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.localidades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Regionais select policy" ON public.regionais;
DROP POLICY IF EXISTS "Regionais insert admin policy" ON public.regionais;
DROP POLICY IF EXISTS "Regionais update admin policy" ON public.regionais;
DROP POLICY IF EXISTS "Regionais delete admin policy" ON public.regionais;

CREATE POLICY "Regionais select policy"
  ON public.regionais FOR SELECT
  TO authenticated
  USING (
    public.is_regionais_admin(auth.uid())
    OR ativo = true
  );

CREATE POLICY "Regionais insert admin policy"
  ON public.regionais FOR INSERT
  TO authenticated
  WITH CHECK (public.is_regionais_admin(auth.uid()));

CREATE POLICY "Regionais update admin policy"
  ON public.regionais FOR UPDATE
  TO authenticated
  USING (public.is_regionais_admin(auth.uid()))
  WITH CHECK (public.is_regionais_admin(auth.uid()));

CREATE POLICY "Regionais delete admin policy"
  ON public.regionais FOR DELETE
  TO authenticated
  USING (public.is_regionais_admin(auth.uid()));

DROP POLICY IF EXISTS "Localidades select policy" ON public.localidades;
DROP POLICY IF EXISTS "Localidades insert admin policy" ON public.localidades;
DROP POLICY IF EXISTS "Localidades update admin policy" ON public.localidades;
DROP POLICY IF EXISTS "Localidades delete admin policy" ON public.localidades;

CREATE POLICY "Localidades select policy"
  ON public.localidades FOR SELECT
  TO authenticated
  USING (
    public.is_regionais_admin(auth.uid())
    OR (
      ativo = true
      AND EXISTS (
        SELECT 1 FROM public.regionais r
        WHERE r.id = regional_id AND r.ativo = true
      )
    )
  );

CREATE POLICY "Localidades insert admin policy"
  ON public.localidades FOR INSERT
  TO authenticated
  WITH CHECK (public.is_regionais_admin(auth.uid()));

CREATE POLICY "Localidades update admin policy"
  ON public.localidades FOR UPDATE
  TO authenticated
  USING (public.is_regionais_admin(auth.uid()))
  WITH CHECK (public.is_regionais_admin(auth.uid()));

CREATE POLICY "Localidades delete admin policy"
  ON public.localidades FOR DELETE
  TO authenticated
  USING (public.is_regionais_admin(auth.uid()));

-- 4. Evolução de public.orders para Gestão de Entregas (Fase 2)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS regional_id UUID REFERENCES public.regionais(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS localidade_id UUID REFERENCES public.localidades(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS regiao TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tipo_veiculo_entrega TEXT DEFAULT 'moto';

DO $$
BEGIN
  ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_tipo_veiculo_entrega_check;
  ALTER TABLE public.orders ADD CONSTRAINT orders_tipo_veiculo_entrega_check
    CHECK (tipo_veiculo_entrega IS NULL OR tipo_veiculo_entrega IN ('carro', 'moto'));
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_regional_id ON public.orders(regional_id);
CREATE INDEX IF NOT EXISTS idx_orders_localidade_id ON public.orders(localidade_id);
CREATE INDEX IF NOT EXISTS idx_orders_entrega_data_limite ON public.orders(entrega_data_limite);
CREATE INDEX IF NOT EXISTS idx_orders_status_entrega ON public.orders(status_entrega);

-- Compatibilizar registros antigos sem status_entrega explícito para 'pendente' (exibido como 'Aguardando atribuição')
UPDATE public.orders
SET status_entrega = 'pendente'
WHERE status_entrega IS NULL;

-- 5. Seed Idempotente das 18 Regionais e suas Localidades
DO $$
DECLARE
  v_reg_id UUID;
BEGIN
  -- 01 — CENTRO-SUL
  INSERT INTO public.regionais (nome, slug, ativo, ordem)
  VALUES ('CENTRO-SUL', 'centro-sul', true, 1)
  ON CONFLICT (slug) DO UPDATE SET ordem = EXCLUDED.ordem
  RETURNING id INTO v_reg_id;

  INSERT INTO public.localidades (regional_id, nome, tipo, slug, ativo) VALUES
    (v_reg_id, 'Acaba Mundo', 'bairro', 'acaba-mundo', true),
    (v_reg_id, 'Anchieta', 'bairro', 'anchieta', true),
    (v_reg_id, 'Ápia', 'bairro', 'apia', true),
    (v_reg_id, 'Barro Preto', 'bairro', 'barro-preto', true),
    (v_reg_id, 'Belvedere', 'bairro', 'belvedere', true),
    (v_reg_id, 'Boa Viagem', 'bairro', 'boa-viagem', true),
    (v_reg_id, 'Carmo', 'bairro', 'carmo', true),
    (v_reg_id, 'Centro', 'bairro', 'centro', true),
    (v_reg_id, 'Cidade Jardim', 'bairro', 'cidade-jardim', true),
    (v_reg_id, 'Comiteco', 'bairro', 'comiteco', true),
    (v_reg_id, 'Coração de Jesus', 'bairro', 'coracao-de-jesus', true),
    (v_reg_id, 'Cruzeiro', 'bairro', 'cruzeiro', true),
    (v_reg_id, 'Funcionários', 'bairro', 'funcionarios', true),
    (v_reg_id, 'Lourdes', 'bairro', 'lourdes', true),
    (v_reg_id, 'Luxemburgo', 'bairro', 'luxemburgo', true),
    (v_reg_id, 'Mangabeiras', 'bairro', 'mangabeiras', true),
    (v_reg_id, 'Novo São Lucas', 'bairro', 'novo-sao-lucas', true),
    (v_reg_id, 'Santa Lúcia', 'bairro', 'santa-lucia', true),
    (v_reg_id, 'Santo Agostinho', 'bairro', 'santo-agostinho', true),
    (v_reg_id, 'Santo Antônio', 'bairro', 'santo-antonio', true),
    (v_reg_id, 'São Bento', 'bairro', 'sao-bento', true),
    (v_reg_id, 'São Pedro', 'bairro', 'sao-pedro', true),
    (v_reg_id, 'Savassi', 'bairro', 'savassi', true),
    (v_reg_id, 'Serra', 'bairro', 'serra', true),
    (v_reg_id, 'Sion', 'bairro', 'sion', true),
    (v_reg_id, 'Vila Barragem Santa Lúcia', 'bairro', 'vila-barragem-santa-lucia', true),
    (v_reg_id, 'Vila Fumec', 'bairro', 'vila-fumec', true),
    (v_reg_id, 'Vila Marçola', 'bairro', 'vila-marcola', true),
    (v_reg_id, 'Vila Nossa Senhora de Fátima', 'bairro', 'vila-nossa-senhora-de-fatima', true),
    (v_reg_id, 'Vila Paris', 'bairro', 'vila-paris', true)
  ON CONFLICT (regional_id, slug) DO NOTHING;

  -- 02 — PAMPULHA
  INSERT INTO public.regionais (nome, slug, ativo, ordem)
  VALUES ('PAMPULHA', 'pampulha', true, 2)
  ON CONFLICT (slug) DO UPDATE SET ordem = EXCLUDED.ordem
  RETURNING id INTO v_reg_id;

  INSERT INTO public.localidades (regional_id, nome, tipo, slug, ativo) VALUES
    (v_reg_id, 'Aeroporto', 'bairro', 'aeroporto', true),
    (v_reg_id, 'Alípio de Melo', 'bairro', 'alipio-de-melo', true),
    (v_reg_id, 'Bandeirantes', 'bairro', 'bandeirantes', true),
    (v_reg_id, 'Bispo de Maura', 'bairro', 'bispo-de-maura', true),
    (v_reg_id, 'Braúnas', 'bairro', 'braunas', true),
    (v_reg_id, 'Campus UFMG', 'bairro', 'campus-ufmg', true),
    (v_reg_id, 'Castelo', 'bairro', 'castelo', true),
    (v_reg_id, 'Céu Azul (parte)', 'bairro', 'ceu-azul-parte', true),
    (v_reg_id, 'Dona Clara', 'bairro', 'dona-clara', true),
    (v_reg_id, 'Engenho Nogueira', 'bairro', 'engenho-nogueira', true),
    (v_reg_id, 'Garças', 'bairro', 'garcas', true),
    (v_reg_id, 'Itapoã', 'bairro', 'itapoa', true),
    (v_reg_id, 'Itatiaia', 'bairro', 'itatiaia', true),
    (v_reg_id, 'Jaraguá', 'bairro', 'jaragua', true),
    (v_reg_id, 'Jardim Atlântico', 'bairro', 'jardim-atlantico', true),
    (v_reg_id, 'Liberdade', 'bairro', 'liberdade', true),
    (v_reg_id, 'Manacás', 'bairro', 'manacas', true),
    (v_reg_id, 'Nova Pampulha', 'bairro', 'nova-pampulha', true),
    (v_reg_id, 'Ouro Preto', 'bairro', 'ouro-preto', true),
    (v_reg_id, 'Paquetá', 'bairro', 'paqueta', true),
    (v_reg_id, 'Planalto', 'bairro', 'planalto', true),
    (v_reg_id, 'Santa Amélia', 'bairro', 'santa-amelia', true),
    (v_reg_id, 'Santa Branca', 'bairro', 'santa-branca', true),
    (v_reg_id, 'Santa Rosa', 'bairro', 'santa-rosa', true),
    (v_reg_id, 'São Francisco', 'bairro', 'sao-francisco', true),
    (v_reg_id, 'São José Pampulha', 'bairro', 'sao-jose-pampulha', true),
    (v_reg_id, 'São Luiz', 'bairro', 'sao-luiz', true),
    (v_reg_id, 'Trevo', 'bairro', 'trevo', true),
    (v_reg_id, 'Tijuca', 'bairro', 'tijuca', true),
    (v_reg_id, 'Urca', 'bairro', 'urca', true),
    (v_reg_id, 'Vila Engenho Nogueira', 'bairro', 'vila-engenho-nogueira', true),
    (v_reg_id, 'Xangri-lá', 'bairro', 'xangri-la', true)
  ON CONFLICT (regional_id, slug) DO NOTHING;

  -- 03 — OESTE
  INSERT INTO public.regionais (nome, slug, ativo, ordem)
  VALUES ('OESTE', 'oeste', true, 3)
  ON CONFLICT (slug) DO UPDATE SET ordem = EXCLUDED.ordem
  RETURNING id INTO v_reg_id;

  INSERT INTO public.localidades (regional_id, nome, tipo, slug, ativo) VALUES
    (v_reg_id, 'Alpes', 'bairro', 'alpes', true),
    (v_reg_id, 'Alto Barroca', 'bairro', 'alto-barroca', true),
    (v_reg_id, 'Ambrosina', 'bairro', 'ambrosina', true),
    (v_reg_id, 'Bairro das Indústrias II', 'bairro', 'bairro-das-industrias-ii', true),
    (v_reg_id, 'Barão Homem de Melo (I, II e IV)', 'bairro', 'barao-homem-de-melo-i-ii-e-iv', true),
    (v_reg_id, 'Barroca', 'bairro', 'barroca', true),
    (v_reg_id, 'Betânia', 'bairro', 'betania', true),
    (v_reg_id, 'Buritis', 'bairro', 'buritis', true),
    (v_reg_id, 'Cabana do Pai Tomás', 'bairro', 'cabana-do-pai-tomas', true),
    (v_reg_id, 'Calafate', 'bairro', 'calafate', true),
    (v_reg_id, 'Camargos', 'bairro', 'camargos', true),
    (v_reg_id, 'Chácara Leonina', 'bairro', 'chacara-leonina', true),
    (v_reg_id, 'Cinquentenário', 'bairro', 'cinquentenario', true),
    (v_reg_id, 'Estoril', 'bairro', 'estoril', true),
    (v_reg_id, 'Estrela do Oriente', 'bairro', 'estrela-do-oriente', true),
    (v_reg_id, 'Grajaú', 'bairro', 'grajau', true),
    (v_reg_id, 'Gutierrez', 'bairro', 'gutierrez', true),
    (v_reg_id, 'Havaí', 'bairro', 'havai', true),
    (v_reg_id, 'Imbaúbas', 'bairro', 'imbaubas', true),
    (v_reg_id, 'Jardim América', 'bairro', 'jardim-america', true),
    (v_reg_id, 'Madre Gertrudes', 'bairro', 'madre-gertrudes', true),
    (v_reg_id, 'Marajó', 'bairro', 'marajo', true),
    (v_reg_id, 'Nova Cintra', 'bairro', 'nova-cintra', true),
    (v_reg_id, 'Nova Granada', 'bairro', 'nova-granada', true),
    (v_reg_id, 'Nova Suíssa', 'bairro', 'nova-suissa', true),
    (v_reg_id, 'Palmeiras', 'bairro', 'palmeiras', true),
    (v_reg_id, 'Prado', 'bairro', 'prado', true),
    (v_reg_id, 'Salgado Filho', 'bairro', 'salgado-filho', true),
    (v_reg_id, 'Ventosa', 'bairro', 'ventosa', true),
    (v_reg_id, 'Vila Antena', 'bairro', 'vila-antena', true),
    (v_reg_id, 'Vila Vista Alegre', 'bairro', 'vila-vista-alegre', true)
  ON CONFLICT (regional_id, slug) DO NOTHING;

  -- 04 — BARREIRO
  INSERT INTO public.regionais (nome, slug, ativo, ordem)
  VALUES ('BARREIRO', 'barreiro', true, 4)
  ON CONFLICT (slug) DO UPDATE SET ordem = EXCLUDED.ordem
  RETURNING id INTO v_reg_id;

  INSERT INTO public.localidades (regional_id, nome, tipo, slug, ativo) VALUES
    (v_reg_id, 'Ademar Maldonado', 'bairro', 'ademar-maldonado', true),
    (v_reg_id, 'Águas Claras', 'bairro', 'aguas-claras', true),
    (v_reg_id, 'Alta Tensão (e Alta Tensão I)', 'bairro', 'alta-tensao-e-alta-tensao-i', true),
    (v_reg_id, 'Alto das Antenas', 'bairro', 'alto-das-antenas', true),
    (v_reg_id, 'Araguaia', 'bairro', 'araguaia', true),
    (v_reg_id, 'Átila de Paiva', 'bairro', 'atila-de-paiva', true),
    (v_reg_id, 'Bairro das Indústrias I', 'bairro', 'bairro-das-industrias-i', true),
    (v_reg_id, 'Barreiro', 'bairro', 'barreiro', true),
    (v_reg_id, 'Cardoso', 'bairro', 'cardoso', true),
    (v_reg_id, 'Castanheira', 'bairro', 'castanheira', true),
    (v_reg_id, 'Diamante', 'bairro', 'diamante', true),
    (v_reg_id, 'Durval de Barros', 'bairro', 'durval-de-barros', true),
    (v_reg_id, 'Esperança', 'bairro', 'esperanca', true),
    (v_reg_id, 'Flávio Marques Lisboa', 'bairro', 'flavio-marques-lisboa', true),
    (v_reg_id, 'Jatobá', 'bairro', 'jatoba', true),
    (v_reg_id, 'Lindéia', 'bairro', 'lindeia', true),
    (v_reg_id, 'Milionários', 'bairro', 'milionarios', true),
    (v_reg_id, 'Novo das Indústrias', 'bairro', 'novo-das-industrias', true),
    (v_reg_id, 'Olaria', 'bairro', 'olaria', true),
    (v_reg_id, 'Petrópolis', 'bairro', 'petropolis', true),
    (v_reg_id, 'Pilar', 'bairro', 'pilar', true),
    (v_reg_id, 'Santa Helena', 'bairro', 'santa-helena', true),
    (v_reg_id, 'Santa Margarida', 'bairro', 'santa-margarida', true),
    (v_reg_id, 'Teixeira Dias', 'bairro', 'teixeira-dias', true),
    (v_reg_id, 'Tirol', 'bairro', 'tirol', true),
    (v_reg_id, 'Vale do Jatobá', 'bairro', 'vale-do-jatoba', true),
    (v_reg_id, 'Vila Bernadete', 'bairro', 'vila-bernadete', true),
    (v_reg_id, 'Washington Pires', 'bairro', 'washington-pires', true)
  ON CONFLICT (regional_id, slug) DO NOTHING;

  -- 05 — LESTE
  INSERT INTO public.regionais (nome, slug, ativo, ordem)
  VALUES ('LESTE', 'leste', true, 5)
  ON CONFLICT (slug) DO UPDATE SET ordem = EXCLUDED.ordem
  RETURNING id INTO v_reg_id;

  INSERT INTO public.localidades (regional_id, nome, tipo, slug, ativo) VALUES
    (v_reg_id, 'Alto Vera Cruz', 'bairro', 'alto-vera-cruz', true),
    (v_reg_id, 'Boa Vista', 'bairro', 'boa-vista', true),
    (v_reg_id, 'Caetano Furquim', 'bairro', 'caetano-furquim', true),
    (v_reg_id, 'Casa Branca', 'bairro', 'casa-branca', true),
    (v_reg_id, 'Esplanada', 'bairro', 'esplanada', true),
    (v_reg_id, 'Floresta', 'bairro', 'floresta', true),
    (v_reg_id, 'Granja de Freitas', 'bairro', 'granja-de-freitas', true),
    (v_reg_id, 'Horto', 'bairro', 'horto', true),
    (v_reg_id, 'Jonas Veiga', 'bairro', 'jonas-veiga', true),
    (v_reg_id, 'Mariano de Abreu', 'bairro', 'mariano-de-abreu', true),
    (v_reg_id, 'Paraíso', 'bairro', 'paraiso', true),
    (v_reg_id, 'Pompéia', 'bairro', 'pompeia', true),
    (v_reg_id, 'Sagrada Família', 'bairro', 'sagrada-familia', true),
    (v_reg_id, 'Santa Efigênia', 'bairro', 'santa-efigenia', true),
    (v_reg_id, 'Santa Tereza', 'bairro', 'santa-tereza', true),
    (v_reg_id, 'São Geraldo', 'bairro', 'sao-geraldo', true),
    (v_reg_id, 'São Lucas', 'bairro', 'sao-lucas', true),
    (v_reg_id, 'Saudade', 'bairro', 'saudade', true),
    (v_reg_id, 'Taquaril', 'bairro', 'taquaril', true),
    (v_reg_id, 'Vera Cruz', 'bairro', 'vera-cruz', true),
    (v_reg_id, 'Vila Dias', 'bairro', 'vila-dias', true)
  ON CONFLICT (regional_id, slug) DO NOTHING;

  -- 06 — NOROESTE
  INSERT INTO public.regionais (nome, slug, ativo, ordem)
  VALUES ('NOROESTE', 'noroeste', true, 6)
  ON CONFLICT (slug) DO UPDATE SET ordem = EXCLUDED.ordem
  RETURNING id INTO v_reg_id;

  INSERT INTO public.localidades (regional_id, nome, tipo, slug, ativo) VALUES
    (v_reg_id, 'Alto Caiçaras', 'bairro', 'alto-caicaras', true),
    (v_reg_id, 'Alto dos Pinheiros', 'bairro', 'alto-dos-pinheiros', true),
    (v_reg_id, 'Álvaro Camargos', 'bairro', 'alvaro-camargos', true),
    (v_reg_id, 'Aparecida', 'bairro', 'aparecida', true),
    (v_reg_id, 'Aparecida Sétima Seção', 'bairro', 'aparecida-setima-secao', true),
    (v_reg_id, 'Bom Jesus', 'bairro', 'bom-jesus', true),
    (v_reg_id, 'Bonfim', 'bairro', 'bonfim', true),
    (v_reg_id, 'Caiçara-Adelaide', 'bairro', 'caicara-adelaide', true),
    (v_reg_id, 'Caiçaras', 'bairro', 'caicaras', true),
    (v_reg_id, 'Carlos Prates', 'bairro', 'carlos-prates', true),
    (v_reg_id, 'Coqueiros', 'bairro', 'coqueiros', true),
    (v_reg_id, 'Coração Eucarístico', 'bairro', 'coracao-eucaristico', true),
    (v_reg_id, 'Glória', 'bairro', 'gloria', true),
    (v_reg_id, 'Inconfidência', 'bairro', 'inconfidencia', true),
    (v_reg_id, 'Jardim Montanhês', 'bairro', 'jardim-montanhes', true),
    (v_reg_id, 'Lagoinha', 'bairro', 'lagoinha', true),
    (v_reg_id, 'Nova Cachoeirinha', 'bairro', 'nova-cachoeirinha', true),
    (v_reg_id, 'Novo Progresso', 'bairro', 'novo-progresso', true),
    (v_reg_id, 'Padre Eustáquio', 'bairro', 'padre-eustaquio', true),
    (v_reg_id, 'Pedreira Prado Lopes', 'bairro', 'pedreira-prado-lopes', true),
    (v_reg_id, 'Pindorama', 'bairro', 'pindorama', true),
    (v_reg_id, 'Santo André', 'bairro', 'santo-andre', true),
    (v_reg_id, 'São Cristóvão', 'bairro', 'sao-cristovao', true),
    (v_reg_id, 'São Salvador', 'bairro', 'sao-salvador', true),
    (v_reg_id, 'Sumaré', 'bairro', 'sumare', true)
  ON CONFLICT (regional_id, slug) DO NOTHING;

  -- 07 — NORDESTE
  INSERT INTO public.regionais (nome, slug, ativo, ordem)
  VALUES ('NORDESTE', 'nordeste', true, 7)
  ON CONFLICT (slug) DO UPDATE SET ordem = EXCLUDED.ordem
  RETURNING id INTO v_reg_id;

  INSERT INTO public.localidades (regional_id, nome, tipo, slug, ativo) VALUES
    (v_reg_id, 'Acaiaca', 'bairro', 'acaiaca', true),
    (v_reg_id, 'Andiroba', 'bairro', 'andiroba', true),
    (v_reg_id, 'Antônio Ribeiro de Abreu', 'bairro', 'antonio-ribeiro-de-abreu', true),
    (v_reg_id, 'Beija-Flor', 'bairro', 'beija-flor', true),
    (v_reg_id, 'Bela Vitória', 'bairro', 'bela-vitoria', true),
    (v_reg_id, 'Boa Esperança', 'bairro', 'boa-esperanca', true),
    (v_reg_id, 'Cachoeirinha', 'bairro', 'cachoeirinha', true),
    (v_reg_id, 'Capitão Eduardo', 'bairro', 'capitao-eduardo', true),
    (v_reg_id, 'Cidade Nova', 'bairro', 'cidade-nova', true),
    (v_reg_id, 'Concórdia', 'bairro', 'concordia', true),
    (v_reg_id, 'Dom Joaquim', 'bairro', 'dom-joaquim', true),
    (v_reg_id, 'Dom Silvério', 'bairro', 'dom-silverio', true),
    (v_reg_id, 'Eymard', 'bairro', 'eymard', true),
    (v_reg_id, 'Fazenda Gorduras', 'bairro', 'fazenda-gorduras', true),
    (v_reg_id, 'Fernão Dias', 'bairro', 'fernao-dias', true),
    (v_reg_id, 'Goiânia', 'bairro', 'goiania', true),
    (v_reg_id, 'Gorduras (de Baixo e de Cima)', 'bairro', 'gorduras-de-baixo-e-de-cima', true),
    (v_reg_id, 'Graça', 'bairro', 'graca', true),
    (v_reg_id, 'Ipiranga', 'bairro', 'ipiranga', true),
    (v_reg_id, 'Maria Goretti', 'bairro', 'maria-goretti', true),
    (v_reg_id, 'Nazaré', 'bairro', 'nazare', true),
    (v_reg_id, 'Palmares', 'bairro', 'palmares', true),
    (v_reg_id, 'Renascença', 'bairro', 'renascenca', true),
    (v_reg_id, 'Santa Cruz', 'bairro', 'santa-cruz', true),
    (v_reg_id, 'São Gabriel', 'bairro', 'sao-gabriel', true),
    (v_reg_id, 'São Paulo', 'bairro', 'sao-paulo', true),
    (v_reg_id, 'Silveira', 'bairro', 'silveira', true),
    (v_reg_id, 'União', 'bairro', 'uniao', true),
    (v_reg_id, 'Vila Maria', 'bairro', 'vila-maria', true)
  ON CONFLICT (regional_id, slug) DO NOTHING;

  -- 08 — NORTE
  INSERT INTO public.regionais (nome, slug, ativo, ordem)
  VALUES ('NORTE', 'norte', true, 8)
  ON CONFLICT (slug) DO UPDATE SET ordem = EXCLUDED.ordem
  RETURNING id INTO v_reg_id;

  INSERT INTO public.localidades (regional_id, nome, tipo, slug, ativo) VALUES
    (v_reg_id, 'Aarão Reis', 'bairro', 'aarao-reis', true),
    (v_reg_id, 'Campo Alegre', 'bairro', 'campo-alegre', true),
    (v_reg_id, 'Canaã', 'bairro', 'canaa', true),
    (v_reg_id, 'Celestino', 'bairro', 'celestino', true),
    (v_reg_id, 'Conjunto Floramar', 'bairro', 'conjunto-floramar', true),
    (v_reg_id, 'Conjunto Mariquinhas', 'bairro', 'conjunto-mariquinhas', true),
    (v_reg_id, 'Conjunto Novo Aarão Reis', 'bairro', 'conjunto-novo-aarao-reis', true),
    (v_reg_id, 'Etelvina Carneiro', 'bairro', 'etelvina-carneiro', true),
    (v_reg_id, 'Felicidade', 'bairro', 'felicidade', true),
    (v_reg_id, 'Floramar', 'bairro', 'floramar', true),
    (v_reg_id, 'Frei Leopoldo', 'bairro', 'frei-leopoldo', true),
    (v_reg_id, 'Guarani', 'bairro', 'guarani', true),
    (v_reg_id, 'Heliópolis', 'bairro', 'heliopolis', true),
    (v_reg_id, 'Jaqueline', 'bairro', 'jaqueline', true),
    (v_reg_id, 'Jardim Guanabara', 'bairro', 'jardim-guanabara', true),
    (v_reg_id, 'Juliana', 'bairro', 'juliana', true),
    (v_reg_id, 'Laranjeiras', 'bairro', 'laranjeiras', true),
    (v_reg_id, 'Madri', 'bairro', 'madri', true),
    (v_reg_id, 'Minaslândia', 'bairro', 'minaslandia', true),
    (v_reg_id, 'Novo Aarão Reis', 'bairro', 'novo-aarao-reis', true),
    (v_reg_id, 'Planalto', 'bairro', 'planalto', true),
    (v_reg_id, 'Primeiro de Maio', 'bairro', 'primeiro-de-maio', true),
    (v_reg_id, 'Providência', 'bairro', 'providencia', true),
    (v_reg_id, 'Ribeiro de Abreu', 'bairro', 'ribeiro-de-abreu', true),
    (v_reg_id, 'São Bernardo', 'bairro', 'sao-bernardo', true),
    (v_reg_id, 'Solimões', 'bairro', 'solimoes', true),
    (v_reg_id, 'Tupi', 'bairro', 'tupi', true),
    (v_reg_id, 'Vila Clóris', 'bairro', 'vila-cloris', true)
  ON CONFLICT (regional_id, slug) DO NOTHING;

  -- 09 — VENDA NOVA
  INSERT INTO public.regionais (nome, slug, ativo, ordem)
  VALUES ('VENDA NOVA', 'venda-nova', true, 9)
  ON CONFLICT (slug) DO UPDATE SET ordem = EXCLUDED.ordem
  RETURNING id INTO v_reg_id;

  INSERT INTO public.localidades (regional_id, nome, tipo, slug, ativo) VALUES
    (v_reg_id, 'Apolônia', 'bairro', 'apolonia', true),
    (v_reg_id, 'Candelária', 'bairro', 'candelaria', true),
    (v_reg_id, 'Cenáculo', 'bairro', 'cenaculo', true),
    (v_reg_id, 'Céu Azul (parte)', 'bairro', 'ceu-azul-parte', true),
    (v_reg_id, 'Comerciários', 'bairro', 'comerciarios', true),
    (v_reg_id, 'Copacabana', 'bairro', 'copacabana', true),
    (v_reg_id, 'Esplendor', 'bairro', 'esplendor', true),
    (v_reg_id, 'Europa', 'bairro', 'europa', true),
    (v_reg_id, 'Flamengo', 'bairro', 'flamengo', true),
    (v_reg_id, 'Gávea', 'bairro', 'gavea', true),
    (v_reg_id, 'Jardim dos Comerciários', 'bairro', 'jardim-dos-comerciarios', true),
    (v_reg_id, 'Jardim Leblon', 'bairro', 'jardim-leblon', true),
    (v_reg_id, 'Lagoa', 'bairro', 'lagoa', true),
    (v_reg_id, 'Landi', 'bairro', 'landi', true),
    (v_reg_id, 'Letícia', 'bairro', 'leticia', true),
    (v_reg_id, 'Mantiqueira', 'bairro', 'mantiqueira', true),
    (v_reg_id, 'Maria Helena', 'bairro', 'maria-helena', true),
    (v_reg_id, 'Minascaixa', 'bairro', 'minascaixa', true),
    (v_reg_id, 'Nova York', 'bairro', 'nova-york', true),
    (v_reg_id, 'Paraúna', 'bairro', 'parauna', true),
    (v_reg_id, 'Piratininga', 'bairro', 'piratininga', true),
    (v_reg_id, 'Rio Branco', 'bairro', 'rio-branco', true),
    (v_reg_id, 'Santa Mônica', 'bairro', 'santa-monica', true),
    (v_reg_id, 'São João Batista', 'bairro', 'sao-joao-batista', true),
    (v_reg_id, 'São Pedro Venda Nova', 'bairro', 'sao-pedro-venda-nova', true),
    (v_reg_id, 'Sinimbu', 'bairro', 'sinimbu', true),
    (v_reg_id, 'Venda Nova', 'bairro', 'venda-nova', true),
    (v_reg_id, 'Vila Kênia', 'bairro', 'vila-kenia', true),
    (v_reg_id, 'Vila Santa Branca', 'bairro', 'vila-santa-branca', true)
  ON CONFLICT (regional_id, slug) DO NOTHING;

  -- 10 — LINHA VERDE
  INSERT INTO public.regionais (nome, slug, ativo, ordem)
  VALUES ('LINHA VERDE', 'linha-verde', true, 10)
  ON CONFLICT (slug) DO UPDATE SET ordem = EXCLUDED.ordem
  RETURNING id INTO v_reg_id;

  INSERT INTO public.localidades (regional_id, nome, tipo, slug, ativo) VALUES
    (v_reg_id, 'Santa Luzia', 'cidade', 'santa-luzia', true),
    (v_reg_id, 'Lagoa Santa', 'cidade', 'lagoa-santa', true),
    (v_reg_id, 'Confins', 'cidade', 'confins', true),
    (v_reg_id, 'Pedro Leopoldo', 'cidade', 'pedro-leopoldo', true),
    (v_reg_id, 'Vespasiano', 'cidade', 'vespasiano', true),
    (v_reg_id, 'São José da Lapa', 'cidade', 'sao-jose-da-lapa', true),
    (v_reg_id, 'Matozinhos', 'cidade', 'matozinhos', true),
    (v_reg_id, 'Baldim', 'cidade', 'baldim', true)
  ON CONFLICT (regional_id, slug) DO NOTHING;

  -- 11 — 262
  INSERT INTO public.regionais (nome, slug, ativo, ordem)
  VALUES ('262', '262', true, 11)
  ON CONFLICT (slug) DO UPDATE SET ordem = EXCLUDED.ordem
  RETURNING id INTO v_reg_id;

  INSERT INTO public.localidades (regional_id, nome, tipo, slug, ativo) VALUES
    (v_reg_id, 'Mateus Leme', 'cidade', 'mateus-leme', true),
    (v_reg_id, 'Juatuba', 'cidade', 'juatuba', true),
    (v_reg_id, 'Florestal', 'cidade', 'florestal', true)
  ON CONFLICT (regional_id, slug) DO NOTHING;

  -- 12 — 040 NORTE
  INSERT INTO public.regionais (nome, slug, ativo, ordem)
  VALUES ('040 NORTE', '040-norte', true, 12)
  ON CONFLICT (slug) DO UPDATE SET ordem = EXCLUDED.ordem
  RETURNING id INTO v_reg_id;

  INSERT INTO public.localidades (regional_id, nome, tipo, slug, ativo) VALUES
    (v_reg_id, 'Ribeirão das Neves', 'cidade', 'ribeirao-das-neves', true),
    (v_reg_id, 'Esmeraldas', 'cidade', 'esmeraldas', true),
    (v_reg_id, 'Capim Branco', 'cidade', 'capim-branco', true),
    (v_reg_id, 'Sete Lagoas', 'cidade', 'sete-lagoas', true)
  ON CONFLICT (regional_id, slug) DO NOTHING;

  -- 13 — 040 SUL
  INSERT INTO public.regionais (nome, slug, ativo, ordem)
  VALUES ('040 SUL', '040-sul', true, 13)
  ON CONFLICT (slug) DO UPDATE SET ordem = EXCLUDED.ordem
  RETURNING id INTO v_reg_id;

  INSERT INTO public.localidades (regional_id, nome, tipo, slug, ativo) VALUES
    (v_reg_id, 'Nova Lima', 'cidade', 'nova-lima', true),
    (v_reg_id, 'Rio Acima', 'cidade', 'rio-acima', true),
    (v_reg_id, 'Raposos', 'cidade', 'raposos', true),
    (v_reg_id, 'Alphaville Lagoa dos Ingleses', 'bairro', 'alphaville-lagoa-dos-ingleses', true)
  ON CONFLICT (regional_id, slug) DO NOTHING;

  -- 14 — 381 NORTE
  INSERT INTO public.regionais (nome, slug, ativo, ordem)
  VALUES ('381 NORTE', '381-norte', true, 14)
  ON CONFLICT (slug) DO UPDATE SET ordem = EXCLUDED.ordem
  RETURNING id INTO v_reg_id;

  INSERT INTO public.localidades (regional_id, nome, tipo, slug, ativo) VALUES
    (v_reg_id, 'Nova União', 'cidade', 'nova-uniao', true),
    (v_reg_id, 'Caeté', 'cidade', 'caete', true),
    (v_reg_id, 'Taquaraçu de Minas', 'cidade', 'taquaracu-de-minas', true),
    (v_reg_id, 'Jaboticatubas', 'cidade', 'jaboticatubas', true)
  ON CONFLICT (regional_id, slug) DO NOTHING;

  -- 15 — 381 SUL
  INSERT INTO public.regionais (nome, slug, ativo, ordem)
  VALUES ('381 SUL', '381-sul', true, 15)
  ON CONFLICT (slug) DO UPDATE SET ordem = EXCLUDED.ordem
  RETURNING id INTO v_reg_id;

  INSERT INTO public.localidades (regional_id, nome, tipo, slug, ativo) VALUES
    (v_reg_id, 'Ibirité', 'cidade', 'ibirite', true),
    (v_reg_id, 'Sarzedo', 'cidade', 'sarzedo', true),
    (v_reg_id, 'São Joaquim de Bicas', 'cidade', 'sao-joaquim-de-bicas', true),
    (v_reg_id, 'Mário Campos', 'cidade', 'mario-campos', true),
    (v_reg_id, 'Itatiaiuçu', 'cidade', 'itatiaiucu', true),
    (v_reg_id, 'Igarapé', 'cidade', 'igarape', true),
    (v_reg_id, 'Itaguara', 'cidade', 'itaguara', true),
    (v_reg_id, 'Rio Manso', 'cidade', 'rio-manso', true)
  ON CONFLICT (regional_id, slug) DO NOTHING;

  -- 16 — BETIM
  INSERT INTO public.regionais (nome, slug, ativo, ordem)
  VALUES ('BETIM', 'betim', true, 16)
  ON CONFLICT (slug) DO UPDATE SET ordem = EXCLUDED.ordem
  RETURNING id INTO v_reg_id;

  INSERT INTO public.localidades (regional_id, nome, tipo, slug, ativo) VALUES
    (v_reg_id, 'Betim', 'cidade', 'betim', true)
  ON CONFLICT (regional_id, slug) DO NOTHING;

  -- 17 — CONTAGEM
  INSERT INTO public.regionais (nome, slug, ativo, ordem)
  VALUES ('CONTAGEM', 'contagem', true, 17)
  ON CONFLICT (slug) DO UPDATE SET ordem = EXCLUDED.ordem
  RETURNING id INTO v_reg_id;

  INSERT INTO public.localidades (regional_id, nome, tipo, slug, ativo) VALUES
    (v_reg_id, 'Contagem', 'cidade', 'contagem', true)
  ON CONFLICT (regional_id, slug) DO NOTHING;

  -- 18 — SABARÁ
  INSERT INTO public.regionais (nome, slug, ativo, ordem)
  VALUES ('SABARÁ', 'sabara', true, 18)
  ON CONFLICT (slug) DO UPDATE SET ordem = EXCLUDED.ordem
  RETURNING id INTO v_reg_id;

  INSERT INTO public.localidades (regional_id, nome, tipo, slug, ativo) VALUES
    (v_reg_id, 'Sabará', 'cidade', 'sabara', true)
  ON CONFLICT (regional_id, slug) DO NOTHING;
END $$;

NOTIFY pgrst, 'reload schema';
