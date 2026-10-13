-- ==================================================================
-- PRIMACOR KANBAN - CHAT PRIVADO EM TEMPO REAL ENTRE USUÁRIOS
-- Migration: 20261013_create_chat_system.sql
-- ==================================================================

-- 1. TABELA DE CONVERSAS PRIVADAS
CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user1_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user2_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_message_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_message_preview TEXT,
  last_message_sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT check_distinct_users CHECK (user1_id <> user2_id),
  CONSTRAINT uq_chat_pair UNIQUE (user1_id, user2_id)
);

-- 2. TABELA DE CONFIGURAÇÕES INDIVIDUAIS POR USUÁRIO / PARTICIPANTE
-- Suporta:
-- - "Excluir conversa para mim" (is_hidden = true)
-- - "Limpar histórico para mim" (cleared_until = timestamp)
-- - Status de leitura (last_read_at)
CREATE TABLE IF NOT EXISTS public.chat_conversation_settings (
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  cleared_until TIMESTAMP WITH TIME ZONE,
  last_read_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

-- 3. TABELA DE MENSAGENS
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_edited BOOLEAN NOT NULL DEFAULT false,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_for_users UUID[] NOT NULL DEFAULT '{}'::uuid[],
  reply_to_id UUID REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 4. TABELA DE REAÇÕES EM MENSAGENS
CREATE TABLE IF NOT EXISTS public.chat_message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT uq_message_reaction UNIQUE (message_id, user_id, emoji)
);

-- 5. ÍNDICES DE PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user1 ON public.chat_conversations(user1_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user2 ON public.chat_conversations(user2_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_created ON public.chat_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON public.chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_reactions_message ON public.chat_message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_chat_settings_user ON public.chat_conversation_settings(user_id);

-- 6. HABILITAR ROW LEVEL SECURITY (RLS)
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_conversation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_message_reactions ENABLE ROW LEVEL SECURITY;

-- 7. POLÍTICAS DE ACESSO (RLS)
-- Conversas: participantes podem ler, criar e atualizar
DROP POLICY IF EXISTS "Participants can view conversations" ON public.chat_conversations;
CREATE POLICY "Participants can view conversations" ON public.chat_conversations
  FOR SELECT TO authenticated
  USING (auth.uid() = user1_id OR auth.uid() = user2_id);

DROP POLICY IF EXISTS "Participants can insert conversations" ON public.chat_conversations;
CREATE POLICY "Participants can insert conversations" ON public.chat_conversations
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user1_id OR auth.uid() = user2_id);

DROP POLICY IF EXISTS "Participants can update conversations" ON public.chat_conversations;
CREATE POLICY "Participants can update conversations" ON public.chat_conversations
  FOR UPDATE TO authenticated
  USING (auth.uid() = user1_id OR auth.uid() = user2_id);

-- Configurações individuais de conversa: somente o próprio usuário acessa e gerencia
DROP POLICY IF EXISTS "Users manage own settings" ON public.chat_conversation_settings;
CREATE POLICY "Users manage own settings" ON public.chat_conversation_settings
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Mensagens: somente participantes da conversa podem ler
DROP POLICY IF EXISTS "Participants can view messages" ON public.chat_messages;
CREATE POLICY "Participants can view messages" ON public.chat_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_conversations c
      WHERE c.id = conversation_id AND (c.user1_id = auth.uid() OR c.user2_id = auth.uid())
    )
  );

-- Mensagens: somente participantes podem enviar com seu próprio ID
DROP POLICY IF EXISTS "Participants can insert messages" ON public.chat_messages;
CREATE POLICY "Participants can insert messages" ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM public.chat_conversations c
      WHERE c.id = conversation_id AND (c.user1_id = auth.uid() OR c.user2_id = auth.uid())
    )
  );

-- Mensagens: remetente pode editar/apagar ou participante pode atualizar deleted_for_users
DROP POLICY IF EXISTS "Users can update messages" ON public.chat_messages;
CREATE POLICY "Users can update messages" ON public.chat_messages
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_conversations c
      WHERE c.id = conversation_id AND (c.user1_id = auth.uid() OR c.user2_id = auth.uid())
    )
  );

-- Reações: participantes da conversa podem ver
DROP POLICY IF EXISTS "Participants can view reactions" ON public.chat_message_reactions;
CREATE POLICY "Participants can view reactions" ON public.chat_message_reactions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_messages m
      JOIN public.chat_conversations c ON c.id = m.conversation_id
      WHERE m.id = message_id AND (c.user1_id = auth.uid() OR c.user2_id = auth.uid())
    )
  );

-- Reações: usuário gerencia suas próprias reações
DROP POLICY IF EXISTS "Users manage own reactions" ON public.chat_message_reactions;
CREATE POLICY "Users manage own reactions" ON public.chat_message_reactions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 8. PUBLICAÇÃO REALTIME
-- Adiciona tabelas na publicação do Supabase Realtime
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_conversations;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_message_reactions;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_conversation_settings;
  EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;
