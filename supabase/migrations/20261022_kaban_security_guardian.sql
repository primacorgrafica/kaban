-- ====================================================================
-- Primacor Gráfica - Kaban Security Guardian (KSG)
-- Migration: 20261022_kaban_security_guardian.sql
-- ====================================================================

-- 1. TABELA DE AUDITORIA DE SEGURANÇA (SECURITY AUDIT LOGS)
CREATE TABLE IF NOT EXISTS public.security_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  ip_address TEXT,
  user_agent TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  target_resource TEXT
);

-- Índices estratégicos para análise forense e detecção de anomalias
CREATE INDEX IF NOT EXISTS idx_security_audit_logs_created_at
  ON public.security_audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_audit_logs_event_severity
  ON public.security_audit_logs (event_type, severity);

CREATE INDEX IF NOT EXISTS idx_security_audit_logs_user_id
  ON public.security_audit_logs (user_id);

-- Ativar Row Level Security
ALTER TABLE public.security_audit_logs ENABLE ROW LEVEL SECURITY;

-- Apenas administradores podem visualizar os registros de auditoria de segurança
DROP POLICY IF EXISTS "Admins can view security audit logs" ON public.security_audit_logs;
CREATE POLICY "Admins can view security audit logs"
  ON public.security_audit_logs
  FOR SELECT
  TO authenticated
  USING (
    public.get_user_role(auth.uid()) = 'admin'
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- Inserção permitida para usuários autenticados (ou anônimos durante tentativas de login)
DROP POLICY IF EXISTS "Users can insert security audit logs" ON public.security_audit_logs;
CREATE POLICY "Users can insert security audit logs"
  ON public.security_audit_logs
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

-- 2. FUNÇÃO RPC PARA INSERÇÃO SEGURA DE AUDITORIA (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.log_security_audit_event(
  p_event_type TEXT,
  p_severity TEXT,
  p_details JSONB DEFAULT '{}'::jsonb,
  p_target_resource TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.security_audit_logs (
    user_id,
    event_type,
    severity,
    details,
    target_resource,
    user_agent
  )
  VALUES (
    auth.uid(),
    p_event_type,
    p_severity,
    p_details,
    p_target_resource,
    p_user_agent
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

-- 3. FORTALECIMENTO DO TRIGGER DE ESCALAÇÃO DE PRIVILÉGIOS NO PERFIL
-- Impede que usuários comuns alterem 'modulos_acesso' OU 'setor_vinculado'
CREATE OR REPLACE FUNCTION public.prevent_self_module_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin BOOLEAN;
BEGIN
  v_is_admin := (
    public.get_user_role(auth.uid()) = 'admin'
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

  -- Se não for administrador, restaura valores anteriores de campos sensíveis de controle de acesso
  IF NOT v_is_admin THEN
    IF NEW.modulos_acesso IS DISTINCT FROM OLD.modulos_acesso THEN
      NEW.modulos_acesso := OLD.modulos_acesso;
    END IF;

    IF NEW.setor_vinculado IS DISTINCT FROM OLD.setor_vinculado THEN
      NEW.setor_vinculado := OLD.setor_vinculado;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_self_module_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_self_module_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_self_module_escalation();
