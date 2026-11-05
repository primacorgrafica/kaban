import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { highlightOrderCard } from "@/lib/orderRelationsService";

/**
 * Hook para detectar e acionar o destaque temporário de um card de O.S.
 * Suporta navegação via search params (?highlight=<orderId>) e eventos locais ("highlight-order").
 */
export function useOrderHighlight(ordersLoading = false) {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // 1. Ouvinte para eventos de destaque na mesma página
    const handleHighlightEvent = (e: Event) => {
      const custom = e as CustomEvent<{ orderId: string }>;
      if (custom.detail?.orderId) {
        highlightOrderCard(custom.detail.orderId);
      }
    };

    window.addEventListener("highlight-order", handleHighlightEvent);

    return () => {
      window.removeEventListener("highlight-order", handleHighlightEvent);
    };
  }, []);

  useEffect(() => {
    if (ordersLoading) return;

    const params = new URLSearchParams(location.search);
    const targetOrderId = params.get("highlight");

    if (targetOrderId) {
      let attempts = 0;
      const maxAttempts = 12; // Tenta por ~3 segundos até os cards renderizarem

      const tryHighlight = () => {
        attempts++;
        const success = highlightOrderCard(targetOrderId);
        if (success || attempts >= maxAttempts) {
          // Remove o parâmetro highlight da URL de forma limpa sem recarregar a página
          params.delete("highlight");
          const newSearch = params.toString() ? `?${params.toString()}` : "";
          navigate(`${location.pathname}${newSearch}`, { replace: true });
        } else {
          setTimeout(tryHighlight, 250);
        }
      };

      // Inicia a primeira tentativa com pequeno delay para garantir montagem do DOM
      const timer = setTimeout(tryHighlight, 150);
      return () => clearTimeout(timer);
    }
  }, [location.pathname, location.search, ordersLoading, navigate]);
}
