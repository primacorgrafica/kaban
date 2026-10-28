import React, { useState } from "react";
import { MapPin, Navigation, Copy, Check, MoreVertical, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  cleanDeliveryAddress,
  isUsableDeliveryAddress,
  buildGoogleMapsSearchUrl,
  buildGoogleMapsRouteUrl,
  copyDeliveryAddressToClipboard,
} from "@/lib/googleMapsUtils";
import { cn } from "@/lib/utils";

interface DeliveryAddressCellProps {
  address?: string | null;
  fallbackAddress?: string | null;
  className?: string;
}

export function DeliveryAddressCell({
  address,
  fallbackAddress,
  className,
}: DeliveryAddressCellProps) {
  const [copied, setCopied] = useState(false);

  const rawAddress = address || fallbackAddress || "";

  if (!isUsableDeliveryAddress(rawAddress)) {
    return <span className={cn("text-muted-foreground text-xs", className)}>—</span>;
  }

  const cleanAddress = cleanDeliveryAddress(rawAddress);
  const searchUrl = buildGoogleMapsSearchUrl(cleanAddress);
  const routeUrl = buildGoogleMapsRouteUrl(cleanAddress);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const success = await copyDeliveryAddressToClipboard(cleanAddress);
    if (success) {
      setCopied(true);
      toast.success("Endereço copiado para a área de transferência!");
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("Não foi possível copiar o endereço.");
    }
  };

  return (
    <div className={cn("flex items-center justify-between gap-1 w-full max-w-full group/cell", className)}>
      {/* Endereço clicável com ícone discreto de localização */}
      <a
        href={searchUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={`Ver "${cleanAddress}" no Google Maps`}
        aria-label={`Ver endereço ${cleanAddress} no Google Maps (abre em nova aba)`}
        className="inline-flex items-center gap-1.5 min-w-0 max-w-[calc(100%-52px)] text-xs text-foreground hover:text-blue-500 dark:hover:text-blue-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded px-0.5 transition-colors group cursor-pointer"
      >
        <MapPin
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-blue-500 transition-colors"
          aria-hidden="true"
        />
        <span className="truncate group-hover:underline underline-offset-2">{cleanAddress}</span>
      </a>

      {/* Ações disponíveis: Botão de Cópia rápida e Menu contextual */}
      <div className="flex items-center gap-0.5 shrink-0">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleCopy}
          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded transition-colors"
          title="Copiar endereço completo"
          aria-label="Copiar endereço completo"
        >
          {copied ? (
            <Check className="h-3 w-3 text-emerald-500" aria-hidden="true" />
          ) : (
            <Copy className="h-3 w-3" aria-hidden="true" />
          )}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded transition-colors"
              title="Ações de mapa e rota"
              aria-label="Ações de mapa e rota"
            >
              <MoreVertical className="h-3 w-3" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 text-xs p-1">
            <DropdownMenuItem asChild>
              <a
                href={searchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded-sm hover:bg-accent"
              >
                <MapPin className="h-3.5 w-3.5 text-blue-500" aria-hidden="true" />
                <span className="flex-1 font-medium">Ver no Mapa</span>
                <ExternalLink className="h-3 w-3 opacity-50" aria-hidden="true" />
              </a>
            </DropdownMenuItem>

            <DropdownMenuItem asChild>
              <a
                href={routeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded-sm hover:bg-accent"
              >
                <Navigation className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                <span className="flex-1 font-medium">Traçar Rota</span>
                <ExternalLink className="h-3 w-3 opacity-50" aria-hidden="true" />
              </a>
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={handleCopy}
              className="flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded-sm hover:bg-accent"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              )}
              <span className="font-medium">Copiar Endereço</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
