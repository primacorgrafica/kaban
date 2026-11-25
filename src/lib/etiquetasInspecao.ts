/**
 * Utilitários puros para geração e validação de etiquetas de embalagem da Inspeção.
 * Suporta modo Manual (etiqueta única) e modo Sequencial (De ... Até).
 * Papel térmico 80mm de largura (padrão Zebra ZD230).
 */

import { Order } from "@/types/order";
import { cleanOsNumber } from "@/components/ProductionCard";
import { supabase } from "@/integrations/supabase/client";

export const DEFAULT_ALTURA_ETIQUETA_MM = 50;
export const MAX_OBS_CHARS = 120;
export const MAX_SEQUENCIAL_ETIQUETAS = 999;
export const CONFIRM_THRESHOLD_ETIQUETAS = 100;

export interface EtiquetaInspecaoItem {
  cliente: string;
  servico: string;
  quantidade: string;
  osNumero: string;
  data?: string;
  observacao?: string;
  numeroPacote: string; // Ex: "01", "7", "12A", "200", ou "" (vazio para manual)
  linhaPacoteHtml: string; // Ex: "Pacote <u>01</u>" ou "Pacote <u>______</u>"
}

/**
 * Escapa caracteres especiais para prevenir injeção de HTML/scripts.
 */
export function escapeHtml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Formata o número sequencial garantindo no mínimo 2 dígitos e
 * alinhando à quantidade de dígitos do maior número da sequência quando passar de 2.
 * Ex: 1 até 99 => "01" ... "99"
 *     1 até 100 => "001" ... "100"
 */
export function formatNumeroSequencial(num: number, maxNum: number): string {
  const padLength = Math.max(2, String(maxNum).length);
  return String(num).padStart(padLength, "0");
}

export interface ValidationSequenciaResult {
  isValid: boolean;
  errorMessage?: string;
  de?: number;
  ate?: number;
  total?: number;
  padLength?: number;
}

/**
 * Valida os campos "De" e "Até" do modo sequencial.
 * Regras:
 * - Ambos inteiros
 * - De >= 1
 * - Até >= De
 * - Total de etiquetas (Até - De + 1) <= 999
 * - Rejeita vazios, 0, negativos, decimais, não-números.
 */
export function validateSequenciaPacotes(
  deInput: string | number | undefined | null,
  ateInput: string | number | undefined | null
): ValidationSequenciaResult {
  if (deInput === undefined || deInput === null || String(deInput).trim() === "") {
    return { isValid: false, errorMessage: "Informe o número inicial (De)." };
  }

  if (ateInput === undefined || ateInput === null || String(ateInput).trim() === "") {
    return { isValid: false, errorMessage: "Informe o número final (Até)." };
  }

  const strDe = String(deInput).trim().replace(",", ".");
  const strAte = String(ateInput).trim().replace(",", ".");

  // Rejeita decimais
  if (strDe.includes(".") || strAte.includes(".")) {
    return { isValid: false, errorMessage: "Os números dos pacotes devem ser inteiros, sem casas decimais." };
  }

  const numDe = Number(strDe);
  const numAte = Number(strAte);

  if (isNaN(numDe) || isNaN(numAte)) {
    return { isValid: false, errorMessage: "Informe apenas números válidos." };
  }

  if (!Number.isInteger(numDe) || !Number.isInteger(numAte)) {
    return { isValid: false, errorMessage: "Os números dos pacotes devem ser números inteiros." };
  }

  if (numDe < 1) {
    return { isValid: false, errorMessage: "O número inicial (De) deve ser no mínimo 1." };
  }

  if (numAte < numDe) {
    return { isValid: false, errorMessage: "O número final (Até) deve ser maior ou igual ao inicial (De)." };
  }

  const total = numAte - numDe + 1;
  if (total > MAX_SEQUENCIAL_ETIQUETAS) {
    return {
      isValid: false,
      errorMessage: `O total de etiquetas não pode exceder ${MAX_SEQUENCIAL_ETIQUETAS} por impressão (atualmente: ${total}).`,
    };
  }

  const padLength = Math.max(2, String(numAte).length);

  return {
    isValid: true,
    de: numDe,
    ate: numAte,
    total,
    padLength,
  };
}

/**
 * Gera a lista de strings formatadas da sequência de pacotes.
 */
export function generateSequenciaNumeros(de: number, ate: number): string[] {
  if (de < 1 || ate < de) return [];
  const total = ate - de + 1;
  if (total > MAX_SEQUENCIAL_ETIQUETAS) return [];

  const result: string[] = [];
  for (let i = de; i <= ate; i++) {
    result.push(formatNumeroSequencial(i, ate));
  }
  return result;
}

/**
 * Monta a linha do pacote para o modo manual.
 * Se o número estiver vazio, gera o traço sublinhado em branco: "Pacote <u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u>".
 * Se preenchido, mantém exatamente como digitado (máx 6 caracteres), sublinhado.
 * NUNCA contém "de" nem total.
 */
export function formatLinhaPacoteManual(numeroPacote?: string): string {
  const trimmed = (numeroPacote || "").trim();
  if (!trimmed) {
    return 'Pacote <u class="espaco-em-branco">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u>';
  }
  return `Pacote <u>${escapeHtml(trimmed)}</u>`;
}

/**
 * Monta a linha do pacote para o modo sequencial.
 * NUNCA contém "de" nem total.
 */
export function formatLinhaPacoteSequencial(numeroFormatado: string): string {
  return `Pacote <u>${escapeHtml(numeroFormatado)}</u>`;
}

/**
 * Extrai e pré-preenche os dados iniciais a partir do objeto Order do card.
 */
export function parseOrderInspecaoInitialFields(order: Order): {
  cliente: string;
  servico: string;
  quantidade: string;
  osNumero: string;
  data: string;
} {
  const cliente = (order.cliente || "").trim();
  const servico = (order.descricao || "").trim();

  // Tenta extrair a quantidade da ordem ou do texto da descrição
  let quantidade = "";
  const rawOrder = order as unknown as Record<string, unknown>;
  if (rawOrder.quantidade) {
    quantidade = String(rawOrder.quantidade).trim();
  } else if (order.descricao) {
    const match = order.descricao.match(/^([\d.,]+(?:\s*(?:un|unid|unidades|fls|folhas|pcs|peças|milheiros|bl|blocos))?)/i);
    if (match && match[1]) {
      quantidade = match[1].trim();
    }
  }

  // Número da O.S.
  let osNumero = "";
  if (order.numero) {
    osNumero = String(order.numero).trim();
  } else if (order.titulo) {
    const cleaned = cleanOsNumber(order.titulo);
    osNumero = cleaned || order.titulo.replace(/^#+/, "").trim();
  }

  // Data atual no formato DD/MM/AAAA
  const today = new Date();
  const dia = String(today.getDate()).padStart(2, "0");
  const mes = String(today.getMonth() + 1).padStart(2, "0");
  const ano = today.getFullYear();
  const data = `${dia}/${mes}/${ano}`;

  return {
    cliente,
    servico,
    quantidade,
    osNumero,
    data,
  };
}

const SVG_FILE_CHECK = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
  <polyline points="14 2 14 8 20 8"/>
  <line x1="8" y1="12" x2="12" y2="12"/>
  <line x1="8" y1="8" x2="11" y2="8"/>
  <circle cx="16" cy="16" r="4.5" fill="#000" stroke="none"/>
  <path d="M14.2 16l1.2 1.2 2.6-2.6" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const SVG_PACKAGE = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
  <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
  <line x1="12" y1="22.08" x2="12" y2="12"/>
</svg>`;

const SVG_CALENDAR = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
  <line x1="16" y1="2" x2="16" y2="6"/>
  <line x1="8" y1="2" x2="8" y2="6"/>
  <line x1="3" y1="10" x2="21" y2="10"/>
  <circle cx="7.5" cy="14" r="1.1" fill="#000"/>
  <circle cx="12" cy="14" r="1.1" fill="#000"/>
  <circle cx="16.5" cy="14" r="1.1" fill="#000"/>
  <circle cx="7.5" cy="18" r="1.1" fill="#000"/>
  <circle cx="12" cy="18" r="1.1" fill="#000"/>
  <circle cx="16.5" cy="18" r="1.1" fill="#000"/>
</svg>`;

const SVG_FILE_TEXT = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
  <polyline points="14 2 14 8 20 8"/>
  <line x1="8" y1="13" x2="16" y2="13"/>
  <line x1="8" y1="17" x2="14" y2="17"/>
  <line x1="8" y1="9" x2="10" y2="9"/>
</svg>`;

/**
 * Gera o documento HTML completo para impressão na Zebra ZD230 (80mm x [ALTURA_MM]mm).
 * - Layout em moldura arredondada de alto contraste profissional.
 * - Cabeçalho: Ícone de documento com visto, linha divisória, Cliente + Serviço e Badge O.S.
 * - Linhas com ícones alinhados: Quantidade em destaque, Data e Observações.
 * - Banner inferior sólido preto com asas e número do pacote em destaque.
 * - page-break-after: always em todas exceto a última (page-break-after: auto).
 */
export function generateEtiquetasInspecaoPrintHtml(
  etiquetas: EtiquetaInspecaoItem[],
  alturaMm: number = DEFAULT_ALTURA_ETIQUETA_MM
): string {
  const altura = alturaMm > 0 ? alturaMm : DEFAULT_ALTURA_ETIQUETA_MM;

  const logoUrl =
    typeof window !== "undefined" && window.location?.origin
      ? `${window.location.origin}/logo-etiqueta-primacor.png`
      : "/logo-etiqueta-primacor.png";

  const labelsHtml = etiquetas
    .map((item, index) => {
      const isLast = index === etiquetas.length - 1;
      const pacoteText = item.numeroPacote
        ? escapeHtml(item.numeroPacote)
        : "____ / ____";

      return `
      <div class="etiqueta-page ${isLast ? "etiqueta-last" : ""}">
        <div class="etiqueta-card">
          <div class="etiqueta-top">
            <div class="os-row">
              <span class="os-label">OS:</span>
              <span class="os-box">${escapeHtml(item.osNumero || "—")}</span>
            </div>
            <div class="info-line">
              <span class="lbl">CLIENTE:</span>
              <span class="val">${escapeHtml(item.cliente || "—")}</span>
            </div>
            <div class="info-line desc-line">
              <span class="lbl">DESCRIÇÃO:</span>
              <span class="val">${escapeHtml(item.servico || "—")}</span>
            </div>
          </div>

          <div class="etiqueta-bottom">
            <div class="bottom-left">
              <div class="info-line">
                <span class="lbl">QUANT:</span>
                <span class="val">${escapeHtml(item.quantidade || "—")}</span>
              </div>
              <div class="info-line">
                <span class="lbl">PACOTE:</span>
                <span class="val">${pacoteText}</span>
              </div>
              <div class="footer-address">
                <div>Av. Coronel Jose Dias Bicalho, 33 - Sao Jose - BH / MG</div>
                <div>Tel: (31) 3319-0910 - primacor@primacorgrafica.com.br</div>
              </div>
            </div>
            <div class="bottom-right">
              <img src="${logoUrl}" alt="Primacor Gráfica" class="primacor-logo" />
            </div>
          </div>
        </div>
      </div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Impressão de Etiquetas - Inspeção Primacor</title>
  <style>
    @page {
      size: 80mm ${altura}mm;
      margin: 0;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html, body {
      width: 80mm;
      margin: 0;
      padding: 0;
      background: #fff;
      color: #000;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .etiqueta-page {
      width: 80mm;
      height: ${altura}mm;
      max-height: ${altura}mm;
      padding: 1.5mm 1.5mm;
      box-sizing: border-box;
      page-break-after: always;
      break-after: page;
      display: flex;
      flex-direction: column;
      justify-content: center;
      background: #fff;
      overflow: hidden;
    }
    .etiqueta-page.etiqueta-last,
    .etiqueta-page:last-child {
      page-break-after: auto !important;
      break-after: auto !important;
    }
    .etiqueta-card {
      width: 100%;
      height: 100%;
      border: 3px solid #000;
      border-radius: 9px;
      padding: 2mm 2.8mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      box-sizing: border-box;
      background: #fff;
    }
    /* CABEÇALHO */
    .etiqueta-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 2.5px solid #000;
      padding-bottom: 1.5mm;
      gap: 2mm;
      box-sizing: border-box;
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 2mm;
      min-width: 0;
      flex: 1;
    }
    .header-vbar {
      width: 2.5px;
      height: 26px;
      background: #000;
      flex-shrink: 0;
    }
    .header-titles {
      min-width: 0;
      flex: 1;
    }
    .cliente-nome {
      font-size: 11pt;
      font-weight: 900;
      line-height: 1.1;
      text-transform: uppercase;
      color: #000;
      word-break: break-word;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    .servico-nome {
      font-size: 8.5pt;
      font-weight: 600;
      line-height: 1.15;
      color: #000;
      margin-top: 0.5mm;
      word-break: break-word;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    .header-os-box {
      border: 2.5px solid #000;
      border-radius: 7px;
      padding: 1mm 2.5mm;
      text-align: center;
      flex-shrink: 0;
      min-width: 22mm;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .os-label {
      font-size: 8pt;
      font-weight: 900;
      line-height: 1;
      letter-spacing: 0.5px;
    }
    .os-num {
      font-size: 13.5pt;
      font-weight: 900;
      line-height: 1;
      margin-top: 0.5mm;
      letter-spacing: -0.3px;
    }
    /* CORPO */
    .etiqueta-body {
      display: flex;
      flex-direction: column;
      gap: 1mm;
      flex: 1;
      justify-content: space-around;
      padding: 1mm 0;
      box-sizing: border-box;
    }
    .info-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 2mm;
    }
    .row-left {
      display: flex;
      align-items: center;
      gap: 1.5mm;
      flex-shrink: 0;
    }
    .row-vbar {
      width: 2.5px;
      height: 15px;
      background: #000;
      flex-shrink: 0;
      margin: 0 1mm;
    }
    .row-label {
      font-size: 9.5pt;
      font-weight: 800;
      color: #000;
    }
    .row-value {
      font-size: 11pt;
      font-weight: 900;
      text-align: right;
      flex: 1;
      color: #000;
      word-break: break-word;
    }
    .val-qtd {
      font-size: 14pt;
      font-weight: 900;
      line-height: 1;
    }
    .val-data {
      font-size: 11pt;
      font-weight: 800;
      line-height: 1;
    }
    .val-obs {
      font-size: 9.5pt;
      font-weight: 700;
      line-height: 1.15;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .obs-linha-manual {
      display: inline-block;
      width: 100%;
      border-bottom: 1.5px dotted #333;
      height: 4mm;
    }
    /* BANNER DO PACOTE */
    .banner-pacote {
      background: #000;
      color: #fff;
      border-radius: 7px;
      padding: 1.8mm 3mm;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 3mm;
      box-sizing: border-box;
      width: 100%;
    }
    .linha-asa {
      flex: 1;
      height: 2.5px;
      background: #fff;
      border-radius: 1px;
    }
    .texto-pacote {
      font-size: 15pt;
      font-weight: 900;
      letter-spacing: 0.5px;
      white-space: nowrap;
      line-height: 1;
      color: #fff;
    }
    .texto-pacote u {
      text-decoration: underline;
      text-underline-offset: 3px;
      text-decoration-thickness: 2px;
    }
    .texto-pacote u.espaco-em-branco {
      display: inline-block;
      min-width: 18mm;
      text-align: center;
    }
  </style>
</head>
<body>
  ${labelsHtml}
</body>
</html>`;
}

/**
 * Dispara a impressão das etiquetas utilizando um iframe oculto.
 * Remove o iframe após o disparo para evitar vazamento de memória.
 */
export function printEtiquetasInspecaoViaIframe(htmlContent: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    try {
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.style.visibility = "hidden";
      iframe.setAttribute("aria-hidden", "true");
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentWindow?.document;
      if (!iframeDoc || !iframe.contentWindow) {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
        reject(new Error("Não foi possível acessar a janela de impressão do navegador."));
        return;
      }

      iframeDoc.open();
      iframeDoc.write(htmlContent);
      iframeDoc.close();

      const executePrint = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          }, 2000);
          resolve(true);
        } catch (err) {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
          reject(err);
        }
      };

      if (iframe.contentWindow.document.readyState === "complete") {
        setTimeout(executePrint, 250);
      } else {
        iframe.onload = () => setTimeout(executePrint, 250);
      }
    } catch (err) {
      reject(err);
    }
  });
}

export interface EtiquetaPrintHistoryEntry {
  id: string;
  orderId: string;
  descricao: string;
  detalhes: {
    modo: "manual" | "sequencial";
    numeroPacote?: string;
    de?: number;
    ate?: number;
    total: number;
    cliente: string;
    osNumero: string;
    quantidade: string;
  };
  usuario: string;
  dataHora: string;
  createdAt: string;
}

/**
 * Retorna o histórico de impressões concluídas armazenado para a O.S.
 */
export function getLocalPrintHistory(orderId: string): EtiquetaPrintHistoryEntry[] {
  if (typeof window === "undefined" || !orderId) return [];
  try {
    const raw = localStorage.getItem(`primacor_etiquetas_history_${orderId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Salva um novo registro no histórico de impressões concluídas (localStorage) e dispara evento customizado.
 */
export function saveLocalPrintHistory(entry: EtiquetaPrintHistoryEntry): void {
  if (typeof window === "undefined" || !entry.orderId) return;
  try {
    const existing = getLocalPrintHistory(entry.orderId);
    const updated = [entry, ...existing.filter((x) => x.id !== entry.id)].slice(0, 50);
    localStorage.setItem(`primacor_etiquetas_history_${entry.orderId}`, JSON.stringify(updated));
    window.dispatchEvent(
      new CustomEvent("inspecao-print-completed", {
        detail: { orderId: entry.orderId, entry },
      })
    );
  } catch (err) {
    console.warn("Falha ao salvar histórico local de impressão:", err);
  }
}

/**
 * Registra a impressão concluída na tabela de auditoria e rastreabilidade da Inspeção (Supabase).
 */
export async function recordPrintHistoryInSupabase(
  entry: EtiquetaPrintHistoryEntry,
  userId?: string | null
): Promise<void> {
  try {
    const db = supabase as unknown as {
      from: (table: string) => {
        insert: (data: Record<string, unknown>) => Promise<unknown>;
      };
    };
    await db.from("order_inspecao_history").insert({
      order_id: entry.orderId,
      tipo_evento: "checklist_item",
      descricao: `Impressão de Etiqueta: ${entry.descricao}`,
      detalhes: {
        item: "rotulagem",
        acao: "impressao_etiqueta",
        ...entry.detalhes,
      },
      usuario_id: userId || null,
      usuario_nome: entry.usuario,
    });
  } catch (err) {
    console.warn("Falha ao sincronizar histórico de impressão no Supabase:", err);
  }
}
