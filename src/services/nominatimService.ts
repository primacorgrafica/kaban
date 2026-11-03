/**
 * Serviço de Geocodificação Gratuito via OpenStreetMap Nominatim API
 * Respeita a Política de Uso Oficial da OSMF:
 * - User-Agent customizado obrigatório
 * - Fila de execução com rate-limiting (mínimo de 1 req/segundo)
 * - Cache em memória para evitar requisições idênticas repetidas
 */

interface GeocodeResult {
  latitude: number;
  longitude: number;
  displayName: string;
}

const memoryCache = new Map<string, GeocodeResult | null>();
let lastRequestTime = 0;
const MIN_INTERVAL_MS = 1050; // Respeito estrito ao limite de 1 req/s do Nominatim

async function throttleQueue(): Promise<void> {
  const now = Date.now();
  const timeSinceLast = now - lastRequestTime;
  if (timeSinceLast < MIN_INTERVAL_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_INTERVAL_MS - timeSinceLast));
  }
  lastRequestTime = Date.now();
}

/**
 * Normaliza o endereço para maximizar o índice de sucesso no OpenStreetMap Brasil
 */
export function sanitizeAddressForGeocoding(address: string): string {
  if (!address) return "";

  let cleaned = address
    .replace(/^(rua|av\.|avenida|alameda|travessa|praça|rodovia)\s+/i, "")
    .replace(/,\s*(apto|apartamento|bloco|sala|andar|casa|fundos|loja|galpão)[\w\s\d.-]*/gi, "")
    .replace(/\s*-\s*(apto|apartamento|bloco|sala|andar|casa|fundos|loja|galpão)[\w\s\d.-]*/gi, "")
    .trim();

  // Se não mencionar MG ou Belo Horizonte, anexa para restringir à região metropolitana
  const lower = cleaned.toLowerCase();
  if (!lower.includes("belo horizonte") && !lower.includes("contagem") && !lower.includes("betim") && !lower.includes("mg")) {
    cleaned = `${cleaned}, Belo Horizonte, MG, Brasil`;
  } else if (!lower.includes("brasil") && !lower.includes("brazil")) {
    cleaned = `${cleaned}, Brasil`;
  }

  return cleaned;
}

/**
 * Converte um endereço de texto em coordenadas geográficas reais (Latitude e Longitude)
 */
export async function geocodeAddressWithNominatim(rawAddress: string): Promise<GeocodeResult | null> {
  const cleanAddr = sanitizeAddressForGeocoding(rawAddress);
  if (!cleanAddr) return null;

  const cacheKey = cleanAddr.toLowerCase();
  if (memoryCache.has(cacheKey)) {
    return memoryCache.get(cacheKey) || null;
  }

  try {
    await throttleQueue();

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanAddr)}&limit=1&addressdetails=1`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "PrimacorKabanLogistica/1.0 (logistica@primacorgrafica.com.br)",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      console.warn(`[Nominatim] Erro HTTP ${response.status} ao consultar endereço.`);
      memoryCache.set(cacheKey, null);
      return null;
    }

    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      const item = data[0];
      const result: GeocodeResult = {
        latitude: parseFloat(item.lat),
        longitude: parseFloat(item.lon),
        displayName: item.display_name,
      };
      memoryCache.set(cacheKey, result);
      return result;
    }

    // Fallback: Tenta sem número caso o endereço contenha vírgula
    const commaIndex = cleanAddr.indexOf(",");
    if (commaIndex > 3) {
      const fallbackQuery = cleanAddr.substring(0, commaIndex) + ", Belo Horizonte, MG, Brasil";
      await throttleQueue();
      const fbRes = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fallbackQuery)}&limit=1`,
        {
          headers: {
            "User-Agent": "PrimacorKabanLogistica/1.0 (logistica@primacorgrafica.com.br)",
            Accept: "application/json",
          },
        }
      );
      if (fbRes.ok) {
        const fbData = await fbRes.json();
        if (Array.isArray(fbData) && fbData.length > 0) {
          const item = fbData[0];
          const result: GeocodeResult = {
            latitude: parseFloat(item.lat),
            longitude: parseFloat(item.lon),
            displayName: item.display_name,
          };
          memoryCache.set(cacheKey, result);
          return result;
        }
      }
    }

    memoryCache.set(cacheKey, null);
    return null;
  } catch (error) {
    console.error("[Nominatim] Falha de rede ao geocodificar endereço:", error);
    return null;
  }
}

/**
 * Limpa o cache em memória de geocodificação
 */
export function clearNominatimCache(): void {
  memoryCache.clear();
}
