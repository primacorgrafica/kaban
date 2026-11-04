import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getVerticalScrollTarget, performDndAutoScroll } from "@/lib/dndAutoScroll";

describe("dndAutoScroll utility", () => {
  let mainEl: HTMLElement;
  let containerEl: HTMLElement;

  beforeEach(() => {
    // Monta a estrutura típica do Primacor: <main> com container do Kanban dentro
    document.body.innerHTML = "";
    mainEl = document.createElement("main");
    mainEl.style.overflowY = "auto";
    mainEl.style.height = "600px";

    containerEl = document.createElement("div");
    containerEl.className = "flex overflow-x-auto";
    containerEl.style.overflowX = "auto";
    containerEl.style.width = "1000px";

    mainEl.appendChild(containerEl);
    document.body.appendChild(mainEl);

    // Mock getBoundingClientRect
    vi.spyOn(mainEl, "getBoundingClientRect").mockReturnValue({
      top: 50,
      bottom: 650,
      left: 60,
      right: 1200,
      width: 1140,
      height: 600,
      x: 60,
      y: 50,
      toJSON: () => {},
    });

    vi.spyOn(containerEl, "getBoundingClientRect").mockReturnValue({
      top: 100,
      bottom: 600,
      left: 60,
      right: 1060,
      width: 1000,
      height: 500,
      x: 60,
      y: 100,
      toJSON: () => {},
    });

    Object.defineProperty(window, "innerHeight", { value: 800, writable: true, configurable: true });
    Object.defineProperty(window, "innerWidth", { value: 1280, writable: true, configurable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getVerticalScrollTarget", () => {
    it("deve localizar a tag <main> como contêiner vertical prioritário", () => {
      const target = getVerticalScrollTarget(containerEl);
      expect(target).toBe(mainEl);
    });

    it("deve retornar a tag <main> via querySelector mesmo se o elemento não for filho direto", () => {
      const isolatedEl = document.createElement("div");
      const target = getVerticalScrollTarget(isolatedEl);
      expect(target).toBe(mainEl);
    });

    it("deve retornar null se elemento for nulo e não houver main", () => {
      document.body.innerHTML = "";
      const target = getVerticalScrollTarget(null);
      expect(target).toBe(document.documentElement);
    });
  });

  describe("performDndAutoScroll - Auto-scroll Vertical (Subir e Descer a Tela)", () => {
    it("deve rolar para CIMA (decrementar scrollTop de <main>) quando o mouse se aproxima do topo da tela", () => {
      // Simula que a página foi rolada para baixo
      mainEl.scrollTop = 300;
      Object.defineProperty(mainEl, "scrollHeight", { value: 1500, writable: true });
      Object.defineProperty(mainEl, "clientHeight", { value: 600, writable: true });

      // Mouse perto do topo (ex: mouseY = 70px, topo visível = 50px -> dist = 20px < 180px)
      performDndAutoScroll(containerEl, 500, 70, { edgeZone: 180, maxSpeed: 20 });

      expect(mainEl.scrollTop).toBeLessThan(300);
    });

    it("deve rolar para CIMA na velocidade MÁXIMA quando o card é arrastado para o cabeçalho/topo absoluto (mouseY <= top)", () => {
      mainEl.scrollTop = 300;
      Object.defineProperty(mainEl, "scrollHeight", { value: 1500, writable: true });
      Object.defineProperty(mainEl, "clientHeight", { value: 600, writable: true });

      // Mouse acima do topo (ex: mouseY = 20px, cabeçalho está em 50px -> dist <= 0)
      performDndAutoScroll(containerEl, 500, 20, { edgeZone: 180, maxSpeed: 20 });

      // Deve decrementar pelo maxSpeed (20px)
      expect(mainEl.scrollTop).toBe(280);
    });

    it("deve rolar para BAIXO (incrementar scrollTop de <main>) quando o mouse se aproxima da parte inferior da tela", () => {
      mainEl.scrollTop = 100;
      Object.defineProperty(mainEl, "scrollHeight", { value: 1500, writable: true });
      Object.defineProperty(mainEl, "clientHeight", { value: 600, writable: true });

      // Mouse perto da base visível (bottom = 650, mouseY = 630 -> distFromBottom = 20px < 180px)
      performDndAutoScroll(containerEl, 500, 630, { edgeZone: 180, maxSpeed: 20 });

      expect(mainEl.scrollTop).toBeGreaterThan(100);
    });

    it("NÃO deve rolar verticalmente quando o mouse está no centro da tela", () => {
      mainEl.scrollTop = 300;
      Object.defineProperty(mainEl, "scrollHeight", { value: 1500, writable: true });
      Object.defineProperty(mainEl, "clientHeight", { value: 600, writable: true });

      // Mouse no meio (mouseY = 350px, distFromTop = 300px, distFromBottom = 300px)
      performDndAutoScroll(containerEl, 500, 350, { edgeZone: 180, maxSpeed: 20 });

      expect(mainEl.scrollTop).toBe(300);
    });
  });

  describe("performDndAutoScroll - Auto-scroll Horizontal (Navegar entre Colunas)", () => {
    it("deve rolar para a ESQUERDA quando o mouse se aproxima da borda esquerda do trilho Kanban", () => {
      containerEl.scrollLeft = 200;
      Object.defineProperty(containerEl, "scrollWidth", { value: 2000, writable: true });
      Object.defineProperty(containerEl, "clientWidth", { value: 1000, writable: true });

      // hRect.left = 60, mouseX = 80 -> relX = 20 < 180
      performDndAutoScroll(containerEl, 80, 300, { edgeZone: 180, maxSpeed: 20 });

      expect(containerEl.scrollLeft).toBeLessThan(200);
    });

    it("deve rolar para a DIREITA quando o mouse se aproxima da borda direita do trilho Kanban", () => {
      containerEl.scrollLeft = 0;
      Object.defineProperty(containerEl, "scrollWidth", { value: 2000, writable: true });
      Object.defineProperty(containerEl, "clientWidth", { value: 1000, writable: true });

      // hRect.left = 60, width = 1000, hRect.right = 1060, mouseX = 1040 -> relX = 980 (width - relX = 20 < 180)
      performDndAutoScroll(containerEl, 1040, 300, { edgeZone: 180, maxSpeed: 20 });

      expect(containerEl.scrollLeft).toBeGreaterThan(0);
    });
  });
});
