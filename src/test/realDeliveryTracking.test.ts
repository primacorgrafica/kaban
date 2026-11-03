import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  calculateHaversineDistance,
  fetchOsrmRoute,
} from "@/services/osrmService";
import { sanitizeAddressForGeocoding } from "@/services/nominatimService";
import {
  createDriverLeafletIcon,
  createCustomerLeafletIcon,
} from "@/components/delivery/monitoring/DeliveryMapMarkers";

describe("Módulo de Rastreamento e Telemetria em Tempo Real (Leaflet + OSM + OSRM + Nominatim)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Cálculo Geodésico de Distância (Fórmula de Haversine)", () => {
    it("deve retornar 0 quando origem e destino forem exatamente as mesmas coordenadas", () => {
      const dist = calculateHaversineDistance(-19.9167, -43.9345, -19.9167, -43.9345);
      expect(dist).toBe(0);
    });

    it("deve calcular a distância real aproximada entre Praça Sete (BH) e Contagem (~12.5 km)", () => {
      // Praça Sete: [-19.9167, -43.9345]
      // Centro de Contagem: [-19.9321, -44.0539]
      const dist = calculateHaversineDistance(-19.9167, -43.9345, -19.9321, -44.0539);
      expect(dist).toBeGreaterThan(12.0);
      expect(dist).toBeLessThan(13.5);
    });

    it("deve calcular a distância entre Primacor e Savassi corretamente", () => {
      // Ponto A: [-19.9200, -43.9400]
      // Ponto B: [-19.9380, -43.9330] (~2.1 km em linha reta)
      const dist = calculateHaversineDistance(-19.9200, -43.9400, -19.9380, -43.9330);
      expect(dist).toBeGreaterThan(1.8);
      expect(dist).toBeLessThan(2.5);
    });
  });

  describe("2. Sanitização de Endereço para Nominatim OpenStreetMap Brasil", () => {
    it("deve remover prefixos de logradouro comuns (Rua, Avenida, etc.)", () => {
      const sanitized = sanitizeAddressForGeocoding("Avenida Afonso Pena, 1500");
      expect(sanitized.toLowerCase()).not.toMatch(/^avenida/);
      expect(sanitized).toContain("Afonso Pena, 1500");
    });

    it("deve remover complementos prediais (apto, bloco, sala) que confundem o Nominatim", () => {
      const sanitized = sanitizeAddressForGeocoding("Rua dos Tupis, 450, Apto 302, Bloco B");
      expect(sanitized).not.toContain("Apto 302");
      expect(sanitized).not.toContain("Bloco B");
      expect(sanitized).toContain("dos Tupis, 450");
    });

    it("deve anexar 'Belo Horizonte, MG, Brasil' quando município não for especificado", () => {
      const sanitized = sanitizeAddressForGeocoding("Rua Curitiba, 700");
      expect(sanitized).toContain("Belo Horizonte, MG, Brasil");
    });

    it("não deve duplicar cidade ou país se já estiverem presentes", () => {
      const sanitized = sanitizeAddressForGeocoding("Rua Rio Grande do Sul, 100, Contagem, MG");
      const occurrences = (sanitized.match(/Contagem/g) || []).length;
      expect(occurrences).toBe(1);
    });
  });

  describe("3. Motor de Roteamento Viário OSRM", () => {
    it("deve consultar a rota na API do OSRM e inverter coordenadas [lon, lat] para [lat, lon] do Leaflet", async () => {
      const mockOsrmResponse = {
        code: "Ok",
        routes: [
          {
            geometry: {
              coordinates: [
                [-43.9345, -19.9167],
                [-43.9350, -19.9170],
                [-43.9360, -19.9180],
              ],
            },
            distance: 3500, // 3.5 km
            duration: 480,  // 8 minutos (480s)
          },
        ],
      };

      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => mockOsrmResponse,
      } as any);

      const route = await fetchOsrmRoute([-43.9345, -19.9167], [-43.9360, -19.9180]);

      expect(route).toBeDefined();
      expect(route.distanceKm).toBeCloseTo(3.5, 1);
      expect(route.durationMinutes).toBe(8);
      // As coordenadas no Leaflet devem estar em [latitude, longitude]
      expect(route.geometry[0]).toEqual([-19.9167, -43.9345]);
      expect(route.geometry[1]).toEqual([-19.9170, -43.9350]);
      expect(route.geometry[2]).toEqual([-19.9180, -43.9360]);
    });

    it("deve executar fallback geodésico urbano com segurança quando OSRM estiver indisponível", async () => {
      vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("Rede indisponível"));

      const route = await fetchOsrmRoute([-43.9345, -19.9167], [-43.9400, -19.9200]);

      expect(route).toBeDefined();
      expect(route.distanceKm).toBeGreaterThan(0);
      expect(route.durationMinutes).toBeGreaterThan(0);
      expect(route.geometry).toHaveLength(2);
      expect(route.geometry[0]).toEqual([-19.9167, -43.9345]);
      expect(route.geometry[1]).toEqual([-19.9200, -43.9400]);
    });
  });

  describe("4. Geração de Marcadores Visuais Customizados (Leaflet DivIcon)", () => {
    it("deve gerar o ícone do motoboy com anel pulsante e nome legível", () => {
      const icon = createDriverLeafletIcon("Carlos Motoboy", "em_entrega");
      expect(icon).toBeDefined();
      expect(icon.options.className).toBe("custom-driver-marker");
      expect(icon.options.html).toContain("Carlos");
      expect(icon.options.html).toContain("animate-ping");
    });

    it("deve gerar o ícone do cliente com a identificação da O.S.", () => {
      const icon = createCustomerLeafletIcon("73492");
      expect(icon).toBeDefined();
      expect(icon.options.className).toBe("custom-customer-marker");
      expect(icon.options.html).toContain("O.S. 73492");
    });
  });
});
