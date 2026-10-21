-- ==================================================================
-- PRIMACOR - CONSOLIDATED DATABASE SCHEMA
-- Generated for new Supabase project: zkpfuotxkdbokytqtjgj
-- Total migrations consolidated: 69
-- ==================================================================

-- ------------------------------------------------------------------
-- Migration: 20260218145019_8d3a5e9d-3771-485d-8d38-b58c768ab948.sql
-- ------------------------------------------------------------------
-- Create orders table (shared globally, no user_id filter)
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  cliente TEXT NOT NULL,
  observacao TEXT,
  status TEXT NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'em_andamento', 'aguardando', 'em_revisao', 'concluido')),
  arquivado BOOLEAN NOT NULL DEFAULT false,
  criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view all orders
CREATE POLICY "Authenticated users can view all orders"
  ON public.orders FOR SELECT
  TO authenticated
  USING (true);

-- All authenticated users can create orders
CREATE POLICY "Authenticated users can create orders"
  ON public.orders FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- All authenticated users can update any order
CREATE POLICY "Authenticated users can update orders"
  ON public.orders FOR UPDATE
  TO authenticated
  USING (true);

-- All authenticated users can delete any order
CREATE POLICY "Authenticated users can delete orders"
  ON public.orders FOR DELETE
  TO authenticated
  USING (true);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;

-- ------------------------------------------------------------------
-- Migration: 20260218145304_5c908694-3ee5-485b-8e69-4d0368f77997.sql
-- ------------------------------------------------------------------
-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view profiles"
  ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, nome)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Add atualizado_por to orders
ALTER TABLE public.orders ADD COLUMN atualizado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Enable realtime on profiles
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;

-- ------------------------------------------------------------------
-- Migration: 20260218145538_712537ab-ca9e-4e1f-9ad2-0c849be0b148.sql
-- ------------------------------------------------------------------
-- Create role enum and user_roles table
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Authenticated users can read roles
CREATE POLICY "Authenticated can view roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can manage roles
CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------------
-- Migration: 20260218150007_09030a30-3e24-4592-bfdd-549055dc391e.sql
-- ------------------------------------------------------------------
-- Update CHECK constraint for new status values
ALTER TABLE public.orders DROP CONSTRAINT orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check 
  CHECK (status IN ('preparando_arquivo', 'aguardando_prova', 'aguardando_aprovacao', 'aguardando_novo_arquivo', 'arquivo_liberado'));

-- Migrate existing data to new statuses
UPDATE public.orders SET status = 'preparando_arquivo' WHERE status = 'novo';
UPDATE public.orders SET status = 'aguardando_prova' WHERE status = 'em_andamento';
UPDATE public.orders SET status = 'aguardando_aprovacao' WHERE status = 'aguardando';
UPDATE public.orders SET status = 'aguardando_novo_arquivo' WHERE status = 'em_revisao';
UPDATE public.orders SET status = 'arquivo_liberado' WHERE status = 'concluido';

-- Update default
ALTER TABLE public.orders ALTER COLUMN status SET DEFAULT 'preparando_arquivo';

-- ------------------------------------------------------------------
-- Migration: 20260218155717_d7ae583d-f19f-4ce9-a3f4-6cdf4cab2bbf.sql
-- ------------------------------------------------------------------
-- Table to log every status change with timestamps
CREATE TABLE public.order_status_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status_anterior TEXT,
  status_novo TEXT NOT NULL,
  alterado_por UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view status history"
  ON public.order_status_history FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert status history"
  ON public.order_status_history FOR INSERT
  WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_status_history;

-- Trigger to automatically log status changes on orders
CREATE OR REPLACE FUNCTION public.log_order_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- On INSERT, log the initial status
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.order_status_history (order_id, status_anterior, status_novo, alterado_por)
    VALUES (NEW.id, NULL, NEW.status, NEW.criado_por);
    RETURN NEW;
  END IF;

  -- On UPDATE, log only if status changed
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.order_status_history (order_id, status_anterior, status_novo, alterado_por)
    VALUES (NEW.id, OLD.status, NEW.status, NEW.atualizado_por);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_log_order_status_change
  AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.log_order_status_change();

-- ------------------------------------------------------------------
-- Migration: 20260220183657_3ba4c8d5-60c0-47dd-b55d-5cd9fff2281f.sql
-- ------------------------------------------------------------------
-- Update default status for new orders to 'fila_de_entrada'
ALTER TABLE public.orders ALTER COLUMN status SET DEFAULT 'fila_de_entrada';

-- ------------------------------------------------------------------
-- Migration: 20260220185046_39b021a6-2b6b-48ea-8fad-cb255ad8f365.sql
-- ------------------------------------------------------------------
ALTER TABLE public.orders DROP CONSTRAINT orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK (status = ANY (ARRAY['fila_de_entrada'::text, 'preparando_arquivo'::text, 'aguardando_prova'::text, 'aguardando_aprovacao'::text, 'aguardando_novo_arquivo'::text, 'arquivo_liberado'::text]));

-- ------------------------------------------------------------------
-- Migration: 20260224115121_d681afdc-528a-4e3a-9243-ac71c7c23a82.sql
-- ------------------------------------------------------------------
-- Add position column for ordering cards within each status column
ALTER TABLE public.orders ADD COLUMN posicao integer NOT NULL DEFAULT 0;

-- Set initial positions based on creation date
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY status ORDER BY created_at) - 1 AS rn
  FROM public.orders
)
UPDATE public.orders SET posicao = ranked.rn FROM ranked WHERE public.orders.id = ranked.id;

-- ------------------------------------------------------------------
-- Migration: 20260304173826_fc0fb465-d518-4ab4-843b-2e9ed725c0b3.sql
-- ------------------------------------------------------------------
ALTER TABLE public.orders ADD COLUMN saida_direta boolean NOT NULL DEFAULT false;

-- ------------------------------------------------------------------
-- Migration: 20260305134644_73adac20-fa2d-4bff-a516-f8b5d71088e6.sql
-- ------------------------------------------------------------------
ALTER TABLE public.orders ADD COLUMN prova_digital boolean NOT NULL DEFAULT false;
ALTER TABLE public.orders ADD COLUMN prova_email boolean NOT NULL DEFAULT false;

-- ------------------------------------------------------------------
-- Migration: 20260306142651_cc274e5c-8c68-4268-8bd8-214c620c0c4c.sql
-- ------------------------------------------------------------------
ALTER TABLE public.orders ADD COLUMN prioridade text NOT NULL DEFAULT 'normal';

-- ------------------------------------------------------------------
-- Migration: 20260306151904_d9187189-5724-4798-8a9b-849e3ea266da.sql
-- ------------------------------------------------------------------
ALTER TABLE public.orders ADD COLUMN endereco_entrega text DEFAULT null;

-- ------------------------------------------------------------------
-- Migration: 20260306172342_3e8d2869-c758-4949-b34f-1db39ee95119.sql
-- ------------------------------------------------------------------
ALTER TABLE public.orders DROP CONSTRAINT orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK (status = ANY (ARRAY['fila_de_entrada'::text, 'preparando_arquivo'::text, 'aguardando_prova'::text, 'rota'::text, 'aguardando_aprovacao'::text, 'aguardando_novo_arquivo'::text, 'arquivo_liberado'::text]));

-- ------------------------------------------------------------------
-- Migration: 20260309113050_73fd52aa-171b-44b9-a427-5d2bc8126595.sql
-- ------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN destinatario text DEFAULT null,
  ADD COLUMN entregue_para text DEFAULT null,
  ADD COLUMN entregue_em timestamptz DEFAULT null;

-- ------------------------------------------------------------------
-- Migration: 20260309113632_beff27d2-c003-43c2-acbf-8b05d9ec6273.sql
-- ------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN urgente boolean NOT NULL DEFAULT false,
  ADD COLUMN prazo timestamptz DEFAULT null;

-- Migrate existing alta priority to urgente
UPDATE public.orders SET urgente = true WHERE prioridade = 'alta';

-- ------------------------------------------------------------------
-- Migration: 20260309115300_5db0c6da-2ce4-42ad-81c6-1d056bb80739.sql
-- ------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS setor text DEFAULT null,
  ADD COLUMN IF NOT EXISTS setor_status text DEFAULT 'entrada',
  ADD COLUMN IF NOT EXISTS maquina text DEFAULT null;

-- ------------------------------------------------------------------
-- Migration: 20260309120903_098e03e5-be80-49ae-8990-3275e94b1df6.sql
-- ------------------------------------------------------------------
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS pausado boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS pausado_em timestamptz,
ADD COLUMN IF NOT EXISTS tempo_pausado_ms bigint NOT NULL DEFAULT 0;

-- ------------------------------------------------------------------
-- Migration: 20260309123307_c828303c-43a4-456e-921a-c23b953d9921.sql
-- ------------------------------------------------------------------
-- Tabela de vendedores
CREATE TABLE public.vendedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vendedores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view vendedores" ON public.vendedores
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert vendedores" ON public.vendedores
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update vendedores" ON public.vendedores
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated can delete vendedores" ON public.vendedores
  FOR DELETE TO authenticated USING (true);

-- Tabela de equipamentos
CREATE TABLE public.equipamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.equipamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view equipamentos" ON public.equipamentos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert equipamentos" ON public.equipamentos
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update equipamentos" ON public.equipamentos
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated can delete equipamentos" ON public.equipamentos
  FOR DELETE TO authenticated USING (true);

-- Novas colunas na tabela orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS vendedor text,
  ADD COLUMN IF NOT EXISTS tipo_trabalho text,
  ADD COLUMN IF NOT EXISTS equipamentos text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS acabamentos text[] DEFAULT '{}';

-- ------------------------------------------------------------------
-- Migration: 20260309125026_a83c002e-df3e-4034-a2a3-bb657558a6fe.sql
-- ------------------------------------------------------------------
-- Expand app_role enum with new roles
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'coordenador';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'operador';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'vendedor';

-- Add setor_vinculado to profiles for operators
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS setor_vinculado text;

-- Update has_role to also support checking multiple roles via a helper
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::text FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;

-- ------------------------------------------------------------------
-- Migration: 20260309134344_96b23927-030e-42bc-ac3c-c67a0f8f2cc3.sql
-- ------------------------------------------------------------------
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'orcamentista';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'impressor';

-- ------------------------------------------------------------------
-- Migration: 20260309180502_cf251579-e2cc-43fd-b98a-0feb05f17adf.sql
-- ------------------------------------------------------------------
-- Update existing orders that have any of the 3 digital equipment names
UPDATE orders SET equipamentos = array_replace(equipamentos, 'DIGITAL - ACURIOPRESS 6100', 'DIGITAL') WHERE equipamentos @> ARRAY['DIGITAL - ACURIOPRESS 6100'];
UPDATE orders SET equipamentos = array_replace(equipamentos, 'DIGITAL - ACURIOPRESS 7100', 'DIGITAL') WHERE equipamentos @> ARRAY['DIGITAL - ACURIOPRESS 7100'];
UPDATE orders SET equipamentos = array_replace(equipamentos, 'DIGITAL - PB', 'DIGITAL') WHERE equipamentos @> ARRAY['DIGITAL - PB'];

-- Remove duplicates from orders that now have multiple 'DIGITAL' entries
UPDATE orders SET equipamentos = ARRAY(SELECT DISTINCT unnest(equipamentos)) WHERE 'DIGITAL' = ANY(equipamentos);

-- Delete the 3 old digital equipment entries
DELETE FROM equipamentos WHERE nome IN ('DIGITAL - ACURIOPRESS 6100', 'DIGITAL - ACURIOPRESS 7100', 'DIGITAL - PB');

-- Insert the single DIGITAL entry
INSERT INTO equipamentos (nome) VALUES ('DIGITAL');

-- ------------------------------------------------------------------
-- Migration: 20260309180718_0becd619-b125-436e-b678-c5c1aad95978.sql
-- ------------------------------------------------------------------
-- Update existing orders: replace old acabamento names with simplified versions
UPDATE orders SET acabamentos = array_replace(acabamentos, 'CORTE/VINCO - ROSSET F2', 'CORTE/VINCO') WHERE acabamentos @> ARRAY['CORTE/VINCO - ROSSET F2'];
UPDATE orders SET acabamentos = array_replace(acabamentos, 'CORTE/VINCO - CV 2 (NOVA)', 'CORTE/VINCO') WHERE acabamentos @> ARRAY['CORTE/VINCO - CV 2 (NOVA)'];
UPDATE orders SET acabamentos = array_replace(acabamentos, 'ALCEAMENTO - SPF 200A', 'ALCEAMENTO') WHERE acabamentos @> ARRAY['ALCEAMENTO - SPF 200A'];
UPDATE orders SET acabamentos = array_replace(acabamentos, 'ALCEAMENTO - SOMENTE INTERCALAÇÃO', 'INTERCALAÇÃO') WHERE acabamentos @> ARRAY['ALCEAMENTO - SOMENTE INTERCALAÇÃO'];
UPDATE orders SET acabamentos = array_replace(acabamentos, 'DOBRA - TITAN 490B', 'DOBRA') WHERE acabamentos @> ARRAY['DOBRA - TITAN 490B'];
UPDATE orders SET acabamentos = array_replace(acabamentos, 'CAPA-DURA - CASEMAKER 450', 'CAPA-DURA') WHERE acabamentos @> ARRAY['CAPA-DURA - CASEMAKER 450'];
UPDATE orders SET acabamentos = array_replace(acabamentos, 'LAMINAÇÃO - PSG 680D', 'LAMINAÇÃO') WHERE acabamentos @> ARRAY['LAMINAÇÃO - PSG 680D'];
UPDATE orders SET acabamentos = array_replace(acabamentos, 'LAMINAÇÃO - THINKER SKBF 950', 'LAMINAÇÃO') WHERE acabamentos @> ARRAY['LAMINAÇÃO - THINKER SKBF 950'];
UPDATE orders SET acabamentos = array_replace(acabamentos, 'COLA - BABY BINDER SS', 'COLA') WHERE acabamentos @> ARRAY['COLA - BABY BINDER SS'];
UPDATE orders SET acabamentos = array_replace(acabamentos, 'PLOTTER - CG-60 SRIII AUTOCUTTER A3', 'PLOTTER') WHERE acabamentos @> ARRAY['PLOTTER - CG-60 SRIII AUTOCUTTER A3'];
UPDATE orders SET acabamentos = array_replace(acabamentos, 'CARTUCHEIRA - COLADEIRA DE CARTUCHO ZH800G', 'CARTUCHEIRA') WHERE acabamentos @> ARRAY['CARTUCHEIRA - COLADEIRA DE CARTUCHO ZH800G'];
UPDATE orders SET acabamentos = array_replace(acabamentos, 'SERRILHADEIRA - JMAC MASTER 700MM', 'SERRILHADEIRA') WHERE acabamentos @> ARRAY['SERRILHADEIRA - JMAC MASTER 700MM'];
UPDATE orders SET acabamentos = array_replace(acabamentos, 'HOT STAMPING - CATU', 'HOT STAMPING') WHERE acabamentos @> ARRAY['HOT STAMPING - CATU'];

-- Remove duplicates
UPDATE orders SET acabamentos = ARRAY(SELECT DISTINCT unnest(acabamentos)) WHERE acabamentos IS NOT NULL AND array_length(acabamentos, 1) > 0;

-- ------------------------------------------------------------------
-- Migration: 20260310175803_9de2fee5-49a7-43ca-9521-a41e730dd53e.sql
-- ------------------------------------------------------------------
ALTER TABLE public.orders ADD COLUMN parent_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL DEFAULT NULL;

-- ------------------------------------------------------------------
-- Migration: 20260310200911_c15aa91b-41e2-483e-ab02-97dcf13b2965.sql
-- ------------------------------------------------------------------
-- Tabela de avisos
CREATE TABLE public.avisos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'info',
  criado_por UUID NOT NULL,
  destinatario_id UUID DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.avisos ENABLE ROW LEVEL SECURITY;

-- Todos autenticados podem ver avisos direcionados a eles ou globais
CREATE POLICY "Users can view their avisos" ON public.avisos
  FOR SELECT TO authenticated
  USING (destinatario_id IS NULL OR destinatario_id = auth.uid() OR criado_por = auth.uid());

-- Apenas admins podem criar avisos
CREATE POLICY "Admins can insert avisos" ON public.avisos
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Apenas admins podem deletar avisos
CREATE POLICY "Admins can delete avisos" ON public.avisos
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Tabela de avisos lidos
CREATE TABLE public.avisos_lidos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  aviso_id UUID NOT NULL REFERENCES public.avisos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  lido_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(aviso_id, user_id)
);

ALTER TABLE public.avisos_lidos ENABLE ROW LEVEL SECURITY;

-- Usuários podem ver seus próprios registros de leitura
CREATE POLICY "Users can view own reads" ON public.avisos_lidos
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Usuários podem marcar como lido
CREATE POLICY "Users can mark as read" ON public.avisos_lidos
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Enable realtime for avisos
ALTER PUBLICATION supabase_realtime ADD TABLE public.avisos;

-- ------------------------------------------------------------------
-- Migration: 20260311170614_1ade9d10-c214-46f4-aa4c-06bcce7725d1.sql
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only update updated_at when meaningful fields change, not just posicao
  IF (TG_OP = 'UPDATE' AND 
      OLD.status IS NOT DISTINCT FROM NEW.status AND
      OLD.titulo IS NOT DISTINCT FROM NEW.titulo AND
      OLD.descricao IS NOT DISTINCT FROM NEW.descricao AND
      OLD.cliente IS NOT DISTINCT FROM NEW.cliente AND
      OLD.observacao IS NOT DISTINCT FROM NEW.observacao AND
      OLD.setor IS NOT DISTINCT FROM NEW.setor AND
      OLD.setor_status IS NOT DISTINCT FROM NEW.setor_status AND
      OLD.maquina IS NOT DISTINCT FROM NEW.maquina AND
      OLD.arquivado IS NOT DISTINCT FROM NEW.arquivado AND
      OLD.atualizado_por IS NOT DISTINCT FROM NEW.atualizado_por AND
      OLD.urgente IS NOT DISTINCT FROM NEW.urgente AND
      OLD.prazo IS NOT DISTINCT FROM NEW.prazo AND
      OLD.pausado IS NOT DISTINCT FROM NEW.pausado AND
      OLD.saida_direta IS NOT DISTINCT FROM NEW.saida_direta AND
      OLD.prova_digital IS NOT DISTINCT FROM NEW.prova_digital AND
      OLD.prova_email IS NOT DISTINCT FROM NEW.prova_email AND
      OLD.vendedor IS NOT DISTINCT FROM NEW.vendedor AND
      OLD.equipamentos IS NOT DISTINCT FROM NEW.equipamentos AND
      OLD.acabamentos IS NOT DISTINCT FROM NEW.acabamentos AND
      OLD.endereco_entrega IS NOT DISTINCT FROM NEW.endereco_entrega AND
      OLD.destinatario IS NOT DISTINCT FROM NEW.destinatario AND
      OLD.entregue_para IS NOT DISTINCT FROM NEW.entregue_para AND
      OLD.entregue_em IS NOT DISTINCT FROM NEW.entregue_em
  ) THEN
    -- Only posicao changed, keep old updated_at
    NEW.updated_at = OLD.updated_at;
    RETURN NEW;
  END IF;
  
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- ------------------------------------------------------------------
-- Migration: 20260314164538_b99f6ae3-9549-4d46-a1ef-8efeb37433f7.sql
-- ------------------------------------------------------------------
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS processos text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS nf text,
  ADD COLUMN IF NOT EXISTS protocolo text,
  ADD COLUMN IF NOT EXISTS empresa_entrega text,
  ADD COLUMN IF NOT EXISTS obs_entrega text;

-- Update the updated_at trigger to include new fields
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (TG_OP = 'UPDATE' AND 
      OLD.status IS NOT DISTINCT FROM NEW.status AND
      OLD.titulo IS NOT DISTINCT FROM NEW.titulo AND
      OLD.descricao IS NOT DISTINCT FROM NEW.descricao AND
      OLD.cliente IS NOT DISTINCT FROM NEW.cliente AND
      OLD.observacao IS NOT DISTINCT FROM NEW.observacao AND
      OLD.setor IS NOT DISTINCT FROM NEW.setor AND
      OLD.setor_status IS NOT DISTINCT FROM NEW.setor_status AND
      OLD.maquina IS NOT DISTINCT FROM NEW.maquina AND
      OLD.arquivado IS NOT DISTINCT FROM NEW.arquivado AND
      OLD.atualizado_por IS NOT DISTINCT FROM NEW.atualizado_por AND
      OLD.urgente IS NOT DISTINCT FROM NEW.urgente AND
      OLD.prazo IS NOT DISTINCT FROM NEW.prazo AND
      OLD.pausado IS NOT DISTINCT FROM NEW.pausado AND
      OLD.saida_direta IS NOT DISTINCT FROM NEW.saida_direta AND
      OLD.prova_digital IS NOT DISTINCT FROM NEW.prova_digital AND
      OLD.prova_email IS NOT DISTINCT FROM NEW.prova_email AND
      OLD.vendedor IS NOT DISTINCT FROM NEW.vendedor AND
      OLD.processos IS NOT DISTINCT FROM NEW.processos AND
      OLD.endereco_entrega IS NOT DISTINCT FROM NEW.endereco_entrega AND
      OLD.destinatario IS NOT DISTINCT FROM NEW.destinatario AND
      OLD.entregue_para IS NOT DISTINCT FROM NEW.entregue_para AND
      OLD.entregue_em IS NOT DISTINCT FROM NEW.entregue_em AND
      OLD.nf IS NOT DISTINCT FROM NEW.nf AND
      OLD.protocolo IS NOT DISTINCT FROM NEW.protocolo AND
      OLD.empresa_entrega IS NOT DISTINCT FROM NEW.empresa_entrega AND
      OLD.obs_entrega IS NOT DISTINCT FROM NEW.obs_entrega
  ) THEN
    NEW.updated_at = OLD.updated_at;
    RETURN NEW;
  END IF;
  
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- ------------------------------------------------------------------
-- Migration: 20260314171717_01a8ac0d-b5a7-4c0d-965f-ed0cf3c24f3b.sql
-- ------------------------------------------------------------------
-- Add new ENTREGA columns
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tipo_entrega text[] DEFAULT '{}'::text[];
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS entrega_para text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS entrega_endereco text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS entrega_ac text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS entrega_data_limite timestamp with time zone;

-- Update trigger to include new fields
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (TG_OP = 'UPDATE' AND 
      OLD.status IS NOT DISTINCT FROM NEW.status AND
      OLD.titulo IS NOT DISTINCT FROM NEW.titulo AND
      OLD.descricao IS NOT DISTINCT FROM NEW.descricao AND
      OLD.cliente IS NOT DISTINCT FROM NEW.cliente AND
      OLD.observacao IS NOT DISTINCT FROM NEW.observacao AND
      OLD.setor IS NOT DISTINCT FROM NEW.setor AND
      OLD.setor_status IS NOT DISTINCT FROM NEW.setor_status AND
      OLD.maquina IS NOT DISTINCT FROM NEW.maquina AND
      OLD.arquivado IS NOT DISTINCT FROM NEW.arquivado AND
      OLD.atualizado_por IS NOT DISTINCT FROM NEW.atualizado_por AND
      OLD.urgente IS NOT DISTINCT FROM NEW.urgente AND
      OLD.prazo IS NOT DISTINCT FROM NEW.prazo AND
      OLD.pausado IS NOT DISTINCT FROM NEW.pausado AND
      OLD.saida_direta IS NOT DISTINCT FROM NEW.saida_direta AND
      OLD.prova_digital IS NOT DISTINCT FROM NEW.prova_digital AND
      OLD.prova_email IS NOT DISTINCT FROM NEW.prova_email AND
      OLD.vendedor IS NOT DISTINCT FROM NEW.vendedor AND
      OLD.processos IS NOT DISTINCT FROM NEW.processos AND
      OLD.endereco_entrega IS NOT DISTINCT FROM NEW.endereco_entrega AND
      OLD.destinatario IS NOT DISTINCT FROM NEW.destinatario AND
      OLD.entregue_para IS NOT DISTINCT FROM NEW.entregue_para AND
      OLD.entregue_em IS NOT DISTINCT FROM NEW.entregue_em AND
      OLD.nf IS NOT DISTINCT FROM NEW.nf AND
      OLD.protocolo IS NOT DISTINCT FROM NEW.protocolo AND
      OLD.empresa_entrega IS NOT DISTINCT FROM NEW.empresa_entrega AND
      OLD.obs_entrega IS NOT DISTINCT FROM NEW.obs_entrega AND
      OLD.tipo_entrega IS NOT DISTINCT FROM NEW.tipo_entrega AND
      OLD.entrega_para IS NOT DISTINCT FROM NEW.entrega_para AND
      OLD.entrega_endereco IS NOT DISTINCT FROM NEW.entrega_endereco AND
      OLD.entrega_ac IS NOT DISTINCT FROM NEW.entrega_ac AND
      OLD.entrega_data_limite IS NOT DISTINCT FROM NEW.entrega_data_limite
  ) THEN
    NEW.updated_at = OLD.updated_at;
    RETURN NEW;
  END IF;
  
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- ------------------------------------------------------------------
-- Migration: 20260314203940_7fdf6e81-8eeb-49d4-bb09-d824fa08549e.sql
-- ------------------------------------------------------------------
ALTER TABLE public.orders ADD COLUMN obs_prova text DEFAULT NULL;

-- ------------------------------------------------------------------
-- Migration: 20260314205529_251566fc-7a4a-4acc-82de-848c2751c2ba.sql
-- ------------------------------------------------------------------
ALTER TABLE public.orders ADD COLUMN entregue_por text DEFAULT NULL;

-- ------------------------------------------------------------------
-- Migration: 20260315221057_a37b6d47-46a3-4dff-8e83-5c8c96f42650.sql
-- ------------------------------------------------------------------
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS urgente_prova boolean NOT NULL DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS urgente_impressao boolean NOT NULL DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS urgente_acabamento boolean NOT NULL DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS urgente_expedicao boolean NOT NULL DEFAULT false;

-- Migrate existing data: if urgente is true, set all new fields to true
UPDATE public.orders SET urgente_prova = true, urgente_impressao = true, urgente_acabamento = true, urgente_expedicao = true WHERE urgente = true;

-- ------------------------------------------------------------------
-- Migration: 20260318101358_25850022-839d-4ade-861e-d9404e72e140.sql
-- ------------------------------------------------------------------
ALTER TABLE public.orders ADD COLUMN digital_color boolean NOT NULL DEFAULT false;
ALTER TABLE public.orders ADD COLUMN digital_pb boolean NOT NULL DEFAULT false;

-- ------------------------------------------------------------------
-- Migration: 20260330115452_fb1045fb-179b-4201-8d13-58ac569b96af.sql
-- ------------------------------------------------------------------
CREATE POLICY "Admins can view all avisos_lidos"
ON public.avisos_lidos
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- ------------------------------------------------------------------
-- Migration: 20260404150514_1688bf13-c750-469a-95c5-f3a05df56caa.sql
-- ------------------------------------------------------------------
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

-- ------------------------------------------------------------------
-- Migration: 20260404163012_afd781c4-94ba-44a6-aade-d5ac31698dc6.sql
-- ------------------------------------------------------------------
-- Update auto-create to also copy entrega fields
CREATE OR REPLACE FUNCTION public.auto_create_faturamento_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.setor IS NULL AND NEW.arquivado = false THEN
    INSERT INTO public.orders (
      titulo, descricao, cliente, vendedor, observacao,
      nf, protocolo, empresa_entrega, obs_entrega,
      tipo_entrega, entrega_para, entrega_endereco, entrega_ac, entrega_data_limite,
      setor, setor_status, posicao,
      parent_order_id, criado_por, atualizado_por,
      status, arquivado
    ) VALUES (
      NEW.titulo, NEW.descricao, NEW.cliente, NEW.vendedor, NEW.observacao,
      NEW.nf, NEW.protocolo, NEW.empresa_entrega, NEW.obs_entrega,
      NEW.tipo_entrega, NEW.entrega_para, NEW.entrega_endereco, NEW.entrega_ac, NEW.entrega_data_limite,
      'faturamento', 'entrada', 9999,
      NEW.id, NEW.criado_por, NEW.atualizado_por,
      NEW.status, false
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Update sync to also propagate entrega fields
CREATE OR REPLACE FUNCTION public.sync_faturamento_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
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
      tipo_entrega = NEW.tipo_entrega,
      entrega_para = NEW.entrega_para,
      entrega_endereco = NEW.entrega_endereco,
      entrega_ac = NEW.entrega_ac,
      entrega_data_limite = NEW.entrega_data_limite,
      atualizado_por = NEW.atualizado_por
    WHERE parent_order_id = NEW.id
      AND setor = 'faturamento';
  END IF;
  RETURN NEW;
END;
$$;

-- Recreate sync trigger with additional fields in WHEN clause
DROP TRIGGER IF EXISTS trg_sync_faturamento ON public.orders;
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
    OLD.obs_entrega IS DISTINCT FROM NEW.obs_entrega OR
    OLD.tipo_entrega IS DISTINCT FROM NEW.tipo_entrega OR
    OLD.entrega_para IS DISTINCT FROM NEW.entrega_para OR
    OLD.entrega_endereco IS DISTINCT FROM NEW.entrega_endereco OR
    OLD.entrega_ac IS DISTINCT FROM NEW.entrega_ac OR
    OLD.entrega_data_limite IS DISTINCT FROM NEW.entrega_data_limite
  )
  EXECUTE FUNCTION public.sync_faturamento_order();

-- ------------------------------------------------------------------
-- Migration: 20260404163249_4ba311b0-827b-4a52-9bb1-4f23638ccaee.sql
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_create_faturamento_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.setor IS NULL AND NEW.arquivado = false THEN
    INSERT INTO public.orders (
      titulo, descricao, cliente, vendedor, observacao,
      nf, protocolo, empresa_entrega, obs_entrega,
      tipo_entrega, entrega_para, entrega_endereco, entrega_ac, entrega_data_limite,
      prazo,
      setor, setor_status, posicao,
      parent_order_id, criado_por, atualizado_por,
      status, arquivado
    ) VALUES (
      NEW.titulo, NEW.descricao, NEW.cliente, NEW.vendedor, NEW.observacao,
      NEW.nf, NEW.protocolo, NEW.empresa_entrega, NEW.obs_entrega,
      NEW.tipo_entrega, NEW.entrega_para, NEW.entrega_endereco, NEW.entrega_ac, NEW.entrega_data_limite,
      NEW.prazo,
      'faturamento', 'entrada', 9999,
      NEW.id, NEW.criado_por, NEW.atualizado_por,
      NEW.status, false
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_faturamento_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
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
      tipo_entrega = NEW.tipo_entrega,
      entrega_para = NEW.entrega_para,
      entrega_endereco = NEW.entrega_endereco,
      entrega_ac = NEW.entrega_ac,
      entrega_data_limite = NEW.entrega_data_limite,
      prazo = NEW.prazo,
      atualizado_por = NEW.atualizado_por
    WHERE parent_order_id = NEW.id
      AND setor = 'faturamento';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_faturamento ON public.orders;
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
    OLD.obs_entrega IS DISTINCT FROM NEW.obs_entrega OR
    OLD.tipo_entrega IS DISTINCT FROM NEW.tipo_entrega OR
    OLD.entrega_para IS DISTINCT FROM NEW.entrega_para OR
    OLD.entrega_endereco IS DISTINCT FROM NEW.entrega_endereco OR
    OLD.entrega_ac IS DISTINCT FROM NEW.entrega_ac OR
    OLD.entrega_data_limite IS DISTINCT FROM NEW.entrega_data_limite OR
    OLD.prazo IS DISTINCT FROM NEW.prazo
  )
  EXECUTE FUNCTION public.sync_faturamento_order();

-- ------------------------------------------------------------------
-- Migration: 20260404164341_d60ec164-df2b-4f97-9b22-c59d084e9d3e.sql
-- ------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS fat_cnpj_ok boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fat_cnpj_obs text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fat_retencao_iss_ok boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fat_retencao_iss_obs text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fat_retencoes_federais_ok boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fat_retencoes_federais_obs text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fat_limite_emissao_ok boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fat_limite_emissao_obs text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fat_envio_nf_ok boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fat_envio_nf_obs text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fat_ocpp_ok boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fat_ocpp_obs text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fat_restricao_credito_ok boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fat_restricao_credito_obs text DEFAULT NULL;

-- ------------------------------------------------------------------
-- Migration: 20260404170228_c3b428e8-b973-4209-84b9-7753cb5dbd43.sql
-- ------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN fat_cnpj_pendente boolean NOT NULL DEFAULT false,
  ADD COLUMN fat_retencao_iss_pendente boolean NOT NULL DEFAULT false,
  ADD COLUMN fat_retencoes_federais_pendente boolean NOT NULL DEFAULT false,
  ADD COLUMN fat_limite_emissao_pendente boolean NOT NULL DEFAULT false,
  ADD COLUMN fat_envio_nf_pendente boolean NOT NULL DEFAULT false,
  ADD COLUMN fat_ocpp_pendente boolean NOT NULL DEFAULT false,
  ADD COLUMN fat_restricao_credito_pendente boolean NOT NULL DEFAULT false;

-- ------------------------------------------------------------------
-- Migration: 20260404191505_0746fa78-6b5e-4f31-aa52-3632e982abb4.sql
-- ------------------------------------------------------------------
-- Add manutenção-specific columns to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS om_numero integer;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS categoria_manut text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS equipamento_manut text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS setor_manut text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS solucao text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS fornecedor_manut text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS endereco_manut text;

-- Create sequence for OM numbering
CREATE SEQUENCE IF NOT EXISTS public.om_numero_seq START WITH 1 INCREMENT BY 1;

-- Create trigger function to auto-assign OM number
CREATE OR REPLACE FUNCTION public.assign_om_numero()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.setor = 'manutencao' AND NEW.om_numero IS NULL THEN
    NEW.om_numero := nextval('public.om_numero_seq');
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trg_assign_om_numero ON public.orders;
CREATE TRIGGER trg_assign_om_numero
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_om_numero();

-- ------------------------------------------------------------------
-- Migration: 20260404205438_95925c5d-714d-4b64-abdf-4716768130ae.sql
-- ------------------------------------------------------------------
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS responsavel_manut text DEFAULT NULL;

-- ------------------------------------------------------------------
-- Migration: 20260404221346_6c7a137f-f105-41c5-b799-752e182431f1.sql
-- ------------------------------------------------------------------
ALTER SEQUENCE public.om_numero_seq RESTART WITH 1;

-- ------------------------------------------------------------------
-- Migration: 20260404230845_57bb087d-d5ed-444b-9c6e-6e2743598881.sql
-- ------------------------------------------------------------------
-- Sequence for OC numbering
CREATE SEQUENCE IF NOT EXISTS public.oc_numero_seq START WITH 1;

-- Add compras-specific columns to orders table
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS oc_numero integer,
  ADD COLUMN IF NOT EXISTS categoria_compra text,
  ADD COLUMN IF NOT EXISTS responsavel_compra text,
  ADD COLUMN IF NOT EXISTS fornecedor_compra text,
  ADD COLUMN IF NOT EXISTS vendedor_compra text,
  ADD COLUMN IF NOT EXISTS endereco_compra text;

-- Auto-assign oc_numero on insert for compras orders
CREATE OR REPLACE FUNCTION public.assign_oc_numero()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.setor = 'compras' AND NEW.oc_numero IS NULL THEN
    NEW.oc_numero := nextval('public.oc_numero_seq');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_oc_numero ON public.orders;
CREATE TRIGGER trg_assign_oc_numero
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_oc_numero();

-- ------------------------------------------------------------------
-- Migration: 20260405000351_4b82c1ab-cca2-434b-9e98-c2b417f2d6ca.sql
-- ------------------------------------------------------------------
-- Add NC-specific columns to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS nc_numero integer;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS reclamante_nc text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS categoria_nc text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS endereco_nc text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS os_ref_nc text;

-- Create sequence for NC numbering
CREATE SEQUENCE IF NOT EXISTS public.nc_numero_seq START WITH 1 INCREMENT BY 1;

-- Create trigger function for auto-assigning NC number
CREATE OR REPLACE FUNCTION public.assign_nc_numero()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.setor = 'nao_conformidade' AND NEW.nc_numero IS NULL THEN
    NEW.nc_numero := nextval('public.nc_numero_seq');
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trg_assign_nc_numero ON public.orders;
CREATE TRIGGER trg_assign_nc_numero
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_nc_numero();

-- ------------------------------------------------------------------
-- Migration: 20260405140542_8e840622-5a57-4875-8b88-adfa942e2678.sql
-- ------------------------------------------------------------------
ALTER TABLE public.equipamentos
  ADD COLUMN IF NOT EXISTS codigo text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS setor text,
  ADD COLUMN IF NOT EXISTS fabricante text,
  ADD COLUMN IF NOT EXISTS modelo text,
  ADD COLUMN IF NOT EXISTS ano_fabricacao integer,
  ADD COLUMN IF NOT EXISTS especificacoes text,
  ADD COLUMN IF NOT EXISTS consumiveis text,
  ADD COLUMN IF NOT EXISTS pecas_sobressalentes text,
  ADD COLUMN IF NOT EXISTS manutencoes text,
  ADD COLUMN IF NOT EXISTS apontamentos text;

-- ------------------------------------------------------------------
-- Migration: 20260405140955_1be602f5-0eab-4185-944b-ccec36fff068.sql
-- ------------------------------------------------------------------
ALTER TABLE public.equipamentos ADD COLUMN IF NOT EXISTS operadores text[] DEFAULT '{}'::text[];

-- ------------------------------------------------------------------
-- Migration: 20260405145634_20b9f8bf-75e9-4115-8bec-26b939ebdcc4.sql
-- ------------------------------------------------------------------
-- Create sector_history table to track sector transitions
CREATE TABLE public.sector_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  setor_anterior TEXT,
  setor_novo TEXT,
  setor_status_novo TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sector_history ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated users can view sector history"
  ON public.sector_history FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert sector history"
  ON public.sector_history FOR INSERT TO authenticated WITH CHECK (true);

-- Index for fast lookup by order_id
CREATE INDEX idx_sector_history_order_id ON public.sector_history(order_id);

-- Trigger function to log sector changes
CREATE OR REPLACE FUNCTION public.log_sector_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (OLD.setor IS DISTINCT FROM NEW.setor) THEN
    INSERT INTO public.sector_history (order_id, setor_anterior, setor_novo, setor_status_novo)
    VALUES (NEW.id, OLD.setor, NEW.setor, NEW.setor_status);
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger on orders table
CREATE TRIGGER track_sector_changes
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.log_sector_change();

-- Backfill: for archived orders that have a setor set, create at least one entry
-- so we have minimal data for existing archived orders
INSERT INTO public.sector_history (order_id, setor_anterior, setor_novo, setor_status_novo, created_at)
SELECT id, NULL, setor, setor_status, 
  COALESCE(
    (SELECT MAX(created_at) FROM order_status_history WHERE order_id = orders.id),
    orders.created_at
  )
FROM orders
WHERE setor IS NOT NULL AND arquivado = true;

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.sector_history;

-- ------------------------------------------------------------------
-- Migration: 20260405150110_55c96472-1613-451b-9b7c-475027d43268.sql
-- ------------------------------------------------------------------
ALTER TABLE public.orders ADD COLUMN causa_nc TEXT DEFAULT NULL;

-- ------------------------------------------------------------------
-- Migration: 20260406125720_18eea042-60e9-44b9-b4f4-7d9c64d53f64.sql
-- ------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_orders_setor ON public.orders (setor);
CREATE INDEX IF NOT EXISTS idx_orders_arquivado ON public.orders (arquivado);
CREATE INDEX IF NOT EXISTS idx_orders_posicao ON public.orders (posicao);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_setor_arquivado ON public.orders (setor, arquivado);
CREATE INDEX IF NOT EXISTS idx_orders_setor_status ON public.orders (setor, setor_status);

-- ------------------------------------------------------------------
-- Migration: 20260406133807_15ec1e33-b8b7-4d6d-996d-88c32901af3b.sql
-- ------------------------------------------------------------------
-- Fase 1: Índice composto para queries de ordens ativas por setor
-- Substitui consultas que filtram por arquivado + setor + posicao
CREATE INDEX IF NOT EXISTS idx_orders_active_setor_posicao
  ON public.orders (arquivado, setor, posicao)
  WHERE arquivado = false;

-- Índice para a página de concluídos (arquivadas, ordenadas por updated_at)
CREATE INDEX IF NOT EXISTS idx_orders_archived_updated
  ON public.orders (arquivado, updated_at DESC)
  WHERE arquivado = true;

-- ------------------------------------------------------------------
-- Migration: 20260406134012_5060d8a6-f1a2-4f5d-9703-4021aaf42395.sql
-- ------------------------------------------------------------------
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

-- ------------------------------------------------------------------
-- Migration: 20260406135038_b29d6568-fbf4-4075-ade5-a6d3aef762fd.sql
-- ------------------------------------------------------------------
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

-- ------------------------------------------------------------------
-- Migration: 20260408225809_e8d6128b-91b0-4758-a69c-987dc8bd81ad.sql
-- ------------------------------------------------------------------
CREATE TABLE public.user_presence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  last_seen timestamp with time zone NOT NULL DEFAULT now(),
  logged_in_at timestamp with time zone NOT NULL DEFAULT now(),
  last_logout_at timestamp with time zone,
  last_session_duration_ms bigint DEFAULT 0
);

ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view presence"
  ON public.user_presence FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can upsert own presence"
  ON public.user_presence FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own presence"
  ON public.user_presence FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- ------------------------------------------------------------------
-- Migration: 20260409102553_c46636a7-7452-4bac-9199-993995f277d5.sql
-- ------------------------------------------------------------------
ALTER TABLE public.orders DROP CONSTRAINT orders_status_check;

ALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK (
  status = ANY (ARRAY[
    'fila_de_entrada',
    'preparando_arquivo',
    'operador_2',
    'operador_3',
    'aguardando_prova',
    'aguardando_aprovacao',
    'aguardando_novo_arquivo',
    'arquivo_liberado',
    'rota'
  ])
);

-- ------------------------------------------------------------------
-- Migration: 20260410143904_e360eff3-334c-490d-a066-40ac9d333a89.sql
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_marcelo_on_preimpressao_saida()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_marcelo_user_id uuid := '4bbfbed7-35cf-4301-b165-308799da633e';
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.setor IS NULL
     AND NEW.status = 'arquivo_liberado' THEN

    IF NOT EXISTS (
      SELECT 1
      FROM public.avisos a
      WHERE a.destinatario_id = v_marcelo_user_id
        AND a.criado_por = COALESCE(NEW.atualizado_por, NEW.criado_por, v_marcelo_user_id)
        AND a.titulo = CONCAT('OS ', NEW.titulo, ' - ', NEW.cliente)
        AND a.mensagem = 'PODE SEGUIR'
        AND a.tipo = 'lembrete'
        AND a.created_at >= (now() - interval '10 minutes')
    ) THEN
      INSERT INTO public.avisos (titulo, mensagem, tipo, criado_por, destinatario_id)
      VALUES (
        CONCAT('OS ', NEW.titulo, ' - ', NEW.cliente),
        'PODE SEGUIR',
        'lembrete',
        COALESCE(NEW.atualizado_por, NEW.criado_por, v_marcelo_user_id),
        v_marcelo_user_id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_marcelo_on_preimpressao_saida ON public.orders;

CREATE TRIGGER trg_notify_marcelo_on_preimpressao_saida
AFTER UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.notify_marcelo_on_preimpressao_saida();

-- ------------------------------------------------------------------
-- Migration: 20260506123557_28f131b8-c4d9-4561-972a-80be9d74e789.sql
-- ------------------------------------------------------------------
-- Índices para acelerar queries do Kanban e dashboards
-- IF NOT EXISTS garante segurança total (não falha se já existir)

CREATE INDEX IF NOT EXISTS idx_orders_arquivado_setor_posicao 
  ON public.orders (arquivado, setor, posicao);

CREATE INDEX IF NOT EXISTS idx_orders_setor_setor_status 
  ON public.orders (setor, setor_status) WHERE arquivado = false;

CREATE INDEX IF NOT EXISTS idx_orders_status_arquivado 
  ON public.orders (status, arquivado);

CREATE INDEX IF NOT EXISTS idx_orders_parent_order_id 
  ON public.orders (parent_order_id) WHERE parent_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_created_at 
  ON public.orders (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_setor_not_null 
  ON public.orders (setor, posicao) WHERE setor IS NOT NULL AND arquivado = false;

-- ------------------------------------------------------------------
-- Migration: 20260522163817_f3e34647-a08f-41ea-8a6f-85adf6ad547d.sql
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_marcelo_on_preimpressao_saida()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_recipients uuid[] := ARRAY[
    '4bbfbed7-35cf-4301-b165-308799da633e'::uuid,
    '916f93ad-ae84-4dee-86a4-38bd12daeb0a'::uuid
  ];
  v_recipient uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.setor IS NULL
     AND NEW.status = 'arquivo_liberado' THEN

    FOREACH v_recipient IN ARRAY v_recipients LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM public.avisos a
        WHERE a.destinatario_id = v_recipient
          AND a.criado_por = COALESCE(NEW.atualizado_por, NEW.criado_por, v_recipient)
          AND a.titulo = CONCAT('OS ', NEW.titulo, ' - ', NEW.cliente)
          AND a.mensagem = 'PODE SEGUIR'
          AND a.tipo = 'lembrete'
          AND a.created_at >= (now() - interval '10 minutes')
      ) THEN
        INSERT INTO public.avisos (titulo, mensagem, tipo, criado_por, destinatario_id)
        VALUES (
          CONCAT('OS ', NEW.titulo, ' - ', NEW.cliente),
          'PODE SEGUIR',
          'lembrete',
          COALESCE(NEW.atualizado_por, NEW.criado_por, v_recipient),
          v_recipient
        );
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

-- ------------------------------------------------------------------
-- Migration: 20260528111545_3d4a9b68-3d16-487e-9320-e6685a1be51c.sql
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_marcelo_on_preimpressao_saida()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_recipients uuid[] := ARRAY[
    '4bbfbed7-35cf-4301-b165-308799da633e'::uuid,  -- Marcelo
    '916f93ad-ae84-4dee-86a4-38bd12daeb0a'::uuid,  -- Wellington
    '12610a1b-8862-4357-9272-948a35483532'::uuid,  -- Carlos
    '7d7fc4d0-548d-4976-a324-87e51581110a'::uuid   -- Cleo
  ];
  v_recipient uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.setor IS NULL
     AND NEW.status = 'arquivo_liberado' THEN

    FOREACH v_recipient IN ARRAY v_recipients LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM public.avisos a
        WHERE a.destinatario_id = v_recipient
          AND a.criado_por = COALESCE(NEW.atualizado_por, NEW.criado_por, v_recipient)
          AND a.titulo = CONCAT('OS ', NEW.titulo, ' - ', NEW.cliente)
          AND a.mensagem = 'PODE SEGUIR'
          AND a.tipo = 'lembrete'
          AND a.created_at >= (now() - interval '10 minutes')
      ) THEN
        INSERT INTO public.avisos (titulo, mensagem, tipo, criado_por, destinatario_id)
        VALUES (
          CONCAT('OS ', NEW.titulo, ' - ', NEW.cliente),
          'PODE SEGUIR',
          'lembrete',
          COALESCE(NEW.atualizado_por, NEW.criado_por, v_recipient),
          v_recipient
        );
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

-- ------------------------------------------------------------------
-- Migration: 20260613195905_c0aaad8c-fe61-4a70-9b00-bbe55a769e1c.sql
-- ------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_auto_create_faturamento ON public.orders;
DROP TRIGGER IF EXISTS trg_sync_faturamento ON public.orders;
DROP FUNCTION IF EXISTS public.auto_create_faturamento_order() CASCADE;
DROP FUNCTION IF EXISTS public.sync_faturamento_order() CASCADE;
DELETE FROM public.orders WHERE setor = 'faturamento';

-- ------------------------------------------------------------------
-- Migration: 20260613211101_5a755048-2918-4546-9c04-97f50d444b4d.sql
-- ------------------------------------------------------------------
-- Performance: índices para suportar consultas frequentes (auditoria 5k cards / 100 usuários)

-- order_status_history: só tinha pkey. Queries do useSlowOrderAlerts e ProductionCard fazem seq scan.
CREATE INDEX IF NOT EXISTS idx_osh_order_id_created_at
  ON public.order_status_history (order_id, created_at);

CREATE INDEX IF NOT EXISTS idx_osh_order_status_created
  ON public.order_status_history (order_id, status_novo, created_at DESC);

-- sector_history: idx_sector_history_order_id existe, mas sem created_at composto
CREATE INDEX IF NOT EXISTS idx_sector_history_order_created
  ON public.sector_history (order_id, created_at);

-- orders.parent_order_id já tem partial index; adicionar para queries de faturamento por setor
CREATE INDEX IF NOT EXISTS idx_orders_setor_setor_status_active
  ON public.orders (setor, setor_status)
  WHERE arquivado = false AND setor IS NOT NULL;

-- ------------------------------------------------------------------
-- Migration: 20260614114359_2d5b09a7-c91b-41f4-9998-4333a09625aa.sql
-- ------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS modulos_acesso text[] NOT NULL DEFAULT '{}'::text[];

-- ------------------------------------------------------------------
-- Migration: 20260614122107_cfb4434d-b5ad-449b-888f-4d5b795d2ea2.sql
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_elana_on_oc_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_recipient uuid := 'a2a24a41-12d6-480f-823f-b4f1429488b3'::uuid;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.setor = 'compras' THEN
    INSERT INTO public.avisos (titulo, mensagem, tipo, criado_por, destinatario_id)
    VALUES (
      CONCAT('Nova OC', CASE WHEN NEW.oc_numero IS NOT NULL THEN ' #' || NEW.oc_numero ELSE '' END, ' - ', COALESCE(NEW.cliente, '')),
      COALESCE(NEW.descricao, 'Nova Ordem de Compra criada'),
      'lembrete',
      COALESCE(NEW.criado_por, v_recipient),
      v_recipient
    );
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notify_elana_on_oc_created ON public.orders;
CREATE TRIGGER trg_notify_elana_on_oc_created
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.notify_elana_on_oc_created();

-- ------------------------------------------------------------------
-- Migration: 20260614122744_c1d3cf86-f3a9-4853-a7ed-48ca4d07eda8.sql
-- ------------------------------------------------------------------
-- 1. order_status_history: restrict from public to authenticated
DROP POLICY IF EXISTS "Authenticated users can insert status history" ON public.order_status_history;
DROP POLICY IF EXISTS "Authenticated users can view status history" ON public.order_status_history;
CREATE POLICY "Authenticated users can insert status history" ON public.order_status_history
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can view status history" ON public.order_status_history
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

-- 2. user_roles: only own row visible (admins keep "Admins can manage user_roles")
DROP POLICY IF EXISTS "Authenticated can view roles" ON public.user_roles;
CREATE POLICY "Users can view own role" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can view all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. profiles: prevent non-admin from changing modulos_acesso
CREATE OR REPLACE FUNCTION public.prevent_self_module_escalation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.modulos_acesso IS DISTINCT FROM OLD.modulos_acesso
     AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    NEW.modulos_acesso := OLD.modulos_acesso;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_prevent_self_module_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_self_module_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_self_module_escalation();

-- 4. Tighten policies: deletion and management restricted to admins/coordinators
DROP POLICY IF EXISTS "Authenticated users can create orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can delete orders" ON public.orders;
DROP POLICY IF EXISTS "Admins and coordinators can delete orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can update orders" ON public.orders;
CREATE POLICY "Authenticated users can create orders" ON public.orders
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Admins and coordinators can delete orders" ON public.orders
  FOR DELETE TO authenticated USING (public.get_user_role(auth.uid()) IN ('admin', 'coordenador'));
CREATE POLICY "Authenticated users can update orders" ON public.orders
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated can delete equipamentos" ON public.equipamentos;
DROP POLICY IF EXISTS "Authenticated can insert equipamentos" ON public.equipamentos;
DROP POLICY IF EXISTS "Authenticated can update equipamentos" ON public.equipamentos;
DROP POLICY IF EXISTS "Admins can delete equipamentos" ON public.equipamentos;
DROP POLICY IF EXISTS "Admins can insert equipamentos" ON public.equipamentos;
DROP POLICY IF EXISTS "Admins can update equipamentos" ON public.equipamentos;
CREATE POLICY "Admins can delete equipamentos" ON public.equipamentos
  FOR DELETE TO authenticated USING (public.get_user_role(auth.uid()) = 'admin');
CREATE POLICY "Admins can insert equipamentos" ON public.equipamentos
  FOR INSERT TO authenticated WITH CHECK (public.get_user_role(auth.uid()) = 'admin');
CREATE POLICY "Admins can update equipamentos" ON public.equipamentos
  FOR UPDATE TO authenticated USING (public.get_user_role(auth.uid()) = 'admin') WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

DROP POLICY IF EXISTS "Authenticated can delete vendedores" ON public.vendedores;
DROP POLICY IF EXISTS "Authenticated can insert vendedores" ON public.vendedores;
DROP POLICY IF EXISTS "Authenticated can update vendedores" ON public.vendedores;
DROP POLICY IF EXISTS "Admins can delete vendedores" ON public.vendedores;
DROP POLICY IF EXISTS "Admins can insert vendedores" ON public.vendedores;
DROP POLICY IF EXISTS "Admins can update vendedores" ON public.vendedores;
CREATE POLICY "Admins can delete vendedores" ON public.vendedores
  FOR DELETE TO authenticated USING (public.get_user_role(auth.uid()) = 'admin');
CREATE POLICY "Admins can insert vendedores" ON public.vendedores
  FOR INSERT TO authenticated WITH CHECK (public.get_user_role(auth.uid()) = 'admin');
CREATE POLICY "Admins can update vendedores" ON public.vendedores
  FOR UPDATE TO authenticated USING (public.get_user_role(auth.uid()) = 'admin') WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

DROP POLICY IF EXISTS "Authenticated users can insert sector history" ON public.sector_history;
CREATE POLICY "Authenticated users can insert sector history" ON public.sector_history
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated can insert order_time_summary" ON public.order_time_summary;
CREATE POLICY "Authenticated can insert order_time_summary" ON public.order_time_summary
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

-- 5. Fix mutable search_path on assign_oc_numero & assign_nc_numero
CREATE OR REPLACE FUNCTION public.assign_oc_numero()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.setor = 'compras' AND NEW.oc_numero IS NULL THEN
    NEW.oc_numero := nextval('public.oc_numero_seq');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_nc_numero()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.setor = 'nao_conformidade' AND NEW.nc_numero IS NULL THEN
    NEW.nc_numero := nextval('public.nc_numero_seq');
  END IF;
  RETURN NEW;
END;
$$;

-- 6. Revoke EXECUTE on admin-only SECURITY DEFINER function
REVOKE EXECUTE ON FUNCTION public.compact_archived_history() FROM PUBLIC, anon, authenticated;

-- 7. Realtime: require authentication to subscribe
DROP POLICY IF EXISTS "Authenticated can use realtime" ON realtime.messages;
CREATE POLICY "Authenticated can use realtime" ON realtime.messages
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

-- ------------------------------------------------------------------
-- Migration: 20260614122801_cfa1553d-39cf-48a2-83e8-9ec3f32a56a4.sql
-- ------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_elana_on_oc_created() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_om_numero() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_oc_numero() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_nc_numero() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_order_status_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_sector_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_marcelo_on_preimpressao_saida() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_self_module_escalation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM PUBLIC, anon;

-- ------------------------------------------------------------------
-- Migration: 20260722123256_c4b2acbe-4631-49a8-8aae-3e8c603868c7.sql
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_self_module_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.modulos_acesso IS DISTINCT FROM OLD.modulos_acesso
     AND auth.uid() IS NOT NULL
     AND auth.uid() = NEW.user_id
     AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    NEW.modulos_acesso := OLD.modulos_acesso;
  END IF;
  RETURN NEW;
END;
$function$;

-- ------------------------------------------------------------------
-- Migration: 20260722123424_fb42628f-edc3-40e0-808d-03f7716fb3eb.sql
-- ------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.prevent_self_module_escalation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_self_module_escalation() FROM anon;
REVOKE EXECUTE ON FUNCTION public.prevent_self_module_escalation() FROM authenticated;

-- ------------------------------------------------------------------
-- Migration: 20260724125147_1f53e2de-be0c-44ec-b476-fe7cb923cd95.sql
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_order_family_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_root uuid;
BEGIN
  -- Evita recursão do próprio trigger
  IF current_setting('app.sync_order_family', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.descricao IS NOT DISTINCT FROM OLD.descricao
     AND NEW.cliente  IS NOT DISTINCT FROM OLD.cliente
     AND NEW.titulo   IS NOT DISTINCT FROM OLD.titulo THEN
    RETURN NEW;
  END IF;

  v_root := COALESCE(NEW.parent_order_id, NEW.id);

  PERFORM set_config('app.sync_order_family', 'on', true);

  UPDATE public.orders
     SET descricao = NEW.descricao,
         cliente   = NEW.cliente,
         titulo    = NEW.titulo
   WHERE (id = v_root OR parent_order_id = v_root)
     AND id <> NEW.id
     AND (descricao IS DISTINCT FROM NEW.descricao
       OR cliente   IS DISTINCT FROM NEW.cliente
       OR titulo    IS DISTINCT FROM NEW.titulo);

  PERFORM set_config('app.sync_order_family', 'off', true);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_order_family_fields ON public.orders;
CREATE TRIGGER trg_sync_order_family_fields
AFTER UPDATE OF descricao, cliente, titulo ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_order_family_fields();

REVOKE EXECUTE ON FUNCTION public.sync_order_family_fields() FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------
-- Migration: 20260805165245_a5f9245c-a452-4afb-850a-ca55ad70265f.sql
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_duplicate_family_in_sector()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_root uuid;
  v_exists boolean;
BEGIN
  IF NEW.setor IS NULL OR NEW.arquivado THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.setor IS NOT DISTINCT FROM NEW.setor
     AND OLD.arquivado IS NOT DISTINCT FROM NEW.arquivado THEN
    RETURN NEW;
  END IF;

  v_root := COALESCE(NEW.parent_order_id, NEW.id);

  SELECT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id <> NEW.id
      AND o.arquivado = false
      AND o.setor = NEW.setor
      AND (o.id = v_root OR o.parent_order_id = v_root)
  ) INTO v_exists;

  IF v_exists THEN
    RAISE EXCEPTION 'A OS % já possui uma cópia ativa no setor %.', NEW.titulo, NEW.setor
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_family_in_sector ON public.orders;
CREATE TRIGGER trg_prevent_duplicate_family_in_sector
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_family_in_sector();

-- ------------------------------------------------------------------
-- Migration: 20260805165307_e290d946-8174-4932-9d74-4ebb9ec1464d.sql
-- ------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.prevent_duplicate_family_in_sector() FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------
-- Migration: 20260908112909_ecc6dea3-9ff3-42f2-a4bb-b9f209b036c1.sql
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_marcelo_on_preimpressao_saida()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_recipients uuid[] := ARRAY[
    '4bbfbed7-35cf-4301-b165-308799da633e'::uuid,
    '916f93ad-ae84-4dee-86a4-38bd12daeb0a'::uuid,
    '7d7fc4d0-548d-4976-a324-87e51581110a'::uuid
  ];
  v_recipient uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.setor IS NULL
     AND NEW.status = 'arquivo_liberado' THEN

    FOREACH v_recipient IN ARRAY v_recipients LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM public.avisos a
        WHERE a.destinatario_id = v_recipient
          AND a.criado_por = COALESCE(NEW.atualizado_por, NEW.criado_por, v_recipient)
          AND a.titulo = CONCAT('OS ', NEW.titulo, ' - ', NEW.cliente)
          AND a.mensagem = 'PODE SEGUIR'
          AND a.tipo = 'lembrete'
          AND a.created_at >= (now() - interval '10 minutes')
      ) THEN
        INSERT INTO public.avisos (titulo, mensagem, tipo, criado_por, destinatario_id)
        VALUES (
          CONCAT('OS ', NEW.titulo, ' - ', NEW.cliente),
          'PODE SEGUIR',
          'lembrete',
          COALESCE(NEW.atualizado_por, NEW.criado_por, v_recipient),
          v_recipient
        );
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

DELETE FROM public.avisos_lidos
WHERE aviso_id IN (
  SELECT id FROM public.avisos
  WHERE mensagem = 'PODE SEGUIR'
    AND destinatario_id = '12610a1b-8862-4357-9272-948a35483532'
);

DELETE FROM public.avisos
WHERE mensagem = 'PODE SEGUIR'
  AND destinatario_id = '12610a1b-8862-4357-9272-948a35483532';

-- ------------------------------------------------------------------
-- Migration: 20260908113058_67a4c02b-7991-4a55-ac57-894e33ee38e7.sql
-- ------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.notify_marcelo_on_preimpressao_saida() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_marcelo_on_preimpressao_saida() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_marcelo_on_preimpressao_saida() FROM authenticated;

-- ------------------------------------------------------------------
-- Migration: 20261014_crm_sales_funnel.sql
-- ------------------------------------------------------------------
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

-- ------------------------------------------------------------------
-- Migration: 20261015_create_order_attachments.sql
-- ------------------------------------------------------------------
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS sharepoint_folder_id TEXT,
  ADD COLUMN IF NOT EXISTS sharepoint_folder_url TEXT,
  ADD COLUMN IF NOT EXISTS sharepoint_folder_name TEXT;

CREATE TABLE IF NOT EXISTS public.order_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  nome_arquivo TEXT NOT NULL,
  tamanho_bytes BIGINT NOT NULL DEFAULT 0,
  content_type TEXT,
  sharepoint_item_id TEXT NOT NULL,
  sharepoint_folder_id TEXT NOT NULL,
  sharepoint_folder_name TEXT NOT NULL,
  sharepoint_drive_id TEXT NOT NULL,
  sharepoint_site_id TEXT,
  sharepoint_web_url TEXT NOT NULL,
  sharepoint_path TEXT,
  status TEXT NOT NULL DEFAULT 'concluido' CHECK (status IN ('uploading', 'concluido', 'falha')),
  criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_attachments_order_id ON public.order_attachments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_attachments_created_at ON public.order_attachments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_attachments_sharepoint_item_id ON public.order_attachments(sharepoint_item_id);

ALTER TABLE public.order_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view order attachments" 
  ON public.order_attachments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert order attachments" 
  ON public.order_attachments FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update order attachments" 
  ON public.order_attachments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Admins coordinators or uploader can delete order attachments" 
  ON public.order_attachments FOR DELETE TO authenticated 
  USING (
    auth.uid() = criado_por 
    OR public.get_user_role(auth.uid()) IN ('admin', 'coordenador')
  );

-- Coluna para indicar qual operador irá trabalhar na O.S. do card
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS operador TEXT;

-- Coluna para registrar o número da O.S. anterior quando o trabalho for Repetição
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS os_anterior TEXT;




-- ------------------------------------------------------------------
-- Migration: 20261021_add_revisao_to_orders.sql
-- ------------------------------------------------------------------
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS revisao INTEGER DEFAULT 1;

