import { useState, useEffect } from "react";
import {
  subscribeRealtimeConnection,
  RealtimeConnectionState,
} from "@/lib/realtimeManager";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";

export function RealtimeStatusIndicator() {
  const [state, setState] = useState<RealtimeConnectionState>("CONNECTING");

  useEffect(() => {
    return subscribeRealtimeConnection(setState);
  }, []);

  if (state === "ONLINE") {
    return (
      <div
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 text-[11px] font-mono-tech select-none"
        title="Sincronização em tempo real ativa com o servidor"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <span className="font-semibold hidden sm:inline">REALTIME</span>
      </div>
    );
  }

  if (state === "RECONNECTING" || state === "CONNECTING") {
    return (
      <div
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-[11px] font-mono-tech select-none animate-pulse"
        title="Reconectando ao servidor em tempo real..."
      >
        <RefreshCw className="h-3 w-3 animate-spin" />
        <span className="font-semibold">RECONECTANDO</span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-[11px] font-mono-tech select-none"
      title="Sem conexão em tempo real com o servidor. Verifique a rede."
    >
      <WifiOff className="h-3 w-3" />
      <span className="font-semibold">OFFLINE</span>
    </div>
  );
}
