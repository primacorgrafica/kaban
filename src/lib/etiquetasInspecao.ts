/**
 * Utilitários puros para geração e validação de etiquetas de embalagem da Inspeção.
 * Suporta modo Manual (etiqueta única) e modo Sequencial (De ... Até).
 * Papel térmico 80mm de largura (padrão Zebra ZD230).
 */

import { Order } from "@/types/order";
import { cleanOsNumber } from "@/components/ProductionCard";

export const DEFAULT_ALTURA_ETIQUETA_MM = 50;
export const MAX_OBS_CHARS = 120;
export const MAX_SEQUENCIAL_ETIQUETAS = 999;
export const CONFIRM_THRESHOLD_ETIQUETAS = 100;

export interface EtiquetaInspecaoItem {
  cliente: string;
  servico: string;
  quantidade: string;
  osNumero: string;
  observacao?: string;
  numeroPacote: string; // Ex: "01", "7", "12A", ou "" (vazio para manual)
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

  return {
    cliente,
    servico,
    quantidade,
    osNumero,
  };
}

/**
 * Gera o documento HTML completo para impressão na Zebra ZD230 (80mm x [ALTURA_MM]mm).
 * - page-break-after: always em todas exceto a última (page-break-after: auto).
 * - CSS sem margens extras para não gerar páginas em branco.
 */
export function generateEtiquetasInspecaoPrintHtml(
  etiquetas: EtiquetaInspecaoItem[],
  alturaMm: number = DEFAULT_ALTURA_ETIQUETA_MM
): string {
  const altura = alturaMm > 0 ? alturaMm : DEFAULT_ALTURA_ETIQUETA_MM;

  const labelsHtml = etiquetas
    .map((item, index) => {
      const isLast = index === etiquetas.length - 1;
      const obsText = (item.observacao || "").trim();
      const obsContent = obsText
        ? escapeHtml(obsText)
        : '<span class="obs-vazia">&nbsp;</span>';

      return `
      <div class="etiqueta-page ${isLast ? "etiqueta-last" : ""}">
        <div class="etiqueta-inner">
          <div class="campo-linha">
            <span class="label">Cliente:</span>
            <span class="valor valor-destaque">${escapeHtml(item.cliente)}</span>
          </div>

          <div class="campo-linha">
            <span class="label">Serviço:</span>
            <span class="valor">${escapeHtml(item.servico)}</span>
          </div>

          <div class="campo-duplo">
            <div class="campo-bloco">
              <span class="label">Quantidade:</span>
              <span class="valor">${escapeHtml(item.quantidade)}</span>
            </div>
            <div class="campo-bloco alinha-direita">
              <span class="label">O.S.:</span>
              <span class="valor valor-os">${escapeHtml(item.osNumero)}</span>
            </div>
          </div>

          <div class="campo-linha campo-obs">
            <span class="label">Obs.:</span>
            <span class="valor valor-obs">${obsContent}</span>
          </div>

          <div class="linha-pacote">
            ${item.linhaPacoteHtml}
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
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, Helvetica, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .etiqueta-page {
      width: 80mm;
      height: ${altura}mm;
      max-height: ${altura}mm;
      overflow: hidden;
      page-break-after: always;
      break-after: page;
      display: flex;
      flex-direction: column;
      justify-content: center;
      background: #fff;
    }
    .etiqueta-page.etiqueta-last,
    .etiqueta-page:last-child {
      page-break-after: auto !important;
      break-after: auto !important;
    }
    .etiqueta-inner {
      padding: 3mm 3.5mm;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      box-sizing: border-box;
    }
    .campo-linha {
      font-size: 9.5pt;
      line-height: 1.25;
      margin-bottom: 1.5mm;
      word-break: break-word;
      overflow-wrap: break-word;
    }
    .campo-duplo {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      font-size: 9.5pt;
      line-height: 1.25;
      margin-bottom: 1.5mm;
      gap: 2mm;
    }
    .campo-bloco {
      display: flex;
      align-items: baseline;
      gap: 1.5mm;
      min-width: 0;
    }
    .campo-bloco.alinha-direita {
      text-align: right;
      justify-content: flex-end;
      flex-shrink: 0;
    }
    .label {
      font-weight: 700;
      color: #000;
      margin-right: 1.5mm;
      flex-shrink: 0;
    }
    .valor {
      color: #000;
      word-break: break-word;
    }
    .valor-destaque {
      font-weight: 600;
    }
    .valor-os {
      font-weight: 800;
      letter-spacing: 0.2px;
    }
    .campo-obs {
      display: flex;
      align-items: flex-start;
      margin-bottom: 1mm;
      min-height: 5.5mm;
    }
    .valor-obs {
      flex: 1;
      font-size: 8.5pt;
      line-height: 1.2;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
      word-break: break-word;
    }
    .obs-vazia {
      display: inline-block;
      width: 100%;
      border-bottom: 1px dotted #555;
      height: 4mm;
    }
    .linha-pacote {
      text-align: center;
      font-size: 15pt;
      font-weight: 900;
      letter-spacing: 0.5px;
      padding-top: 1.5mm;
      margin-top: auto;
      border-top: 1.5px dashed #000;
      line-height: 1.1;
      white-space: nowrap;
    }
    .linha-pacote u {
      text-decoration: underline;
      text-underline-offset: 3px;
      text-decoration-thickness: 2px;
    }
    .linha-pacote u.espaco-em-branco {
      text-decoration: underline;
      display: inline-block;
      min-width: 25mm;
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
