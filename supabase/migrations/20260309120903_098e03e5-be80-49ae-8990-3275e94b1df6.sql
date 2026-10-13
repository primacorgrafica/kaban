
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS pausado boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS pausado_em timestamptz,
ADD COLUMN IF NOT EXISTS tempo_pausado_ms bigint NOT NULL DEFAULT 0;
