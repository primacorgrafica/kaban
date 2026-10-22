/**
 * Kaban Security Guardian - Input Sanitizer & XSS Defense
 * Protege contra Cross-Site Scripting (XSS), injeção de HTML e links maliciosos.
 */

// Regex para detectar tags HTML perigosas
const DANGEROUS_TAGS_PATTERN = /<\s*\/?\s*(script|iframe|object|embed|applet|meta|link|style|base|form|svg\s+[^>]*on\w+|img\s+[^>]*on\w+)[^>]*>/gi;

// Regex para detectar manipuladores de eventos embutidos (ex: onclick=, onerror=)
const INLINE_EVENT_HANDLERS = /\s+(on\w+)\s*=\s*(['"][^'"]*['"]|[^\s>]+)/gi;

// Protocolos permitidos para links externos e navegação
const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

/**
 * Higieniza strings de entrada removendo tags maliciosas e handlers de evento.
 */
export function sanitizeInput(input: string | null | undefined): string {
  if (!input || typeof input !== "string") return "";

  let cleaned = input;

  // 1. Remove tags HTML de alto risco
  cleaned = cleaned.replace(DANGEROUS_TAGS_PATTERN, "");

  // 2. Remove manipuladores de evento inline perigosos
  cleaned = cleaned.replace(INLINE_EVENT_HANDLERS, "");

  // 3. Remove caracteres nulos que podem ser usados para contornar filtros
  cleaned = cleaned.replace(/\0/g, "");

  return cleaned.trim();
}

/**
 * Valida e higieniza URLs para prevenir pseudo-protocolos perigosos como `javascript:` ou `data:`.
 */
export function sanitizeUrl(url: string | null | undefined): string {
  if (!url || typeof url !== "string") return "";

  const trimmed = url.trim();

  // Links relativos legítimos da própria aplicação
  if (trimmed.startsWith("/") || trimmed.startsWith("#")) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (ALLOWED_PROTOCOLS.has(parsed.protocol.toLowerCase())) {
      return trimmed;
    }
  } catch {
    // Se não for uma URL absoluta válida com protocolo permitido, descarta
  }

  return "#";
}

/**
 * Higieniza nomes de arquivo para prevenir Path Traversal (ex: `../../secret.txt`).
 */
export function sanitizeFilename(filename: string | null | undefined): string {
  if (!filename || typeof filename !== "string") return "arquivo_sem_nome";

  // Extrai estritamente o nome do arquivo descartando qualquer caminho de diretório
  const segments = filename.split(/[/\\]/).filter(Boolean);
  const basename = segments.pop() || filename;

  return (
    basename
      .replace(/[/\\?%*:|"<>]/g, "_") // Remove caracteres proibidos no Windows e Unix
      .replace(/^\.+/, "")            // Remove pontos iniciais
      .trim() || "arquivo_sem_nome"
  );
}
