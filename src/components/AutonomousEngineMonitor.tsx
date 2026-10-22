import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { startAutonomousClientBeacon } from "@/lib/autonomousEngine/telemetry";

/**
 * Componente sentinela do Kaban Autonomous Engine.
 * Inicia o beacon de telemetria e integridade operacional para usuários autenticados.
 */
export function AutonomousEngineMonitor() {
  const { session } = useAuth();

  useEffect(() => {
    if (!session) return;

    // Inicia o beacon periódico a cada 60 segundos
    const stopBeacon = startAutonomousClientBeacon(60000);
    return () => {
      stopBeacon();
    };
  }, [session]);

  return null;
}
