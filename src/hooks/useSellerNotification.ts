import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  type SellerNotificationRecord,
  retrySellerNotification,
  triggerSellerApprovalNotification,
} from "@/lib/sellerNotificationService";
import { toast } from "sonner";

export interface UseSellerNotificationReturn {
  notifications: SellerNotificationRecord[];
  latestNotification: SellerNotificationRecord | null;
  loading: boolean;
  refetch: () => Promise<void>;
  retry: (notificationId?: string) => Promise<boolean>;
  triggerNow: () => Promise<void>;
}

/**
 * Hook para monitorar e controlar as notificações por e-mail enviadas ao vendedor
 * associado a uma Ordem de Serviço específica.
 */
export function useSellerNotification(orderId?: string | null): UseSellerNotificationReturn {
  const [notifications, setNotifications] = useState<SellerNotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!orderId) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("order_seller_notifications")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false });

      if (error) {
        console.warn("[useSellerNotification] Erro ao buscar notificações:", error);
      } else if (data) {
        setNotifications(data as unknown as SellerNotificationRecord[]);
      }
    } catch (err) {
      console.error("[useSellerNotification] Exceção:", err);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    let isMounted = true;

    if (orderId) {
      setLoading(true);
      fetchNotifications().then(() => {
        if (!isMounted) return;
      });

      let channel: any = null;
      try {
        const uniqueChannelName = `seller-notif-${orderId}-${Math.random().toString(36).substring(2, 9)}`;
        channel = supabase
          .channel(uniqueChannelName)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "order_seller_notifications",
              filter: `order_id=eq.${orderId}`,
            },
            () => {
              void fetchNotifications();
            }
          )
          .subscribe();
      } catch (subErr) {
        console.warn("[useSellerNotification] Falha ao registrar realtime:", subErr);
      }

      return () => {
        isMounted = false;
        if (channel) {
          try {
            void supabase.removeChannel(channel);
          } catch (_) {}
        }
      };
    } else {
      setNotifications([]);
      setLoading(false);
    }
  }, [orderId, fetchNotifications]);

  const latestNotification = notifications[0] || null;

  const retry = useCallback(
    async (notificationId?: string): Promise<boolean> => {
      const targetId = notificationId || latestNotification?.id;
      if (!targetId) {
        toast.error("Nenhuma notificação para reenviar.");
        return false;
      }

      toast.loading("Reenviando e-mail ao vendedor...", { id: "retry-seller-notif" });
      const ok = await retrySellerNotification(targetId);
      if (ok) {
        toast.success("E-mail reenviado com sucesso!", { id: "retry-seller-notif" });
        await fetchNotifications();
        return true;
      } else {
        toast.error("Falha ao reenviar notificação. Verifique se o vendedor possui e-mail válido.", {
          id: "retry-seller-notif",
        });
        await fetchNotifications();
        return false;
      }
    },
    [latestNotification, fetchNotifications]
  );

  const triggerNow = useCallback(async () => {
    if (!orderId) return;
    toast.loading("Disparando notificação ao vendedor...", { id: "trigger-seller-notif" });
    const res = await triggerSellerApprovalNotification(orderId, { force: true });
    if (res.success && res.sent) {
      toast.success("Notificação enviada ao vendedor!", { id: "trigger-seller-notif" });
    } else if (res.success && res.skippedDuplicate) {
      toast.info("Notificação já enviada recentemente para esta O.S.", { id: "trigger-seller-notif" });
    } else {
      toast.error(res.error || "Falha ao disparar notificação.", { id: "trigger-seller-notif" });
    }
    await fetchNotifications();
  }, [orderId, fetchNotifications]);

  return {
    notifications,
    latestNotification,
    loading,
    refetch: fetchNotifications,
    retry,
    triggerNow,
  };
}
