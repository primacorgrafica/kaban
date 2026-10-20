import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { OrderEmailEvent } from "@/types/email";

export interface UseOrderEmailsReturn {
  events: OrderEmailEvent[];
  latestReceived: OrderEmailEvent | null;
  latestSent: OrderEmailEvent | null;
  loading: boolean;
  refetch: () => Promise<void>;
}

/**
 * Hook para carregar e escutar em tempo real eventos de e-mail de uma O.S. específica.
 */
export function useOrderEmails(orderId?: string | null): UseOrderEmailsReturn {
  const [events, setEvents] = useState<OrderEmailEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = useCallback(async () => {
    if (!orderId) {
      setEvents([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("order_email_events")
        .select("*")
        .eq("order_id", orderId)
        .order("email_datetime", { ascending: false });

      if (error) {
        console.warn("[useOrderEmails] Erro ao buscar eventos de e-mail:", error);
      } else if (data) {
        setEvents(data as unknown as OrderEmailEvent[]);
      }
    } catch (err) {
      console.error("[useOrderEmails] Exceção:", err);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    let isMounted = true;

    if (orderId) {
      setLoading(true);
      fetchEvents().then(() => {
        if (!isMounted) return;
      });

      // Inscrição Realtime no Supabase para atualizações automáticas do card
      const channel = supabase
        .channel(`order-emails-${orderId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "order_email_events",
            filter: `order_id=eq.${orderId}`,
          },
          () => {
            void fetchEvents();
          }
        )
        .subscribe();

      return () => {
        isMounted = false;
        supabase.removeChannel(channel);
      };
    } else {
      setEvents([]);
      setLoading(false);
    }
  }, [orderId, fetchEvents]);

  const latestReceived = events.find((e) => e.direction === "recebido") || null;
  const latestSent = events.find((e) => e.direction === "enviado") || null;

  return {
    events,
    latestReceived,
    latestSent,
    loading,
    refetch: fetchEvents,
  };
}
