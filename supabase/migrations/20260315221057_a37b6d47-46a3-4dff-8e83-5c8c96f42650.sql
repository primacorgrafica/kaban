ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS urgente_prova boolean NOT NULL DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS urgente_impressao boolean NOT NULL DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS urgente_acabamento boolean NOT NULL DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS urgente_expedicao boolean NOT NULL DEFAULT false;

-- Migrate existing data: if urgente is true, set all new fields to true
UPDATE public.orders SET urgente_prova = true, urgente_impressao = true, urgente_acabamento = true, urgente_expedicao = true WHERE urgente = true;