import { describe, it, expect } from "vitest";
import {
  cleanDeliveryAddress,
  isUsableDeliveryAddress,
  buildGoogleMapsSearchUrl,
  buildGoogleMapsRouteUrl,
} from "@/lib/googleMapsUtils";

describe("googleMapsUtils - Integração Google Maps Gestão de Entregas", () => {
  describe("isUsableDeliveryAddress", () => {
    it("deve retornar falso para nulo, indefinido ou strings vazias", () => {
      expect(isUsableDeliveryAddress(null)).toBe(false);
      expect(isUsableDeliveryAddress(undefined)).toBe(false);
      expect(isUsableDeliveryAddress("")).toBe(false);
      expect(isUsableDeliveryAddress("   ")).toBe(false);
    });

    it("deve retornar falso para marcadores e placeholders vazios comuns", () => {
      expect(isUsableDeliveryAddress("—")).toBe(false);
      expect(isUsableDeliveryAddress("-")).toBe(false);
      expect(isUsableDeliveryAddress("--")).toBe(false);
      expect(isUsableDeliveryAddress("null")).toBe(false);
      expect(isUsableDeliveryAddress("undefined")).toBe(false);
      expect(isUsableDeliveryAddress("N/A")).toBe(false);
      expect(isUsableDeliveryAddress("sem endereço")).toBe(false);
      expect(isUsableDeliveryAddress("a combinar")).toBe(false);
      expect(isUsableDeliveryAddress("retirar")).toBe(false);
    });

    it("deve retornar verdadeiro para endereços válidos utilizáveis", () => {
      expect(isUsableDeliveryAddress("Rua das Flores, 123")).toBe(true);
      expect(isUsableDeliveryAddress("Av. Paulista, 1000 - Bela Vista - SP")).toBe(true);
    });
  });

  describe("cleanDeliveryAddress", () => {
    it("deve limpar prefixos como 'Endereço:' e 'Endereco:'", () => {
      expect(cleanDeliveryAddress("Endereço: Rua Augusta, 500")).toBe("Rua Augusta, 500");
      expect(cleanDeliveryAddress("Endereco: Av. Brasil, 120")).toBe("Av. Brasil, 120");
    });

    it("deve separar dados de e-mail acoplados em metadados", () => {
      const raw = "Endereço: Rua da Consolação, 200 | E-mail: contato@cliente.com";
      expect(cleanDeliveryAddress(raw)).toBe("Rua da Consolação, 200");
    });

    it("deve normalizar espaços em branco múltiplos", () => {
      expect(cleanDeliveryAddress("  Rua   São   Bento,   45   ")).toBe("Rua São Bento, 45");
    });
  });

  describe("buildGoogleMapsSearchUrl", () => {
    it("deve gerar a URL oficial do Google Maps com o parâmetro query codificado", () => {
      const addr = "Av. Paulista, 1000 - Bela Vista, São Paulo - SP, 01310-100";
      const url = buildGoogleMapsSearchUrl(addr);
      expect(url).toContain("https://www.google.com/maps/search/?api=1&query=");
      expect(url).toContain(encodeURIComponent(addr));
    });

    it("deve suportar endereços sem CEP", () => {
      const addr = "Rua Vergueiro, 500 - Liberdade, São Paulo - SP";
      const url = buildGoogleMapsSearchUrl(addr);
      expect(url).toBe(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`);
    });

    it("deve codificar corretamente acentos e caracteres especiais (ex: ã, é, ç, º, &)", () => {
      const addr = "Praça da Sé, 10º Andar & Sala 2, São Paulo - SP";
      const url = buildGoogleMapsSearchUrl(addr);
      expect(url).toBe(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`);
      expect(url).toContain("%C3%A3"); // ã
      expect(url).toContain("%C3%A9"); // é
      expect(url).toContain("%C2%BA"); // º
      expect(url).toContain("%26");    // &
    });
  });

  describe("buildGoogleMapsRouteUrl", () => {
    it("deve gerar a URL oficial do Google Maps para traçar rotas com o destino codificado", () => {
      const addr = "Av. das Nações Unidas, 12901 - Brooklin Paulista, São Paulo - SP";
      const url = buildGoogleMapsRouteUrl(addr);
      expect(url).toContain("https://www.google.com/maps/dir/?api=1&destination=");
      expect(url).toContain(encodeURIComponent(addr));
    });
  });
});
