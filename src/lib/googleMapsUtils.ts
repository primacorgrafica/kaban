/**
 * Utilitários para tratamento de endereço e geração de links do Google Maps
 * Exclusivo para o módulo Gestão de Entregas.
 */

/**
 * Limpa prefixos, metadados (ex: "| E-mail: ...", "Endereço: ...") e normaliza espaços.
 */
export function cleanDeliveryAddress(rawAddress: string | null | undefined): string {
  if (!rawAddress) return "";
  let clean = rawAddress.trim();

  // Se contiver delimitadores como "Endereço: ... | E-mail: ..."
  if (clean.includes("|") || /Endereço:/i.test(clean) || /Endereco:/i.test(clean)) {
    const endMatch = clean.match(/(?:Endereço|Endereco):\s*(.*?)(?:\s*\|\s*(?:E-mail|Email):|$)/i);
    if (endMatch && endMatch[1]) {
      clean = endMatch[1].trim();
    } else if (clean.includes("|")) {
      const parts = clean.split("|").map((p) => p.trim());
      const nonEmailParts = parts.filter(
        (p) => !p.toLowerCase().startsWith("e-mail:") && !p.toLowerCase().startsWith("email:")
      );
      if (nonEmailParts.length > 0) {
        clean = nonEmailParts.join(", ");
      }
    }
  }

  // Remove rótulo residual no início
  clean = clean.replace(/^(?:Endereço|Endereco):\s*/i, "").trim();

  // Colapsa espaços múltiplos em um único espaço
  clean = clean.replace(/\s+/g, " ").trim();

  return clean;
}

/**
 * Valida se uma string de endereço é realmente utilizável e não apenas marcador nulo/vazio.
 */
export function isUsableDeliveryAddress(address: string | null | undefined): boolean {
  if (!address) return false;
  const trimmed = address.trim();
  if (!trimmed) return false;

  const lower = trimmed.toLowerCase();
  const invalidPlaceholders = [
    "—",
    "-",
    "--",
    "---",
    ".",
    "null",
    "undefined",
    "n/a",
    "na",
    "sem endereço",
    "sem endereco",
    "a combinar",
    "retirar",
    "balcão",
    "balcao",
  ];

  if (invalidPlaceholders.includes(lower)) {
    return false;
  }

  const cleaned = cleanDeliveryAddress(address);
  // Se após limpeza sobrou menos que 3 caracteres, não é um endereço navegável
  return cleaned.length >= 3;
}

/**
 * Gera URL de busca oficial do Google Maps:
 * https://www.google.com/maps/search/?api=1&query=ENDERECO_CODIFICADO
 */
export function buildGoogleMapsSearchUrl(address: string): string {
  const cleaned = cleanDeliveryAddress(address);
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleaned)}`;
}

/**
 * Gera URL de rota oficial do Google Maps (navegação até o destino):
 * https://www.google.com/maps/dir/?api=1&destination=ENDERECO_CODIFICADO
 */
export function buildGoogleMapsRouteUrl(address: string): string {
  const cleaned = cleanDeliveryAddress(address);
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(cleaned)}`;
}

/**
 * Copia o endereço limpo para a área de transferência com fallback para navegadores antigos.
 */
export async function copyDeliveryAddressToClipboard(address: string): Promise<boolean> {
  const cleaned = cleanDeliveryAddress(address);
  if (!cleaned) return false;

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(cleaned);
      return true;
    }
  } catch {
    // fallback
  }

  try {
    const textArea = document.createElement("textarea");
    textArea.value = cleaned;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand("copy");
    document.body.removeChild(textArea);
    return successful;
  } catch {
    return false;
  }
}
