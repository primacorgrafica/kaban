
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
