export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      chat_conversations: {
        Row: {
          id: string
          user1_id: string
          user2_id: string
          last_message_at: string
          last_message_preview: string | null
          last_message_sender_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user1_id: string
          user2_id: string
          last_message_at?: string
          last_message_preview?: string | null
          last_message_sender_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user1_id?: string
          user2_id?: string
          last_message_at?: string
          last_message_preview?: string | null
          last_message_sender_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      chat_conversation_settings: {
        Row: {
          conversation_id: string
          user_id: string
          is_hidden: boolean
          cleared_until: string | null
          last_read_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          conversation_id: string
          user_id: string
          is_hidden?: boolean
          cleared_until?: string | null
          last_read_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          conversation_id?: string
          user_id?: string
          is_hidden?: boolean
          cleared_until?: string | null
          last_read_at?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          id: string
          conversation_id: string
          sender_id: string
          content: string
          is_edited: boolean
          is_deleted: boolean
          deleted_for_users: string[]
          reply_to_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          sender_id: string
          content: string
          is_edited?: boolean
          is_deleted?: boolean
          deleted_for_users?: string[]
          reply_to_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          sender_id?: string
          content?: string
          is_edited?: boolean
          is_deleted?: boolean
          deleted_for_users?: string[]
          reply_to_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      chat_message_reactions: {
        Row: {
          id: string
          message_id: string
          user_id: string
          emoji: string
          created_at: string
        }
        Insert: {
          id?: string
          message_id: string
          user_id: string
          emoji: string
          created_at?: string
        }
        Update: {
          id?: string
          message_id?: string
          user_id?: string
          emoji?: string
          created_at?: string
        }
        Relationships: []
      }
      avisos: {
        Row: {
          created_at: string
          criado_por: string
          destinatario_id: string | null
          id: string
          mensagem: string
          tipo: string
          titulo: string
        }
        Insert: {
          created_at?: string
          criado_por: string
          destinatario_id?: string | null
          id?: string
          mensagem: string
          tipo?: string
          titulo: string
        }
        Update: {
          created_at?: string
          criado_por?: string
          destinatario_id?: string | null
          id?: string
          mensagem?: string
          tipo?: string
          titulo?: string
        }
        Relationships: []
      }
      avisos_lidos: {
        Row: {
          aviso_id: string
          id: string
          lido_em: string
          user_id: string
        }
        Insert: {
          aviso_id: string
          id?: string
          lido_em?: string
          user_id: string
        }
        Update: {
          aviso_id?: string
          id?: string
          lido_em?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "avisos_lidos_aviso_id_fkey"
            columns: ["aviso_id"]
            isOneToOne: false
            referencedRelation: "avisos"
            referencedColumns: ["id"]
          },
        ]
      }
      equipamentos: {
        Row: {
          ano_fabricacao: number | null
          apontamentos: string | null
          codigo: string
          consumiveis: string | null
          created_at: string
          especificacoes: string | null
          fabricante: string | null
          id: string
          manutencoes: string | null
          modelo: string | null
          nome: string
          operadores: string[] | null
          pecas_sobressalentes: string | null
          setor: string | null
        }
        Insert: {
          ano_fabricacao?: number | null
          apontamentos?: string | null
          codigo?: string
          consumiveis?: string | null
          created_at?: string
          especificacoes?: string | null
          fabricante?: string | null
          id?: string
          manutencoes?: string | null
          modelo?: string | null
          nome: string
          operadores?: string[] | null
          pecas_sobressalentes?: string | null
          setor?: string | null
        }
        Update: {
          ano_fabricacao?: number | null
          apontamentos?: string | null
          codigo?: string
          consumiveis?: string | null
          created_at?: string
          especificacoes?: string | null
          fabricante?: string | null
          id?: string
          manutencoes?: string | null
          modelo?: string | null
          nome?: string
          operadores?: string[] | null
          pecas_sobressalentes?: string | null
          setor?: string | null
        }
        Relationships: []
      }
      order_status_history: {
        Row: {
          alterado_por: string | null
          created_at: string
          id: string
          order_id: string
          status_anterior: string | null
          status_novo: string
        }
        Insert: {
          alterado_por?: string | null
          created_at?: string
          id?: string
          order_id: string
          status_anterior?: string | null
          status_novo: string
        }
        Update: {
          alterado_por?: string | null
          created_at?: string
          id?: string
          order_id?: string
          status_anterior?: string | null
          status_novo?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_attachments: {
        Row: {
          content_type: string | null
          created_at: string
          criado_por: string | null
          id: string
          nome_arquivo: string
          order_id: string
          sharepoint_drive_id: string
          sharepoint_folder_id: string
          sharepoint_folder_name: string
          sharepoint_item_id: string
          sharepoint_path: string | null
          sharepoint_site_id: string | null
          sharepoint_web_url: string
          status: string
          tamanho_bytes: number
          updated_at: string
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          criado_por?: string | null
          id?: string
          nome_arquivo: string
          order_id: string
          sharepoint_drive_id: string
          sharepoint_folder_id: string
          sharepoint_folder_name: string
          sharepoint_item_id: string
          sharepoint_path?: string | null
          sharepoint_site_id?: string | null
          sharepoint_web_url: string
          status?: string
          tamanho_bytes?: number
          updated_at?: string
        }
        Update: {
          content_type?: string | null
          created_at?: string
          criado_por?: string | null
          id?: string
          nome_arquivo?: string
          order_id?: string
          sharepoint_drive_id?: string
          sharepoint_folder_id?: string
          sharepoint_folder_name?: string
          sharepoint_item_id?: string
          sharepoint_path?: string | null
          sharepoint_site_id?: string | null
          sharepoint_web_url?: string
          status?: string
          tamanho_bytes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_attachments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_time_summary: {
        Row: {
          created_at: string
          entrada_em: string | null
          id: string
          order_id: string
          saida_em: string | null
          setor: string
          tempo_ms: number
        }
        Insert: {
          created_at?: string
          entrada_em?: string | null
          id?: string
          order_id: string
          saida_em?: string | null
          setor: string
          tempo_ms?: number
        }
        Update: {
          created_at?: string
          entrada_em?: string | null
          id?: string
          order_id?: string
          saida_em?: string | null
          setor?: string
          tempo_ms?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_time_summary_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          acabamentos: string[] | null
          arquivado: boolean
          atualizado_por: string | null
          categoria_compra: string | null
          categoria_manut: string | null
          categoria_nc: string | null
          causa_nc: string | null
          cliente: string
          created_at: string
          criado_por: string | null
          descricao: string
          destinatario: string | null
          digital_color: boolean
          digital_pb: boolean
          empresa_entrega: string | null
          endereco_compra: string | null
          endereco_entrega: string | null
          endereco_manut: string | null
          endereco_nc: string | null
          entrega_ac: string | null
          entrega_data_limite: string | null
          entrega_endereco: string | null
          entrega_para: string | null
          entregue_em: string | null
          entregue_para: string | null
          entregue_por: string | null
          equipamento_manut: string | null
          equipamentos: string[] | null
          fat_cnpj_obs: string | null
          fat_cnpj_ok: boolean
          fat_cnpj_pendente: boolean
          fat_envio_nf_obs: string | null
          fat_envio_nf_ok: boolean
          fat_envio_nf_pendente: boolean
          fat_limite_emissao_obs: string | null
          fat_limite_emissao_ok: boolean
          fat_limite_emissao_pendente: boolean
          fat_ocpp_obs: string | null
          fat_ocpp_ok: boolean
          fat_ocpp_pendente: boolean
          fat_restricao_credito_obs: string | null
          fat_restricao_credito_ok: boolean
          fat_restricao_credito_pendente: boolean
          fat_retencao_iss_obs: string | null
          fat_retencao_iss_ok: boolean
          fat_retencao_iss_pendente: boolean
          fat_retencoes_federais_obs: string | null
          fat_retencoes_federais_ok: boolean
          fat_retencoes_federais_pendente: boolean
          fornecedor_compra: string | null
          fornecedor_manut: string | null
          id: string
          maquina: string | null
          nc_numero: number | null
          nf: string | null
          obs_entrega: string | null
          obs_prova: string | null
          observacao: string | null
          oc_numero: number | null
          om_numero: number | null
          os_ref_nc: string | null
          parent_order_id: string | null
          pausado: boolean
          pausado_em: string | null
          posicao: number
          prazo: string | null
          prioridade: string
          processos: string[] | null
          protocolo: string | null
          prova_digital: boolean
          prova_email: boolean
          reclamante_nc: string | null
          responsavel_compra: string | null
          responsavel_manut: string | null
          saida_direta: boolean
          setor: string | null
          setor_manut: string | null
          setor_status: string | null
          sharepoint_folder_id?: string | null
          sharepoint_folder_name?: string | null
          sharepoint_folder_url?: string | null
          solucao: string | null
          status: string
          tempo_pausado_ms: number
          tipo_entrega: string[] | null
          tipo_trabalho: string | null
          os_anterior?: string | null
          titulo: string
          updated_at: string
          urgente: boolean
          urgente_acabamento: boolean
          urgente_expedicao: boolean
          urgente_impressao: boolean
          urgente_prova: boolean
          operador?: string | null
          vendedor: string | null
          vendedor_compra: string | null
        }
        Insert: {
          acabamentos?: string[] | null
          arquivado?: boolean
          atualizado_por?: string | null
          categoria_compra?: string | null
          categoria_manut?: string | null
          categoria_nc?: string | null
          causa_nc?: string | null
          cliente: string
          created_at?: string
          criado_por?: string | null
          descricao: string
          destinatario?: string | null
          digital_color?: boolean
          digital_pb?: boolean
          empresa_entrega?: string | null
          endereco_compra?: string | null
          endereco_entrega?: string | null
          endereco_manut?: string | null
          endereco_nc?: string | null
          entrega_ac?: string | null
          entrega_data_limite?: string | null
          entrega_endereco?: string | null
          entrega_para?: string | null
          entregue_em?: string | null
          entregue_para?: string | null
          entregue_por?: string | null
          equipamento_manut?: string | null
          equipamentos?: string[] | null
          fat_cnpj_obs?: string | null
          fat_cnpj_ok?: boolean
          fat_cnpj_pendente?: boolean
          fat_envio_nf_obs?: string | null
          fat_envio_nf_ok?: boolean
          fat_envio_nf_pendente?: boolean
          fat_limite_emissao_obs?: string | null
          fat_limite_emissao_ok?: boolean
          fat_limite_emissao_pendente?: boolean
          fat_ocpp_obs?: string | null
          fat_ocpp_ok?: boolean
          fat_ocpp_pendente?: boolean
          fat_restricao_credito_obs?: string | null
          fat_restricao_credito_ok?: boolean
          fat_restricao_credito_pendente?: boolean
          fat_retencao_iss_obs?: string | null
          fat_retencao_iss_ok?: boolean
          fat_retencao_iss_pendente?: boolean
          fat_retencoes_federais_obs?: string | null
          fat_retencoes_federais_ok?: boolean
          fat_retencoes_federais_pendente?: boolean
          fornecedor_compra?: string | null
          fornecedor_manut?: string | null
          id?: string
          maquina?: string | null
          nc_numero?: number | null
          nf?: string | null
          obs_entrega?: string | null
          obs_prova?: string | null
          observacao?: string | null
          oc_numero?: number | null
          om_numero?: number | null
          operador?: string | null
          os_ref_nc?: string | null
          parent_order_id?: string | null
          pausado?: boolean
          pausado_em?: string | null
          posicao?: number
          prazo?: string | null
          prioridade?: string
          processos?: string[] | null
          protocolo?: string | null
          prova_digital?: boolean
          prova_email?: boolean
          reclamante_nc?: string | null
          responsavel_compra?: string | null
          responsavel_manut?: string | null
          saida_direta?: boolean
          setor?: string | null
          setor_manut?: string | null
          setor_status?: string | null
          solucao?: string | null
          status?: string
          tempo_pausado_ms?: number
          tipo_entrega?: string[] | null
          tipo_trabalho?: string | null
          os_anterior?: string | null
          titulo: string
          updated_at?: string
          urgente?: boolean
          urgente_acabamento?: boolean
          urgente_expedicao?: boolean
          urgente_impressao?: boolean
          urgente_prova?: boolean
          vendedor?: string | null
          vendedor_compra?: string | null
        }
        Update: {
          acabamentos?: string[] | null
          arquivado?: boolean
          atualizado_por?: string | null
          categoria_compra?: string | null
          categoria_manut?: string | null
          categoria_nc?: string | null
          causa_nc?: string | null
          cliente?: string
          created_at?: string
          criado_por?: string | null
          descricao?: string
          destinatario?: string | null
          digital_color?: boolean
          digital_pb?: boolean
          empresa_entrega?: string | null
          endereco_compra?: string | null
          endereco_entrega?: string | null
          endereco_manut?: string | null
          endereco_nc?: string | null
          entrega_ac?: string | null
          entrega_data_limite?: string | null
          entrega_endereco?: string | null
          entrega_para?: string | null
          entregue_em?: string | null
          entregue_para?: string | null
          entregue_por?: string | null
          equipamento_manut?: string | null
          equipamentos?: string[] | null
          fat_cnpj_obs?: string | null
          fat_cnpj_ok?: boolean
          fat_cnpj_pendente?: boolean
          fat_envio_nf_obs?: string | null
          fat_envio_nf_ok?: boolean
          fat_envio_nf_pendente?: boolean
          fat_limite_emissao_obs?: string | null
          fat_limite_emissao_ok?: boolean
          fat_limite_emissao_pendente?: boolean
          fat_ocpp_obs?: string | null
          fat_ocpp_ok?: boolean
          fat_ocpp_pendente?: boolean
          fat_restricao_credito_obs?: string | null
          fat_restricao_credito_ok?: boolean
          fat_restricao_credito_pendente?: boolean
          fat_retencao_iss_obs?: string | null
          fat_retencao_iss_ok?: boolean
          fat_retencao_iss_pendente?: boolean
          fat_retencoes_federais_obs?: string | null
          fat_retencoes_federais_ok?: boolean
          fat_retencoes_federais_pendente?: boolean
          fornecedor_compra?: string | null
          fornecedor_manut?: string | null
          id?: string
          maquina?: string | null
          nc_numero?: number | null
          nf?: string | null
          obs_entrega?: string | null
          obs_prova?: string | null
          observacao?: string | null
          oc_numero?: number | null
          om_numero?: number | null
          operador?: string | null
          os_ref_nc?: string | null
          parent_order_id?: string | null
          pausado?: boolean
          pausado_em?: string | null
          posicao?: number
          prazo?: string | null
          prioridade?: string
          processos?: string[] | null
          protocolo?: string | null
          prova_digital?: boolean
          prova_email?: boolean
          reclamante_nc?: string | null
          responsavel_compra?: string | null
          responsavel_manut?: string | null
          saida_direta?: boolean
          setor?: string | null
          setor_manut?: string | null
          setor_status?: string | null
          solucao?: string | null
          status?: string
          tempo_pausado_ms?: number
          tipo_entrega?: string[] | null
          tipo_trabalho?: string | null
          os_anterior?: string | null
          titulo?: string
          updated_at?: string
          urgente?: boolean
          urgente_acabamento?: boolean
          urgente_expedicao?: boolean
          urgente_impressao?: boolean
          urgente_prova?: boolean
          vendedor?: string | null
          vendedor_compra?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_parent_order_id_fkey"
            columns: ["parent_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          modulos_acesso: string[]
          nome: string
          setor_vinculado: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          modulos_acesso?: string[]
          nome?: string
          setor_vinculado?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          modulos_acesso?: string[]
          nome?: string
          setor_vinculado?: string | null
          user_id?: string
        }
        Relationships: []
      }
      sector_history: {
        Row: {
          created_at: string
          id: string
          order_id: string
          setor_anterior: string | null
          setor_novo: string | null
          setor_status_novo: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          setor_anterior?: string | null
          setor_novo?: string | null
          setor_status_novo?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          setor_anterior?: string | null
          setor_novo?: string | null
          setor_status_novo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sector_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      user_presence: {
        Row: {
          id: string
          last_logout_at: string | null
          last_seen: string
          last_session_duration_ms: number | null
          logged_in_at: string
          user_id: string
        }
        Insert: {
          id?: string
          last_logout_at?: string | null
          last_seen?: string
          last_session_duration_ms?: number | null
          logged_in_at?: string
          user_id: string
        }
        Update: {
          id?: string
          last_logout_at?: string | null
          last_seen?: string
          last_session_duration_ms?: number | null
          logged_in_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vendedores: {
        Row: {
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      crm_etapas_funil: {
        Row: {
          id: string
          nome: string
          ordem: number
          cor: string
          tipo_sistema: "padrao" | "ganha" | "perdida" | "cancelada"
          ativo: boolean
          regras: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          nome: string
          ordem: number
          cor?: string
          tipo_sistema?: "padrao" | "ganha" | "perdida" | "cancelada"
          ativo?: boolean
          regras?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          nome?: string
          ordem?: number
          cor?: string
          tipo_sistema?: "padrao" | "ganha" | "perdida" | "cancelada"
          ativo?: boolean
          regras?: Json | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_clientes: {
        Row: {
          id: string
          nome_fantasia: string
          razao_social: string | null
          cnpj_cpf: string | null
          contato_principal: string | null
          cargo: string | null
          telefone: string | null
          whatsapp: string | null
          email: string | null
          cidade: string | null
          uf: string | null
          endereco: string | null
          observacoes: string | null
          criado_por: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          nome_fantasia: string
          razao_social?: string | null
          cnpj_cpf?: string | null
          contato_principal?: string | null
          cargo?: string | null
          telefone?: string | null
          whatsapp?: string | null
          email?: string | null
          cidade?: string | null
          uf?: string | null
          endereco?: string | null
          observacoes?: string | null
          criado_por?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          nome_fantasia?: string
          razao_social?: string | null
          cnpj_cpf?: string | null
          contato_principal?: string | null
          cargo?: string | null
          telefone?: string | null
          whatsapp?: string | null
          email?: string | null
          cidade?: string | null
          uf?: string | null
          endereco?: string | null
          observacoes?: string | null
          criado_por?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_oportunidades: {
        Row: {
          id: string
          numero_sequencial: number
          codigo_identificador: string | null
          titulo: string
          cliente_id: string | null
          cliente_nome: string
          contato_nome: string | null
          contato_telefone: string | null
          contato_email: string | null
          origem_lead: string
          servico_solicitado: string
          descricao_necessidade: string | null
          valor_estimado: number
          vendedor_id: string | null
          vendedor_nome: string | null
          prioridade: "baixa" | "media" | "alta" | "urgente"
          etapa_id: string
          posicao: number
          status: "aberta" | "fechada_ganha" | "fechada_perdida" | "cancelada" | "pausada"
          motivo_perda: string | null
          detalhes_motivo_perda: string | null
          prazo_fechamento_previsto: string | null
          proxima_acao_descricao: string | null
          proxima_acao_data: string | null
          data_ultimo_contato: string | null
          anexos: Json | null
          tags: string[] | null
          convertida_os_id: string | null
          convertida_em: string | null
          criado_por: string | null
          atualizado_por: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          numero_sequencial?: number
          codigo_identificador?: string | null
          titulo: string
          cliente_id?: string | null
          cliente_nome: string
          contato_nome?: string | null
          contato_telefone?: string | null
          contato_email?: string | null
          origem_lead?: string
          servico_solicitado: string
          descricao_necessidade?: string | null
          valor_estimado?: number
          vendedor_id?: string | null
          vendedor_nome?: string | null
          prioridade?: "baixa" | "media" | "alta" | "urgente"
          etapa_id: string
          posicao?: number
          status?: "aberta" | "fechada_ganha" | "fechada_perdida" | "cancelada" | "pausada"
          motivo_perda?: string | null
          detalhes_motivo_perda?: string | null
          prazo_fechamento_previsto?: string | null
          proxima_acao_descricao?: string | null
          proxima_acao_data?: string | null
          data_ultimo_contato?: string | null
          anexos?: Json | null
          tags?: string[] | null
          convertida_os_id?: string | null
          convertida_em?: string | null
          criado_por?: string | null
          atualizado_por?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          numero_sequencial?: number
          codigo_identificador?: string | null
          titulo?: string
          cliente_id?: string | null
          cliente_nome?: string
          contato_nome?: string | null
          contato_telefone?: string | null
          contato_email?: string | null
          origem_lead?: string
          servico_solicitado?: string
          descricao_necessidade?: string | null
          valor_estimado?: number
          vendedor_id?: string | null
          vendedor_nome?: string | null
          prioridade?: "baixa" | "media" | "alta" | "urgente"
          etapa_id?: string
          posicao?: number
          status?: "aberta" | "fechada_ganha" | "fechada_perdida" | "cancelada" | "pausada"
          motivo_perda?: string | null
          detalhes_motivo_perda?: string | null
          prazo_fechamento_previsto?: string | null
          proxima_acao_descricao?: string | null
          proxima_acao_data?: string | null
          data_ultimo_contato?: string | null
          anexos?: Json | null
          tags?: string[] | null
          convertida_os_id?: string | null
          convertida_em?: string | null
          criado_por?: string | null
          atualizado_por?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_oportunidades_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "crm_clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_oportunidades_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "crm_etapas_funil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_oportunidades_convertida_os_id_fkey"
            columns: ["convertida_os_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          }
        ]
      }
      crm_propostas: {
        Row: {
          id: string
          oportunidade_id: string
          numero_proposta: string
          versao_numero: number
          proposta_anterior_id: string | null
          valor_total: number
          desconto_percentual: number | null
          desconto_valor: number | null
          valor_liquido: number
          condicoes_pagamento: string | null
          prazo_producao_dias: number | null
          validade_dias: number | null
          data_validade: string | null
          data_envio: string | null
          status: "rascunho" | "enviada" | "aguardando_aprovacao" | "aprovada" | "recusada" | "revisada"
          observacoes: string | null
          criado_por: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          oportunidade_id: string
          numero_proposta: string
          versao_numero?: number
          proposta_anterior_id?: string | null
          valor_total?: number
          desconto_percentual?: number | null
          desconto_valor?: number | null
          valor_liquido?: number
          condicoes_pagamento?: string | null
          prazo_producao_dias?: number | null
          validade_dias?: number | null
          data_validade?: string | null
          data_envio?: string | null
          status?: "rascunho" | "enviada" | "aguardando_aprovacao" | "aprovada" | "recusada" | "revisada"
          observacoes?: string | null
          criado_por?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          oportunidade_id?: string
          numero_proposta?: string
          versao_numero?: number
          proposta_anterior_id?: string | null
          valor_total?: number
          desconto_percentual?: number | null
          desconto_valor?: number | null
          valor_liquido?: number
          condicoes_pagamento?: string | null
          prazo_producao_dias?: number | null
          validade_dias?: number | null
          data_validade?: string | null
          data_envio?: string | null
          status?: "rascunho" | "enviada" | "aguardando_aprovacao" | "aprovada" | "recusada" | "revisada"
          observacoes?: string | null
          criado_por?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_propostas_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "crm_oportunidades"
            referencedColumns: ["id"]
          }
        ]
      }
      crm_proposta_itens: {
        Row: {
          id: string
          proposta_id: string
          posicao: number
          descricao_item: string
          formato_aberto: string | null
          formato_fechado: string | null
          papel_substrato: string | null
          cores_impressao: string | null
          acabamentos_especiais: string | null
          quantidade: number
          preco_unitario: number
          subtotal: number
          created_at: string
        }
        Insert: {
          id?: string
          proposta_id: string
          posicao?: number
          descricao_item: string
          formato_aberto?: string | null
          formato_fechado?: string | null
          papel_substrato?: string | null
          cores_impressao?: string | null
          acabamentos_especiais?: string | null
          quantidade?: number
          preco_unitario?: number
          subtotal?: number
          created_at?: string
        }
        Update: {
          id?: string
          proposta_id?: string
          posicao?: number
          descricao_item?: string
          formato_aberto?: string | null
          formato_fechado?: string | null
          papel_substrato?: string | null
          cores_impressao?: string | null
          acabamentos_especiais?: string | null
          quantidade?: number
          preco_unitario?: number
          subtotal?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_proposta_itens_proposta_id_fkey"
            columns: ["proposta_id"]
            isOneToOne: false
            referencedRelation: "crm_propostas"
            referencedColumns: ["id"]
          }
        ]
      }
      crm_atividades: {
        Row: {
          id: string
          oportunidade_id: string
          tipo: "ligacao" | "whatsapp" | "email" | "reuniao" | "envio_amostra" | "followup_orcamento" | "visita" | "outro"
          titulo: string
          descricao: string | null
          data_agendada: string
          status: "pendente" | "concluido" | "cancelado"
          resultado: string | null
          responsavel_id: string | null
          responsavel_nome: string | null
          concluido_em: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          oportunidade_id: string
          tipo: "ligacao" | "whatsapp" | "email" | "reuniao" | "envio_amostra" | "followup_orcamento" | "visita" | "outro"
          titulo: string
          descricao?: string | null
          data_agendada: string
          status?: "pendente" | "concluido" | "cancelado"
          resultado?: string | null
          responsavel_id?: string | null
          responsavel_nome?: string | null
          concluido_em?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          oportunidade_id?: string
          tipo?: "ligacao" | "whatsapp" | "email" | "reuniao" | "envio_amostra" | "followup_orcamento" | "visita" | "outro"
          titulo?: string
          descricao?: string | null
          data_agendada?: string
          status?: "pendente" | "concluido" | "cancelado"
          resultado?: string | null
          responsavel_id?: string | null
          responsavel_nome?: string | null
          concluido_em?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_atividades_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "crm_oportunidades"
            referencedColumns: ["id"]
          }
        ]
      }
      crm_oportunidade_historico: {
        Row: {
          id: string
          oportunidade_id: string
          usuario_id: string | null
          usuario_nome: string | null
          tipo_evento: string
          descricao: string
          dados_anteriores: Json | null
          dados_novos: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          oportunidade_id: string
          usuario_id?: string | null
          usuario_nome?: string | null
          tipo_evento: string
          descricao: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          oportunidade_id?: string
          usuario_id?: string | null
          usuario_nome?: string | null
          tipo_evento?: string
          descricao?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_oportunidade_historico_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "crm_oportunidades"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      compact_archived_history: { Args: never; Returns: Json }
      get_user_role: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "user"
        | "coordenador"
        | "operador"
        | "vendedor"
        | "orcamentista"
        | "impressor"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "user",
        "coordenador",
        "operador",
        "vendedor",
        "orcamentista",
        "impressor",
      ],
    },
  },
} as const
