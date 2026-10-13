import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * DraggablePortal — renderiza o card arrastado diretamente no document.body.
 * Isso corrige o offset quando o container pai usa overflow-x: auto + scroll,
 * pois remove a influência do scrollLeft/scrollTop no cálculo de posição da lib.
 */
interface DraggablePortalProps {
  isDragging: boolean;
  children: React.ReactNode;
}

export function DraggablePortal({ isDragging, children }: DraggablePortalProps) {
  const portalEl = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = document.createElement("div");
    el.style.position = "fixed";
    el.style.top = "0";
    el.style.left = "0";
    el.style.zIndex = "9999";
    el.style.pointerEvents = "none";
    document.body.appendChild(el);
    portalEl.current = el;
    return () => {
      document.body.removeChild(el);
    };
  }, []);

  if (isDragging && portalEl.current) {
    return createPortal(children, portalEl.current);
  }

  return <>{children}</>;
}
