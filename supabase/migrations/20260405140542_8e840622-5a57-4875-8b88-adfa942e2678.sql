
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
