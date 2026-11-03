import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { calculateHaversineDistance } from "@/services/osrmService";

export type GpsConnectionStatus =
  | "conectado"
  | "buscando"
  | "sem_permissao"
  | "indisponivel"
  | "offline";

interface UseRealGpsTrackerProps {
  driverId?: string | null;
  enabled?: boolean;
  orderId?: string | null;
  onPositionUpdate?: (coords: { lat: number; lng: number; speed: number | null }) => void;
}

export function useRealGpsTracker({
  driverId,
  enabled = true,
  orderId,
  onPositionUpdate,
}: UseRealGpsTrackerProps) {
  const [status, setStatus] = useState<GpsConnectionStatus>("buscando");
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [speedKmh, setSpeedKmh] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [wakeLockActive, setWakeLockActive] = useState(false);

  const lastSentCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastSentTimeRef = useRef<number>(0);
  const wakeLockRef = useRef<any>(null);
  const watchIdRef = useRef<number | null>(null);

  // 1. Screen Wake Lock API (tentativa para evitar desligamento de tela enquanto o app está aberto)
  const requestWakeLock = useCallback(async () => {
    if (typeof navigator !== "undefined" && "wakeLock" in navigator && !wakeLockRef.current) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
        setWakeLockActive(true);
        wakeLockRef.current.addEventListener("release", () => {
          wakeLockRef.current = null;
          setWakeLockActive(false);
        });
      } catch (err) {
        console.warn("[WakeLock] Não foi possível ativar bloqueio de tela:", err);
        setWakeLockActive(false);
      }
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) {
      void wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
      setWakeLockActive(false);
    }
  }, []);

  // 2. Transmissão segura para o Supabase (entregadores e histórico entregador_posicoes)
  const pushLocationToDatabase = useCallback(
    async (lat: number, lng: number, acc: number, speed: number | null) => {
      if (!driverId) return;

      const nowIso = new Date().toISOString();

      try {
        // Obtém nível da bateria se disponível na Battery API
        let bateriaPct: number | null = null;
        if (typeof navigator !== "undefined" && "getBattery" in navigator) {
          try {
            const battery: any = await (navigator as any).getBattery();
            bateriaPct = Math.round(battery.level * 100);
          } catch {
            // Silencioso
          }
        }

        // Atualiza a posição atual em public.entregadores
        await supabase
          .from("entregadores" as any)
          .update({
            latitude: lat,
            longitude: lng,
            precisao_metros: acc,
            velocidade_kmh: speed,
            bateria_percentual: bateriaPct,
            ultima_atividade: nowIso,
            status: orderId ? "em_entrega" : "disponivel",
          } as any)
          .eq("user_id", driverId);

        // Grava no histórico pontual de checkpoints
        await supabase
          .from("entregador_posicoes" as any)
          .insert({
            entregador_id: driverId,
            order_id: orderId || null,
            latitude: lat,
            longitude: lng,
            precisao_metros: acc,
            velocidade_kmh: speed,
            bateria_percentual: bateriaPct,
            created_at: nowIso,
          } as any);
      } catch (err) {
        console.warn("[GPS] Erro ao sincronizar coordenadas com o banco:", err);
      }
    },
    [driverId, orderId]
  );

  // 3. Processamento de nova coordenada recebida pelo sensor do celular
  const handlePositionSuccess = useCallback(
    (pos: GeolocationPosition) => {
      const { latitude, longitude, accuracy: acc, speed: rawSpeed } = pos.coords;
      const speedCalculated = rawSpeed !== null && rawSpeed !== undefined ? rawSpeed * 3.6 : null;

      setCoords({ latitude, longitude });
      setAccuracy(Math.round(acc));
      setSpeedKmh(speedCalculated !== null ? Math.round(speedCalculated) : null);
      setLastUpdated(new Date());
      setStatus("conectado");

      onPositionUpdate?.({
        lat: latitude,
        lng: longitude,
        speed: speedCalculated,
      });

      const now = Date.now();
      const elapsedMs = now - lastSentTimeRef.current;

      // Throttle obrigatório: Mínimo de 5 segundos entre transmissões
      if (elapsedMs < 5000) return;

      // Filtro de distância mínima (Haversine):
      // Dispara se deslocou >= 10 metros OU se passaram 30 segundos (heartbeat parado)
      let shouldSend = false;
      if (!lastSentCoordsRef.current) {
        shouldSend = true;
      } else {
        const distanceKm = calculateHaversineDistance(
          lastSentCoordsRef.current.lat,
          lastSentCoordsRef.current.lng,
          latitude,
          longitude
        );
        const distanceMeters = distanceKm * 1000;
        if (distanceMeters >= 10 || elapsedMs >= 30000) {
          shouldSend = true;
        }
      }

      if (shouldSend) {
        lastSentCoordsRef.current = { lat: latitude, lng: longitude };
        lastSentTimeRef.current = now;
        void pushLocationToDatabase(latitude, longitude, acc, speedCalculated);
      }
    },
    [onPositionUpdate, pushLocationToDatabase]
  );

  const handlePositionError = useCallback((err: GeolocationPositionError) => {
    switch (err.code) {
      case err.PERMISSION_DENIED:
        setStatus("sem_permissao");
        break;
      case err.POSITION_UNAVAILABLE:
        setStatus("indisponivel");
        break;
      case err.TIMEOUT:
        // Mantém buscando sem abortar a sessão
        setStatus("buscando");
        break;
      default:
        setStatus("indisponivel");
    }
  }, []);

  // 4. Inicialização do watchPosition e listeners de visibilidade
  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("indisponivel");
      return;
    }

    if (!navigator.onLine) {
      setStatus("offline");
    }

    const handleOnline = () => setStatus("buscando");
    const handleOffline = () => setStatus("offline");
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Liga o bloqueio de tela quando ativo
    void requestWakeLock();

    // Reativa Wake Lock ao retornar para primeiro plano
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Inicia rastreamento contínuo
    const options: PositionOptions = {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 10000,
    };

    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePositionSuccess,
      handlePositionError,
      options
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      releaseWakeLock();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, handlePositionSuccess, handlePositionError, requestWakeLock, releaseWakeLock]);

  return {
    status,
    coords,
    accuracy,
    speedKmh,
    lastUpdated,
    wakeLockActive,
  };
}
