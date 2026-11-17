import { describe, it, expect } from "vitest";
import {
  escapeHtml,
  formatNumeroSequencial,
  validateSequenciaPacotes,
  generateSequenciaNumeros,
  formatLinhaPacoteManual,
  formatLinhaPacoteSequencial,
  generateEtiquetasInspecaoPrintHtml,
  DEFAULT_ALTURA_ETIQUETA_MM,
} from "@/lib/etiquetasInspecao";

describe("etiquetasInspecao - Validação e Geração de Etiquetas da Inspeção", () => {
  // (a) Geração da sequência
  describe("generateSequenciaNumeros", () => {
    it("deve gerar sequência de 1 até 3 como ['01', '02', '03']", () => {
      const res = generateSequenciaNumeros(1, 3);
      expect(res).toEqual(["01", "02", "03"]);
    });

    it("deve gerar sequência de 5 até 10 como ['05', '06', '07', '08', '09', '10']", () => {
      const res = generateSequenciaNumeros(5, 10);
      expect(res).toEqual(["05", "06", "07", "08", "09", "10"]);
    });

    it("deve gerar sequência de 1 até 100 com 100 itens formatados de '001' a '100'", () => {
      const res = generateSequenciaNumeros(1, 100);
      expect(res).toHaveLength(100);
      expect(res[0]).toBe("001");
      expect(res[98]).toBe("099");
      expect(res[99]).toBe("100");
    });

    it("deve gerar sequência de 1 até 1 como ['01']", () => {
      const res = generateSequenciaNumeros(1, 1);
      expect(res).toEqual(["01"]);
    });

    it("deve retornar array vazio se De for menor que 1 ou Até for menor que De", () => {
      expect(generateSequenciaNumeros(0, 5)).toEqual([]);
      expect(generateSequenciaNumeros(5, 4)).toEqual([]);
    });
  });

  // (b) Validação da sequência
  describe("validateSequenciaPacotes", () => {
    it("deve aceitar De >= 1, Até >= De e total <= 999", () => {
      const res1 = validateSequenciaPacotes(1, 5);
      expect(res1.isValid).toBe(true);
      expect(res1.de).toBe(1);
      expect(res1.ate).toBe(5);
      expect(res1.total).toBe(5);

      const res2 = validateSequenciaPacotes("10", "25");
      expect(res2.isValid).toBe(true);
      expect(res2.total).toBe(16);

      const res999 = validateSequenciaPacotes(1, 999);
      expect(res999.isValid).toBe(true);
      expect(res999.total).toBe(999);
    });

    it("deve rejeitar valores vazios, nulos ou indefinidos", () => {
      expect(validateSequenciaPacotes("", 5).isValid).toBe(false);
      expect(validateSequenciaPacotes(1, "").isValid).toBe(false);
      expect(validateSequenciaPacotes(null, 5).isValid).toBe(false);
      expect(validateSequenciaPacotes(1, undefined).isValid).toBe(false);
    });

    it("deve rejeitar zero e números negativos", () => {
      expect(validateSequenciaPacotes(0, 5).isValid).toBe(false);
      expect(validateSequenciaPacotes(-1, 5).isValid).toBe(false);
      expect(validateSequenciaPacotes(1, 0).isValid).toBe(false);
      expect(validateSequenciaPacotes(1, -5).isValid).toBe(false);
    });

    it("deve rejeitar números decimais", () => {
      expect(validateSequenciaPacotes("1.5", 5).isValid).toBe(false);
      expect(validateSequenciaPacotes("1,5", 5).isValid).toBe(false);
      expect(validateSequenciaPacotes(1, 5.5).isValid).toBe(false);
    });

    it("deve rejeitar quando Até for menor que De", () => {
      const res = validateSequenciaPacotes(10, 5);
      expect(res.isValid).toBe(false);
      expect(res.errorMessage).toContain("maior ou igual");
    });

    it("deve rejeitar quando total de etiquetas for maior que 999", () => {
      const res = validateSequenciaPacotes(1, 1000);
      expect(res.isValid).toBe(false);
      expect(res.errorMessage).toContain("não pode exceder 999");
    });
  });

  // (c) Montagem da linha do pacote no modo manual
  describe("formatLinhaPacoteManual e formatLinhaPacoteSequencial", () => {
    it("deve manter o número manual exatamente como digitado (ex.: '01', '7', '12A')", () => {
      expect(formatLinhaPacoteManual("01")).toBe("Pacote <u>01</u>");
      expect(formatLinhaPacoteManual("7")).toBe("Pacote <u>7</u>");
      expect(formatLinhaPacoteManual("12A")).toBe("Pacote <u>12A</u>");
    });

    it("deve gerar traço em branco quando número manual estiver vazio", () => {
      const linhaVazia = formatLinhaPacoteManual("");
      expect(linhaVazia).toContain("Pacote");
      expect(linhaVazia).toContain("espaco-em-branco");
      expect(linhaVazia).not.toContain("de");

      const linhaEspacos = formatLinhaPacoteManual("   ");
      expect(linhaEspacos).toContain("espaco-em-branco");
    });

    it("NUNCA deve conter 'de' nem total em nenhum dos formatos", () => {
      const manual1 = formatLinhaPacoteManual("12A");
      expect(manual1).not.toMatch(/\bde\b/i);

      const manualVazio = formatLinhaPacoteManual("");
      expect(manualVazio).not.toMatch(/\bde\b/i);

      const sequencial = formatLinhaPacoteSequencial("05");
      expect(sequencial).not.toMatch(/\bde\b/i);
      expect(sequencial).toBe("Pacote <u>05</u>");
    });
  });

  // (d) Geração de HTML: 1 etiqueta no manual e N no sequencial, sem page-break na última
  describe("generateEtiquetasInspecaoPrintHtml", () => {
    it("deve gerar exatamente 1 etiqueta no modo manual e a última com page-break-after: auto", () => {
      const etiquetas = [
        {
          cliente: "CLIENTE TESTE",
          servico: "FOLHETOS",
          quantidade: "1.000",
          osNumero: "73210",
          observacao: "Entrega urgente",
          numeroPacote: "01",
          linhaPacoteHtml: formatLinhaPacoteManual("01"),
        },
      ];

      const html = generateEtiquetasInspecaoPrintHtml(etiquetas, 50);
      expect(html).toContain('class="etiqueta-page etiqueta-last"');
      expect(html).toContain("page-break-after: auto !important");
      expect(html).toContain("Pacote <u>01</u>");
      expect(html).toContain("Entrega urgente");
    });

    it("deve gerar N etiquetas no modo sequencial com quebra em todas exceto a última", () => {
      const sequencia = generateSequenciaNumeros(1, 3); // 01, 02, 03
      const etiquetas = sequencia.map((num) => ({
        cliente: "CLIENTE TESTE",
        servico: "FOLHETOS",
        quantidade: "1.000",
        osNumero: "73210",
        observacao: "",
        numeroPacote: num,
        linhaPacoteHtml: formatLinhaPacoteSequencial(num),
      }));

      const html = generateEtiquetasInspecaoPrintHtml(etiquetas, 50);
      const matches = html.match(/class="etiqueta-page/g);
      expect(matches).toHaveLength(3);

      expect(html).toContain("Pacote <u>01</u>");
      expect(html).toContain("Pacote <u>02</u>");
      expect(html).toContain("Pacote <u>03</u>");
      expect(html).toContain('class="etiqueta-page etiqueta-last"');
    });

    it("deve respeitar a altura do papel configurada (ex: 50mm ou 40mm)", () => {
      const html50 = generateEtiquetasInspecaoPrintHtml([], 50);
      expect(html50).toContain("size: 80mm 50mm;");

      const html40 = generateEtiquetasInspecaoPrintHtml([], 40);
      expect(html40).toContain("size: 80mm 40mm;");
    });
  });

  // (e) Escape de HTML nos campos digitados
  describe("escapeHtml", () => {
    it("deve escapar tags HTML e caracteres maliciosos para prevenir injeção", () => {
      const malicious = '<script>alert("XSS")</script>&"\'';
      const escaped = escapeHtml(malicious);

      expect(escaped).not.toContain("<script>");
      expect(escaped).toContain("&lt;script&gt;");
      expect(escaped).toContain("&amp;");
      expect(escaped).toContain("&quot;");
      expect(escaped).toContain("&#039;");
    });

    it("HTML gerado deve conter valores devidamente escapados", () => {
      const etiquetas = [
        {
          cliente: '<img src=x onerror=alert(1)> & "Primacor"',
          servico: "<b>Teste</b>",
          quantidade: "100",
          osNumero: "73210",
          observacao: "Obs com <script>",
          numeroPacote: "01",
          linhaPacoteHtml: formatLinhaPacoteManual("01"),
        },
      ];

      const html = generateEtiquetasInspecaoPrintHtml(etiquetas, DEFAULT_ALTURA_ETIQUETA_MM);
      expect(html).not.toContain("<img src=x");
      expect(html).toContain("&lt;img src=x");
      expect(html).toContain("&amp;");
      expect(html).not.toContain("<b>Teste</b>");
      expect(html).toContain("&lt;b&gt;Teste&lt;/b&gt;");
      expect(html).not.toContain("<script>");
    });
  });
});
