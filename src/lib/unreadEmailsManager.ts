/**
 * Gerenciador centralizado de status de leitura de respostas de e-mail dos clientes.
 *
 * Funcionalidades:
 * - Mantém em cache os IDs de eventos de e-mails já lidos (via Supabase + localStorage).
 * - Notifica componentes React em tempo real através de pub/sub (zero-overhead).
 * - Escuta o canal Realtime do Supabase em 'order_email_events' para acender o ícone imediatamente.
 * - Permite marcar uma O.S. inteira ou mensagens individuais como lidas.
 */

import { supabase } from "@/integrations/supabase/client";
import type { OrderEmailEvent } from "@/types/email";

const STORAGE_READ_EVENT_IDS = "kaban_read_email_event_ids";
const STORAGE_READ_ORDER_TIMESTAMPS = "kaban_read_order_email_timestamps";

class UnreadEmailsManager {
  private readEventIds: Set<string> = new Set();
  private readOrderTimestamps: Map<string, number> = new Map();
  // Mapeamento: orderId -> OrderEmailEvent[] (apenas respostas 'recebido' ainda não lidas)
  private unreadByOrder: Map<string, OrderEmailEvent[]> = new Map();
  // Conjunto de orderIds que possuem histórico de respostas de e-mail recebidas
  private allReceivedOrderIds: Set<string> = new Set();
  private subscribers: Set<() => void> = new Set();
  private initialized = false;
  private realtimeChannel: any = null;

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    if (typeof window === "undefined") return;
    try {
      const storedIds = localStorage.getItem(STORAGE_READ_EVENT_IDS);
      if (storedIds) {
        const parsed = JSON.parse(storedIds);
        if (Array.isArray(parsed)) {
          this.readEventIds = new Set(parsed);
        }
      }

      const storedTimestamps = localStorage.getItem(STORAGE_READ_ORDER_TIMESTAMPS);
      if (storedTimestamps) {
        const parsed = JSON.parse(storedTimestamps);
        if (typeof parsed === "object" && parsed !== null) {
          this.readOrderTimestamps = new Map(Object.entries(parsed));
        }
      }
    } catch (e) {
      console.warn("[UnreadEmailsManager] Falha ao ler storage local:", e);
    }
  }

  private saveToStorage() {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(
        STORAGE_READ_EVENT_IDS,
        JSON.stringify(Array.from(this.readEventIds).slice(-1000))
      );
      const timestampsObj: Record<string, number> = {};
      this.readOrderTimestamps.forEach((val, key) => {
        timestampsObj[key] = val;
      });
      localStorage.setItem(
        STORAGE_READ_ORDER_TIMESTAMPS,
        JSON.stringify(timestampsObj)
      );
    } catch (e) {
      console.warn("[UnreadEmailsManager] Falha ao gravar storage local:", e);
    }
  }

  private notify() {
    this.subscribers.forEach((cb) => {
      try {
        cb();
      } catch (err) {
        console.error("[UnreadEmailsManager] Erro em listener de e-mail:", err);
      }
    });
  }

  public subscribe(cb: () => void): () => void {
    this.subscribers.add(cb);
    if (!this.initialized) {
      void this.init();
    }
    return () => {
      this.subscribers.delete(cb);
    };
  }

  public async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    await this.fetchRecentReceivedEvents();
    this.setupRealtime();
  }

  /**
   * Consulta os eventos recentes de e-mail recebidos para preencher o estado inicial.
   */
  public async fetchRecentReceivedEvents(): Promise<void> {
    try {
      // Carrega eventos recebidos dos últimos 30 dias
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("order_email_events")
        .select("*")
        .eq("direction", "recebido")
        .gte("created_at", cutoff)
        .order("email_datetime", { ascending: false });

      if (error) {
        console.warn("[UnreadEmailsManager] Erro ao buscar eventos:", error);
        return;
      }

      const rows = (data as unknown as OrderEmailEvent[]) || [];
      const newUnreadMap = new Map<string, OrderEmailEvent[]>();
      const allReceived = new Set<string>();

      for (const evt of rows) {
        if (evt.order_id) {
          allReceived.add(evt.order_id);
        }
        if (this.isEventUnread(evt)) {
          const list = newUnreadMap.get(evt.order_id) || [];
          list.push(evt);
          newUnreadMap.set(evt.order_id, list);
        }
      }

      this.unreadByOrder = newUnreadMap;
      this.allReceivedOrderIds = allReceived;
      this.notify();
    } catch (err) {
      console.error("[UnreadEmailsManager] Exceção na inicialização:", err);
    }
  }

  private isEventUnread(evt: OrderEmailEvent): boolean {
    if (evt.direction !== "recebido") return false;

    // Se o evento possui 'read_at' preenchido no Supabase, já foi lido
    if ((evt as any).read_at) return false;

    // Se o ID está na lista local de lidos
    if (this.readEventIds.has(evt.id)) return false;

    // Se o operador já marcou a O.S. inteira como lida após o recebimento deste e-mail
    const orderReadTimestamp = this.readOrderTimestamps.get(evt.order_id);
    if (orderReadTimestamp) {
      const evtTime = new Date(evt.email_datetime || evt.created_at).getTime();
      if (evtTime <= orderReadTimestamp) {
        return false;
      }
    }

    return true;
  }

  private setupRealtime() {
    if (this.realtimeChannel) return;

    try {
      this.realtimeChannel = supabase
        .channel("kaban-order-email-events-unread-monitor")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "order_email_events",
          },
          (payload) => {
            const eventType = payload.eventType;
            const newRow = payload.new as OrderEmailEvent | undefined;
            const oldRow = payload.old as OrderEmailEvent | undefined;

            if (eventType === "INSERT" && newRow && newRow.direction === "recebido") {
              if (newRow.order_id) {
                this.allReceivedOrderIds.add(newRow.order_id);
              }
              if (this.isEventUnread(newRow)) {
                const list = this.unreadByOrder.get(newRow.order_id) || [];
                // Evita duplicar o mesmo evento
                if (!list.some((e) => e.id === newRow.id)) {
                  list.unshift(newRow);
                  this.unreadByOrder.set(newRow.order_id, list);
                  this.notify();
                }
              }
            } else if (eventType === "UPDATE" && newRow) {
              if (newRow.order_id) {
                this.allReceivedOrderIds.add(newRow.order_id);
              }
              if ((newRow as any).read_at || !this.isEventUnread(newRow)) {
                // Evento foi marcado como lido
                this.readEventIds.add(newRow.id);
                this.saveToStorage();
                const list = this.unreadByOrder.get(newRow.order_id) || [];
                const updatedList = list.filter((e) => e.id !== newRow.id);
                if (updatedList.length === 0) {
                  this.unreadByOrder.delete(newRow.order_id);
                } else {
                  this.unreadByOrder.set(newRow.order_id, updatedList);
                }
                this.notify();
              }
            } else if (eventType === "DELETE" && oldRow?.id) {
              this.unreadByOrder.forEach((list, orderId) => {
                const filtered = list.filter((e) => e.id !== oldRow.id);
                if (filtered.length !== list.length) {
                  if (filtered.length === 0) {
                    this.unreadByOrder.delete(orderId);
                  } else {
                    this.unreadByOrder.set(orderId, filtered);
                  }
                  this.notify();
                }
              });
            }
          }
        )
        .subscribe();
    } catch (e) {
      console.warn("[UnreadEmailsManager] Falha ao assinar realtime:", e);
    }
  }

  /**
   * Verifica se uma Ordem de Serviço específica possui resposta de e-mail não lida.
   */
  public hasUnread(orderId: string): boolean {
    const list = this.unreadByOrder.get(orderId);
    return !!list && list.length > 0;
  }

  /**
   * Verifica se uma Ordem de Serviço possui respostas de e-mail e todas já foram lidas/verificadas.
   */
  public hasVerified(orderId: string): boolean {
    return this.allReceivedOrderIds.has(orderId) && !this.hasUnread(orderId);
  }

  /**
   * Retorna os eventos não lidos de uma O.S.
   */
  public getUnreadEvents(orderId: string): OrderEmailEvent[] {
    return this.unreadByOrder.get(orderId) || [];
  }

  /**
   * Retorna a quantidade de ordens com e-mails não lidos dentre uma lista de orderIds
   * (usado pelo cabeçalho da coluna do Kanban).
   */
  public getUnreadCountForOrders(orderIds: string[]): number {
    let count = 0;
    for (const id of orderIds) {
      if (this.hasUnread(id)) {
        count++;
      }
    }
    return count;
  }

  /**
   * Retorna a quantidade de ordens com e-mails verificados/lidos dentre uma lista de orderIds
   * (usado pelo cabeçalho da coluna do Kanban para exibir a cartinha verde).
   */
  public getVerifiedCountForOrders(orderIds: string[]): number {
    let count = 0;
    for (const id of orderIds) {
      if (this.hasVerified(id)) {
        count++;
      }
    }
    return count;
  }

  /**
   * Retorna o snapshot de todos os IDs de O.S. com e-mails não lidos.
   */
  public getUnreadOrderIds(): Set<string> {
    const set = new Set<string>();
    this.unreadByOrder.forEach((list, orderId) => {
      if (list.length > 0) set.add(orderId);
    });
    return set;
  }

  /**
   * Marca as respostas de e-mail de uma O.S. como lidas pelo operador.
   * Atualiza imediatamente a UI (0ms) e persiste em background.
   */
  public async markOrderAsRead(orderId: string, osNumber?: string): Promise<void> {
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    // 1. Atualização Otimista Imediata (UI reage em 0ms)
    const existingEvents = this.unreadByOrder.get(orderId) || [];
    existingEvents.forEach((evt) => {
      this.readEventIds.add(evt.id);
    });
    this.readOrderTimestamps.set(orderId, now);
    this.unreadByOrder.delete(orderId);
    this.allReceivedOrderIds.add(orderId);
    this.saveToStorage();
    this.notify();

    // 2. Persiste no Supabase em segundo plano
    try {
      // Tenta atualizar a coluna read_at em order_email_events
      await supabase
        .from("order_email_events")
        .update({ read_at: nowIso } as any)
        .eq("order_id", orderId)
        .eq("direction", "recebido");
    } catch {
      // Silencioso se a coluna read_at ainda não tiver sido criada no DB
    }

    // 3. Marca eventuais avisos na central de avisos como lidos para este usuário
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      if (userId) {
        // Busca avisos recentes referentes a esta O.S.
        const osQuery = osNumber ? osNumber.replace(/^[#\s]+/, "") : "";
        if (osQuery) {
          const { data: avisosData } = await supabase
            .from("avisos")
            .select("id")
            .ilike("titulo", `%${osQuery}%`)
            .limit(10);

          if (avisosData && avisosData.length > 0) {
            for (const av of avisosData) {
              await supabase
                .from("avisos_lidos")
                .insert({ aviso_id: av.id, user_id: userId })
                .then(() => null)
                .catch(() => null);
            }
          }
        }
      }
    } catch {
      // Silencioso
    }
  }
}

// Instância singleton para toda a aplicação
export const unreadEmailsManager = new UnreadEmailsManager();
