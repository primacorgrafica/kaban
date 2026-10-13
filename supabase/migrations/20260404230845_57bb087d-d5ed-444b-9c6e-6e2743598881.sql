
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
