/**
 * Motor de Cálculo de Rotas Viárias e Estimativa de Chegada (ETA) via OSRM API Pública
 * Utiliza o perfil de direção veicular ('driving') sobre as vias reais do OpenStreetMap.
 */
import type { OsrmRouteResult } from "@/types/delivery";

interface CacheEntry {
  result: OsrmRouteResult;
  timestamp: number;
}

const routeCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000; // 1 minuto de cache para mesma origem/destino aproximados

/**
 * Arredonda coordenadas para ~11 metros (4 casas decimais) para chave de cache
 */
function toCacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

/**
 * Fórmula de Haversine para cálculo de distância em linha reta (em km)
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Raio da Terra em km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Consulta a rota real de ruas via OSRM entre a posição do entregador e o cliente
 * Suporta chamada com 4 números (driverLat, driverLon, destLat, destLon)
 * ou com duas tuplas [lon, lat] (padrão GeoJSON/OSRM).
 */
export async function fetchOsrmRoute(
  arg1: number | [number, number],
  arg2: number | [number, number],
  arg3?: number,
  arg4?: number
): Promise<OsrmRouteResult | null> {
  let driverLat: number;
  let driverLon: number;
  let destLat: number;
  let destLon: number;

  if (Array.isArray(arg1) && Array.isArray(arg2)) {
    // Tuplas [lon, lat] padrão OSRM / GeoJSON
    driverLon = arg1[0];
    driverLat = arg1[1];
    destLon = arg2[0];
    destLat = arg2[1];
  } else if (
    typeof arg1 === "number" &&
    typeof arg2 === "number" &&
    typeof arg3 === "number" &&
    typeof arg4 === "number"
  ) {
    driverLat = arg1;
    driverLon = arg2;
    destLat = arg3;
    destLon = arg4;
  } else {
    console.warn("[OSRM] Coordenadas inválidas fornecidas:", { arg1, arg2, arg3, arg4 });
    return null;
  }

  const key = `${toCacheKey(driverLat, driverLon)}->${toCacheKey(destLat, destLon)}`;
  const now = Date.now();

  const cached = routeCache.get(key);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.result;
  }

  try {
    // Atenção à sintaxe do OSRM: longitude primeiro, latitude depois!
    const coordinatesQuery = `${driverLon},${driverLat};${destLon},${destLat}`;
    const url = `https://router.project-osrm.org/route/v1/driving/${coordinatesQuery}?overview=full&geometries=geojson`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[OSRM] Erro HTTP ${response.status} ao traçar rota.`);
      return fallbackDirectRoute(driverLat, driverLon, destLat, destLon);
    }

    const data = await response.json();
    if (data.code === "Ok" && Array.isArray(data.routes) && data.routes.length > 0) {
      const primaryRoute = data.routes[0];
      const rawCoords: [number, number][] = primaryRoute.geometry.coordinates; // [lon, lat]

      // Converte para padrão Leaflet [lat, lon]
      const leafletCoords: [number, number][] = rawCoords.map(([lon, lat]) => [lat, lon]);

      const distanceKm = Number((primaryRoute.distance / 1000).toFixed(1));
      const durationMinutes = Math.max(1, Math.round(primaryRoute.duration / 60));

      const result: OsrmRouteResult = {
        distanceKm,
        durationMinutes,
        geometry: leafletCoords,
      };

      routeCache.set(key, { result, timestamp: now });
      return result;
    }

    return fallbackDirectRoute(driverLat, driverLon, destLat, destLon);
  } catch (error) {
    console.warn("[OSRM] Falha ao consultar rota viária, aplicando fallback linear:", error);
    return fallbackDirectRoute(driverLat, driverLon, destLat, destLon);
  }
}

/**
 * Fallback resiliente: Caso o servidor público do OSRM esteja indisponível,
 * gera linha reta e estima tempo considerando 28 km/h de velocidade média urbana.
 */
function fallbackDirectRoute(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): OsrmRouteResult {
  const directDistance = calculateHaversineDistance(lat1, lon1, lat2, lon2);
  const roadFactor = 1.35; // Fator de sinuosidade viária típica em centros urbanos
  const estimatedRoadKm = Number((directDistance * roadFactor).toFixed(1));
  const avgSpeedKmh = 28;
  const estimatedMinutes = Math.max(2, Math.round((estimatedRoadKm / avgSpeedKmh) * 60));

  return {
    distanceKm: estimatedRoadKm,
    durationMinutes: estimatedMinutes,
    geometry: [
      [lat1, lon1],
      [lat2, lon2],
    ],
  };
}

export function clearOsrmCache(): void {
  routeCache.clear();
}
