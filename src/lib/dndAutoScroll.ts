/**
 * Utilitário de auto-scroll para Drag and Drop (DnD) nos quadros Kanban do Primacor.
 * 
 * Permite rolagem suave tanto horizontal (nas colunas do quadro) quanto vertical
 * (no container <main> que rola a página), garantindo que ao arrastar um card em
 * qualquer direção (especialmente subindo para o topo da tela), o viewport acompanhe
 * o movimento do operador.
 */

/**
 * Localiza o elemento que realmente possui rolagem vertical ativa (<main> no layout Primacor)
 */
export function getVerticalScrollTarget(el: HTMLElement | null): HTMLElement | null {
  if (typeof window === "undefined") return null;

  // 1. Busca nos elementos ancestrais pelo container com overflow vertical ou pela tag <main>
  let curr: HTMLElement | null = el?.parentElement || null;
  while (curr) {
    if (curr.tagName === "MAIN") {
      return curr;
    }
    const style = window.getComputedStyle(curr);
    if (style.overflowY === "auto" || style.overflowY === "scroll") {
      return curr;
    }
    curr = curr.parentElement;
  }

  // 2. Busca direta pela tag <main> do layout da aplicação
  const main = document.querySelector("main");
  if (main) return main as HTMLElement;

  // 3. Verifica se o próprio container possui rolagem
  if (el) {
    const style = window.getComputedStyle(el);
    if (style.overflowY === "auto" || style.overflowY === "scroll") {
      return el;
    }
  }

  // 4. Fallback final para document.scrollingElement
  return (document.scrollingElement as HTMLElement) || document.documentElement || null;
}

export interface AutoScrollOptions {
  edgeZone?: number;
  maxSpeed?: number;
}

/**
 * Executa uma passada de auto-scroll para arrastos DnD, suportando:
 * - Rolagem horizontal suave no track do Kanban (containerEl.scrollLeft)
 * - Rolagem vertical suave no contêiner da página (vTarget.scrollTop)
 */
export function performDndAutoScroll(
  containerEl: HTMLElement | null,
  mouseX: number,
  mouseY: number,
  options?: AutoScrollOptions
): void {
  if (!containerEl || typeof window === "undefined") return;

  const EDGE_ZONE = options?.edgeZone ?? 180;
  const MAX_SPEED = options?.maxSpeed ?? 20;

  const hRect = containerEl.getBoundingClientRect();

  // 1. Auto-scroll Horizontal no trilho do Kanban
  const vTopLimit = Math.max(0, hRect.top - 120);
  const vBottomLimit = Math.min(window.innerHeight, hRect.bottom + 120);

  if (mouseY >= vTopLimit && mouseY <= vBottomLimit) {
    const relX = mouseX - hRect.left;
    const width = hRect.width;

    if (relX < EDGE_ZONE && relX >= -120) {
      const ratio = Math.max(0, Math.min(1, 1 - relX / EDGE_ZONE));
      const speed = Math.ceil(MAX_SPEED * Math.pow(ratio, 1.2));
      if (containerEl.scrollLeft > 0) {
        containerEl.scrollLeft -= speed;
      }
    } else if (relX > width - EDGE_ZONE && relX <= width + 120) {
      const ratio = Math.max(0, Math.min(1, 1 - (width - relX) / EDGE_ZONE));
      const speed = Math.ceil(MAX_SPEED * Math.pow(ratio, 1.2));
      const maxScrollX = containerEl.scrollWidth - containerEl.clientWidth;
      if (containerEl.scrollLeft < maxScrollX) {
        containerEl.scrollLeft += speed;
      }
    }
  }

  // 2. Auto-scroll Vertical no contêiner da tela (<main>)
  const vTarget = getVerticalScrollTarget(containerEl);
  if (vTarget) {
    const vRect = vTarget.getBoundingClientRect();
    const visibleTop = Math.max(0, vRect.top);
    const visibleBottom = Math.min(window.innerHeight, vRect.bottom);

    const distFromTop = mouseY - visibleTop;
    const distFromBottom = visibleBottom - mouseY;

    if (distFromTop < EDGE_ZONE) {
      // Usuário subiu com o card selecionado: rola a tela para cima!
      const ratio = Math.max(0, Math.min(1, 1 - distFromTop / EDGE_ZONE));
      const speed = Math.ceil(MAX_SPEED * Math.pow(ratio, 1.2));

      if (vTarget.scrollTop > 0) {
        vTarget.scrollTop -= speed;
      } else if (window.scrollY > 0) {
        window.scrollBy(0, -speed);
      }

      // Se o próprio container também tiver scroll vertical, decrementa junto
      if (containerEl !== vTarget && containerEl.scrollTop > 0) {
        containerEl.scrollTop -= speed;
      }
    } else if (distFromBottom < EDGE_ZONE) {
      // Usuário desceu com o card selecionado: rola a tela para baixo!
      const ratio = Math.max(0, Math.min(1, 1 - distFromBottom / EDGE_ZONE));
      const speed = Math.ceil(MAX_SPEED * Math.pow(ratio, 1.2));
      const maxScrollY = vTarget.scrollHeight - vTarget.clientHeight;

      if (vTarget.scrollTop < maxScrollY) {
        vTarget.scrollTop += speed;
      } else {
        window.scrollBy(0, speed);
      }

      if (containerEl !== vTarget && containerEl.scrollTop < containerEl.scrollHeight - containerEl.clientHeight) {
        containerEl.scrollTop += speed;
      }
    }
  }
}
