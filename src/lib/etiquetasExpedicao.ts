/**
 * Utilitários puros para geração e validação de etiquetas de embalagem da Expedição.
 * Suporta impressão térmica para Zebra ZD230 (papel 80mm de largura).
 */

export interface EtiquetaData {
  numero: number;
  numeroFormatado: string;
  total: number;
  totalFormatado: string;
  textoPacote: string; // Ex: "Pacote 01 de 05"
  cliente: string;
  servico: string;
  quantidade: string;
  osNumero: string;
}

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  value?: number;
}

export const DEFAULT_ALTURA_ETIQUETA_MM = 50;

/**
 * Valida o total de pacotes informado pelo operador.
 * Regras:
 * - Obrigatório (não pode ser vazio)
 * - Deve ser número inteiro
 * - Mínimo 1, máximo 99
 */
export function validateTotalPacotes(raw: string | number | undefined | null): ValidationResult {
  if (raw === undefined || raw === null) {
    return { isValid: false, error: "Informe o total de pacotes (1 a 99)." };
  }

  const str = String(raw).trim();
  if (str === "") {
    return { isValid: false, error: "Informe o total de pacotes (1 a 99)." };
  }

  // Verifica se contém caracteres inválidos ou decimais
  if (!/^-?\d+$/.test(str)) {
    return { isValid: false, error: "O total de pacotes deve ser um número inteiro." };
  }

  const num = parseInt(str, 10);

  if (num <= 0) {
    return { isValid: false, error: "O total de pacotes deve ser no mínimo 1." };
  }

  if (num > 99) {
    return { isValid: false, error: "O total de pacotes não pode ser maior que 99." };
  }

  return { isValid: true, value: num };
}

/**
 * Formata um número com dois dígitos (01, 02, ... 09, 10, ...).
 */
export function formatDoisDigitos(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "00";
  return String(Math.floor(n)).padStart(2, "0");
}

/**
 * Gera a lista de dados de etiquetas para cada pacote (de 1 até totalPacotes).
 */
export function generateEtiquetasList(params: {
  cliente: string;
  servico: string;
  quantidade: string;
  osNumero: string;
  totalPacotes: number;
}): EtiquetaData[] {
  const { cliente, servico, quantidade, osNumero, totalPacotes } = params;
  const validation = validateTotalPacotes(totalPacotes);

  if (!validation.isValid || !validation.value) {
    return [];
  }

  const total = validation.value;
  const totalFormatado = formatDoisDigitos(total);
  const result: EtiquetaData[] = [];

  for (let i = 1; i <= total; i++) {
    const numeroFormatado = formatDoisDigitos(i);
    result.push({
      numero: i,
      numeroFormatado,
      total,
      totalFormatado,
      textoPacote: `Pacote ${numeroFormatado} de ${totalFormatado}`,
      cliente: cliente.trim(),
      servico: servico.trim(),
      quantidade: quantidade.trim(),
      osNumero: osNumero.trim(),
    });
  }

  return result;
}

/**
 * Tenta extrair quantidade e serviço a partir de uma descrição de O.S.
 * Ex: "5.000 FOLHETOS 4X4" => { quantidade: "5.000", servico: "FOLHETOS 4X4" }
 */
export function parseOrderInitialFields(order: {
  cliente?: string | null;
  titulo?: string | null;
  descricao?: string | null;
  quantidade?: number | string | null;
}): { cliente: string; servico: string; quantidade: string; osNumero: string } {
  const cliente = (order.cliente || "").trim();
  const rawTitulo = (order.titulo || "").trim();
  // Limpa prefixos # ou O.S. se houver
  const osNumero = rawTitulo.replace(/^(?:o\.?s\.?\s*#?|#+)\s*/i, "").trim() || rawTitulo;

  let quantidade = "";
  let servico = (order.descricao || "").trim();

  if (order.quantidade !== undefined && order.quantidade !== null && String(order.quantidade).trim() !== "") {
    quantidade = String(order.quantidade).trim();
  } else if (servico) {
    // Tenta identificar quantidade no início da descrição (ex: 1.000, 2000, 500x, 100 un)
    const match = servico.match(/^([\d.,]+(?:\s*(?:unidades|unidade|und|un|pçs|pcs|folhas|ex|x|mil))?)\s*[-–—:]?\s*(.+)$/i);
    if (match && match[1] && match[2]) {
      quantidade = match[1].trim();
      servico = match[2].trim();
    }
  }

  return {
    cliente,
    servico,
    quantidade,
    osNumero,
  };
}

/**
 * Escapa caracteres HTML para injeção segura no documento de impressão.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Gera o documento HTML completo para impressão térmica em 80mm de largura.
 */
export function generateEtiquetasPrintHtml(
  etiquetas: EtiquetaData[],
  alturaMm: number = DEFAULT_ALTURA_ETIQUETA_MM
): string {
  const altura = alturaMm > 0 ? alturaMm : DEFAULT_ALTURA_ETIQUETA_MM;

  const labelsHtml = etiquetas
    .map((eti) => {
      const clienteSafe = escapeHtml(eti.cliente || "—");
      const servicoSafe = escapeHtml(eti.servico || "—");
      const qtdSafe = escapeHtml(eti.quantidade || "—");
      const osSafe = escapeHtml(eti.osNumero || "—");
      const nnSafe = escapeHtml(eti.numeroFormatado);
      const xxSafe = escapeHtml(eti.totalFormatado);

      return `
      <div class="etiqueta-page">
        <div class="etiqueta-inner">
          <div class="linha-dado">
            <span class="label-titulo">Cliente:</span>
            <span class="valor-texto valor-destaque">${clienteSafe}</span>
          </div>
          <div class="linha-dado">
            <span class="label-titulo">Serviço:</span>
            <span class="valor-texto">${servicoSafe}</span>
          </div>
          <div class="linha-dupla">
            <div class="col-qtd">
              <span class="label-titulo">Quantidade:</span>
              <span class="valor-texto valor-destaque">${qtdSafe}</span>
            </div>
            <div class="col-os">
              <span class="label-titulo">O.S.:</span>
              <span class="valor-texto valor-destaque">${osSafe}</span>
            </div>
          </div>
          <div class="linha-pacote">
            Pacote <u>${nnSafe}</u> de <u>${xxSafe}</u>
          </div>
        </div>
      </div>
      `;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Impressão de Etiquetas de Expedição</title>
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
      background: #ffffff;
      color: #000000;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .etiqueta-page {
      width: 80mm;
      height: ${altura}mm;
      box-sizing: border-box;
      padding: 3mm;
      page-break-after: always;
      break-after: page;
      overflow: hidden;
      background: #ffffff;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .etiqueta-page:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .etiqueta-inner {
      width: 100%;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 1.5mm;
    }
    .linha-dado {
      display: flex;
      align-items: baseline;
      gap: 1.5mm;
      font-size: 11pt;
      line-height: 1.25;
      overflow: hidden;
    }
    .label-titulo {
      font-weight: 600;
      color: #000000;
      flex-shrink: 0;
    }
    .valor-texto {
      font-weight: 500;
      color: #000000;
      word-break: break-word;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    .valor-destaque {
      font-weight: 700;
    }
    .linha-dupla {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      font-size: 11pt;
      line-height: 1.25;
    }
    .col-qtd {
      display: flex;
      align-items: baseline;
      gap: 1.5mm;
      overflow: hidden;
      max-width: 58%;
    }
    .col-os {
      display: flex;
      align-items: baseline;
      gap: 1.5mm;
      overflow: hidden;
      max-width: 40%;
      justify-content: flex-end;
    }
    .linha-pacote {
      text-align: center;
      font-size: 16pt;
      font-weight: 900;
      line-height: 1.2;
      letter-spacing: 0.3px;
      margin-top: 1mm;
      padding-top: 1mm;
      border-top: 1px dashed #000000;
    }
    .linha-pacote u {
      text-decoration: underline;
      text-underline-offset: 2.5px;
      text-decoration-thickness: 1.5px;
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
export function printEtiquetasViaIframe(htmlContent: string): Promise<boolean> {
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
        document.body.removeChild(iframe);
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
