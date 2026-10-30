-- Migration: Adicionar perfil 'rh' ao enum public.app_role
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_type t 
    JOIN pg_enum e ON t.oid = e.enumtypid 
    WHERE t.typname = 'app_role' AND e.enumlabel = 'rh'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'rh';
  END IF;
END $$;

COMMENT ON TYPE public.app_role IS 'Papéis do sistema Kaban: admin, user, coordenador, operador, vendedor, orcamentista, impressor, entregador, rh';
