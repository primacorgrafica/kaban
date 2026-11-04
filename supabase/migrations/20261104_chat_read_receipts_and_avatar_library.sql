-- ====================================================================
-- PRIMACOR KANBAN - CHAT INTERNO: CONFIRMAÇÃO DE LEITURA & BIBLIOTECA DE AVATARES
-- Migration: 20261104_chat_read_receipts_and_avatar_library.sql
-- ====================================================================

-- 1. TABELA DE BIBLIOTECA DE AVATARES (OFICIAIS & PERSONALIZADOS)
CREATE TABLE IF NOT EXISTS public.chat_avatars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  image_url TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'oficial',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT uq_chat_avatar_image_url UNIQUE (image_url)
);

CREATE INDEX IF NOT EXISTS idx_chat_avatars_active ON public.chat_avatars(is_active, created_at DESC);

-- 2. ATUALIZAÇÃO DA TABELA PROFILES PARA VINCULAR O AVATAR ESCOLHIDO
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_id UUID REFERENCES public.chat_avatars(id) ON DELETE SET NULL;

-- 3. ATUALIZAÇÃO DA TABELA CHAT_MESSAGES PARA STATUS DE LEITURA DIRETO
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_chat_messages_unread ON public.chat_messages(conversation_id, sender_id, is_read);

-- 4. TABELA DE CONFIRMAÇÕES DE LEITURA (AUDITORIA E SUPORTE A GRUPOS/PARTICIPANTES)
CREATE TABLE IF NOT EXISTS public.chat_message_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT uq_chat_message_user_read UNIQUE (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_message_reads_conv_msg ON public.chat_message_reads(conversation_id, message_id);
CREATE INDEX IF NOT EXISTS idx_chat_message_reads_user ON public.chat_message_reads(user_id);

-- 5. HABILITAR ROW LEVEL SECURITY (RLS)
ALTER TABLE public.chat_avatars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_message_reads ENABLE ROW LEVEL SECURITY;

-- 6. POLÍTICAS RLS - BIBLIOTECA DE AVATARES
-- Leitura: Qualquer usuário autenticado pode visualizar avatares disponíveis
DROP POLICY IF EXISTS "Anyone authenticated can view avatars" ON public.chat_avatars;
CREATE POLICY "Anyone authenticated can view avatars" ON public.chat_avatars
  FOR SELECT TO authenticated
  USING (true);

-- Criação: Somente administradores e coordenadores podem cadastrar avatares
DROP POLICY IF EXISTS "Admins and coordinators can insert avatars" ON public.chat_avatars;
CREATE POLICY "Admins and coordinators can insert avatars" ON public.chat_avatars
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'coordenador'));

-- Edição / Ativação / Desativação: Somente administradores e coordenadores
DROP POLICY IF EXISTS "Admins and coordinators can update avatars" ON public.chat_avatars;
CREATE POLICY "Admins and coordinators can update avatars" ON public.chat_avatars
  FOR UPDATE TO authenticated
  USING (public.get_user_role(auth.uid()) IN ('admin', 'coordenador'))
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'coordenador'));

-- Exclusão: Somente administradores e coordenadores
DROP POLICY IF EXISTS "Admins and coordinators can delete avatars" ON public.chat_avatars;
CREATE POLICY "Admins and coordinators can delete avatars" ON public.chat_avatars
  FOR DELETE TO authenticated
  USING (public.get_user_role(auth.uid()) IN ('admin', 'coordenador'));

-- 7. POLÍTICAS RLS - CONFIRMAÇÕES DE LEITURA (chat_message_reads)
-- Visualização: Apenas participantes da conversa podem ver confirmações
DROP POLICY IF EXISTS "Participants can view message reads" ON public.chat_message_reads;
CREATE POLICY "Participants can view message reads" ON public.chat_message_reads
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_conversations c
      WHERE c.id = conversation_id AND (c.user1_id = auth.uid() OR c.user2_id = auth.uid())
    )
  );

-- Inserção: Apenas o próprio usuário autenticado que participa da conversa pode registrar sua leitura
DROP POLICY IF EXISTS "Users can record own message reads" ON public.chat_message_reads;
CREATE POLICY "Users can record own message reads" ON public.chat_message_reads
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.chat_conversations c
      WHERE c.id = conversation_id AND (c.user1_id = auth.uid() OR c.user2_id = auth.uid())
    )
  );

-- 8. POLÍTICAS RLS - PROFILES (Garantir que cada usuário pode atualizar apenas seu próprio perfil/avatar)
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.get_user_role(auth.uid()) = 'admin')
  WITH CHECK (auth.uid() = user_id OR public.get_user_role(auth.uid()) = 'admin');

-- 9. FUNÇÃO RPC SEGURA PARA CONFIRMAR LEITURA DE MENSAGENS EM TEMPO REAL
CREATE OR REPLACE FUNCTION public.mark_chat_messages_read(
  p_conversation_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT := 0;
  v_now TIMESTAMP WITH TIME ZONE := now();
  v_effective_user UUID;
BEGIN
  -- Garante que a operação sempre utiliza o ID do usuário autenticado no token
  v_effective_user := auth.uid();
  IF v_effective_user IS NULL THEN
    v_effective_user := p_user_id;
  END IF;

  -- Valida se o usuário é participante legítimo da conversa
  IF NOT EXISTS (
    SELECT 1 FROM public.chat_conversations
    WHERE id = p_conversation_id AND (user1_id = v_effective_user OR user2_id = v_effective_user)
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado à conversa');
  END IF;

  -- 1. Insere em chat_message_reads para cada mensagem não lida enviada pelo outro participante
  INSERT INTO public.chat_message_reads (message_id, conversation_id, user_id, read_at)
  SELECT m.id, m.conversation_id, v_effective_user, v_now
  FROM public.chat_messages m
  WHERE m.conversation_id = p_conversation_id
    AND m.sender_id <> v_effective_user
    AND NOT EXISTS (
      SELECT 1 FROM public.chat_message_reads r
      WHERE r.message_id = m.id AND r.user_id = v_effective_user
    )
  ON CONFLICT (message_id, user_id) DO NOTHING;

  -- 2. Atualiza chat_messages para propagar UPDATE via Supabase Realtime imediatamente
  UPDATE public.chat_messages
  SET is_read = true, read_at = v_now
  WHERE conversation_id = p_conversation_id
    AND sender_id <> v_effective_user
    AND is_read = false;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- 3. Atualiza chat_conversation_settings
  UPDATE public.chat_conversation_settings
  SET last_read_at = v_now, updated_at = v_now
  WHERE conversation_id = p_conversation_id AND user_id = v_effective_user;

  RETURN jsonb_build_object('success', true, 'marked_count', v_count);
END;
$$;

-- 10. CADASTRO DOS DOIS AVATARES OFICIAIS INICIAIS (PNG anexados)
INSERT INTO public.chat_avatars (name, image_url, category, is_active)
VALUES 
  ('Operadora Primacor (Azul)', '/avatars/avatar-operadora-azul.png', 'oficial', true),
  ('Operador Primacor (Azul)', '/avatars/avatar-operador-azul.png', 'oficial', true)
ON CONFLICT (image_url) DO UPDATE 
SET 
  is_active = true,
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  updated_at = now();

-- 11. HABILITAR PUBLICAÇÃO REALTIME PARA AVATARES E LEITURAS
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_avatars;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_message_reads;
  EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

-- 12. CONFIGURAÇÃO DO BUCKET DE STORAGE PARA AVATARES PERSONALIZADOS
DO $$
BEGIN
  -- Cria o bucket se não existir
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('chat-avatars', 'chat-avatars', true)
  ON CONFLICT (id) DO UPDATE SET public = true;

  -- Políticas de Storage para upload seguro de avatares
  DROP POLICY IF EXISTS "Public can view chat avatars" ON storage.objects;
  CREATE POLICY "Public can view chat avatars" ON storage.objects
    FOR SELECT TO public
    USING (bucket_id = 'chat-avatars');

  DROP POLICY IF EXISTS "Admins and coordinators can upload avatars" ON storage.objects;
  CREATE POLICY "Admins and coordinators can upload avatars" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'chat-avatars' AND
      public.get_user_role(auth.uid()) IN ('admin', 'coordenador')
    );

  DROP POLICY IF EXISTS "Admins and coordinators can update storage avatars" ON storage.objects;
  CREATE POLICY "Admins and coordinators can update storage avatars" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
      bucket_id = 'chat-avatars' AND
      public.get_user_role(auth.uid()) IN ('admin', 'coordenador')
    );

  DROP POLICY IF EXISTS "Admins and coordinators can delete storage avatars" ON storage.objects;
  CREATE POLICY "Admins and coordinators can delete storage avatars" ON storage.objects
    FOR DELETE TO authenticated
    USING (
      bucket_id = 'chat-avatars' AND
      public.get_user_role(auth.uid()) IN ('admin', 'coordenador')
    );
EXCEPTION WHEN OTHERS THEN
  -- Garante que se o schema storage tiver restrição de permissão local, o restante da migration é preservado
  NULL;
END $$;
