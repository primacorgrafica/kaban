import L from "leaflet";

/**
 * Cria o ícone customizado do Entregador com pulso visual de GPS ativo
 */
export function createDriverLeafletIcon(
  driverName: string,
  status: "disponivel" | "em_entrega" | "offline" = "disponivel"
): L.DivIcon {
  const isMoving = status === "em_entrega";
  const ringColor = isMoving ? "border-emerald-400 bg-emerald-500/20" : "border-blue-400 bg-blue-500/20";
  const badgeColor = isMoving ? "bg-emerald-500" : "bg-blue-500";

  const html = `
    <div class="relative flex items-center justify-center cursor-pointer select-none group">
      <!-- Pulso animado de sinal ao vivo -->
      <div class="absolute -inset-2 rounded-full border-2 ${ringColor} ${isMoving ? "animate-ping" : ""} opacity-75"></div>
      
      <!-- Círculo principal com ícone de veículo -->
      <div class="relative w-9 h-9 rounded-full bg-slate-900 border-2 border-slate-700 shadow-xl flex items-center justify-center text-white z-10 transition-transform group-hover:scale-110">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-400">
          <circle cx="18.5" cy="17.5" r="3.5"/>
          <circle cx="5.5" cy="17.5" r="3.5"/>
          <circle cx="15" cy="5" r="1"/>
          <path d="M12 17.5V14l-3-3 4-3 2 3h2"/>
        </svg>
        <span class="absolute -top-1 -right-1 w-3 h-3 ${badgeColor} border-2 border-slate-900 rounded-full"></span>
      </div>

      <!-- Etiqueta com o nome do entregador -->
      <div class="absolute top-10 whitespace-nowrap px-2 py-0.5 rounded bg-slate-900/95 border border-slate-700/80 text-[11px] font-semibold text-slate-100 shadow-lg pointer-events-none z-20">
        ${driverName.split(" ")[0]}
      </div>
    </div>
  `;

  return L.divIcon({
    html,
    className: "custom-driver-marker",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -20],
  });
}

/**
 * Cria o ícone customizado do Cliente Final (Destino da Entrega)
 */
export function createCustomerLeafletIcon(osNumber: string): L.DivIcon {
  const html = `
    <div class="relative flex flex-col items-center justify-center cursor-pointer select-none group">
      <!-- Pino marcador em gota -->
      <div class="w-8 h-8 rounded-full rounded-br-none -rotate-45 bg-rose-600 border-2 border-white shadow-xl flex items-center justify-center text-white transition-transform group-hover:scale-110">
        <span class="rotate-45 text-[10px] font-extrabold tracking-tighter">
          ${osNumber.replace(/\D/g, "").slice(-4)}
        </span>
      </div>

      <!-- Etiqueta de identificação -->
      <div class="mt-1 whitespace-nowrap px-2 py-0.5 rounded bg-rose-950/90 border border-rose-500/50 text-[10px] font-bold text-rose-200 shadow-lg pointer-events-none">
        O.S. ${osNumber}
      </div>
    </div>
  `;

  return L.divIcon({
    html,
    className: "custom-customer-marker",
    iconSize: [32, 44],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
}
