
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
