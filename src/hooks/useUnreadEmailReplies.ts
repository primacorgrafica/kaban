import { useState, useEffect, useCallback } from "react";
import { unreadEmailsManager } from "@/lib/unreadEmailsManager";
import type { OrderEmailEvent } from "@/types/email";

export interface UseUnreadEmailRepliesReturn {
  hasUnread: (orderId: string, osNumberOrTitle?: string) => boolean;
  hasVerified: (orderId: string, osNumberOrTitle?: string) => boolean;
  hasEmailReply: (orderId: string, osNumberOrTitle?: string) => boolean;
  getAllRepliedOrderIds: () => Set<string>;
  getUnreadEvents: (orderId: string, osNumberOrTitle?: string) => OrderEmailEvent[];
  getUnreadCountForOrders: (orderIds: string[]) => number;
  getVerifiedCountForOrders: (orderIds: string[]) => number;
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

  const hasUnread = useCallback((orderId: string, osNumberOrTitle?: string) => {
    return unreadEmailsManager.hasUnread(orderId, osNumberOrTitle);
  }, []);

  const hasVerified = useCallback((orderId: string, osNumberOrTitle?: string) => {
    return unreadEmailsManager.hasVerified(orderId, osNumberOrTitle);
  }, []);

  const hasEmailReply = useCallback((orderId: string, osNumberOrTitle?: string) => {
    return unreadEmailsManager.hasEmailReply(orderId, osNumberOrTitle);
  }, []);

  const getAllRepliedOrderIds = useCallback(() => {
    return unreadEmailsManager.getAllRepliedOrderIds();
  }, []);

  const getUnreadEvents = useCallback((orderId: string, osNumberOrTitle?: string) => {
    return unreadEmailsManager.getUnreadEvents(orderId, osNumberOrTitle);
  }, []);

  const getUnreadCountForOrders = useCallback((orderIds: string[]) => {
    return unreadEmailsManager.getUnreadCountForOrders(orderIds);
  }, []);

  const getVerifiedCountForOrders = useCallback((orderIds: string[]) => {
    return unreadEmailsManager.getVerifiedCountForOrders(orderIds);
  }, []);

  const markAsRead = useCallback(async (orderId: string, osNumber?: string) => {
    await unreadEmailsManager.markOrderAsRead(orderId, osNumber);
  }, []);

  const unreadOrderIds = unreadEmailsManager.getUnreadOrderIds();

  return {
    hasUnread,
    hasVerified,
    hasEmailReply,
    getAllRepliedOrderIds,
    getUnreadEvents,
    getUnreadCountForOrders,
    getVerifiedCountForOrders,
    markAsRead,
    unreadOrderIds,
  };
}
