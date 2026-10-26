import { useState, useEffect, useCallback } from "react";
import { unreadEmailsManager } from "@/lib/unreadEmailsManager";
import type { OrderEmailEvent } from "@/types/email";

export interface UseUnreadEmailRepliesReturn {
  hasUnread: (orderId: string) => boolean;
  getUnreadEvents: (orderId: string) => OrderEmailEvent[];
  getUnreadCountForOrders: (orderIds: string[]) => number;
  markAsRead: (orderId: string, osNumber?: string) => Promise<void>;
  unreadOrderIds: Set<string>;
}

/**
 * Hook para acessar em tempo real o status de respostas de e-mail não lidas
 * vinculadas às Ordens de Serviço.
 */
export function useUnreadEmailReplies(): UseUnreadEmailRepliesReturn {
  const [, setTick] = useState(0);

  useEffect(() => {
    // Inscreve no gerenciador singleton
    const unsubscribe = unreadEmailsManager.subscribe(() => {
      setTick((t) => t + 1);
    });
    return unsubscribe;
  }, []);

  const hasUnread = useCallback((orderId: string) => {
    return unreadEmailsManager.hasUnread(orderId);
  }, []);

  const getUnreadEvents = useCallback((orderId: string) => {
    return unreadEmailsManager.getUnreadEvents(orderId);
  }, []);

  const getUnreadCountForOrders = useCallback((orderIds: string[]) => {
    return unreadEmailsManager.getUnreadCountForOrders(orderIds);
  }, []);

  const markAsRead = useCallback(async (orderId: string, osNumber?: string) => {
    await unreadEmailsManager.markOrderAsRead(orderId, osNumber);
  }, []);

  const unreadOrderIds = unreadEmailsManager.getUnreadOrderIds();

  return {
    hasUnread,
    getUnreadEvents,
    getUnreadCountForOrders,
    markAsRead,
    unreadOrderIds,
  };
}
