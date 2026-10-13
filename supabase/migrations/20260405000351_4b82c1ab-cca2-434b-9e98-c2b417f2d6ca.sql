
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
