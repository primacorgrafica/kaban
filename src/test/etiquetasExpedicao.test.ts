import { describe, it, expect } from "vitest";
import {
  validateTotalPacotes,
  formatDoisDigitos,
  generateEtiquetasList,
  parseOrderInitialFields,
  generateEtiquetasPrintHtml,
  DEFAULT_ALTURA_ETIQUETA_MM,
} from "@/lib/etiquetasExpedicao";

describe("etiquetasExpedicao - Validação e Geração de Etiquetas", () => {
  describe("validateTotalPacotes", () => {
    it("deve rejeitar valores vazios, nulos ou indefinidos", () => {
      expect(validateTotalPacotes("").isValid).toBe(false);
      expect(validateTotalPacotes("   ").isValid).toBe(false);
      expect(validateTotalPacotes(null).isValid).toBe(false);
      expect(validateTotalPacotes(undefined).isValid).toBe(false);
    });

    it("deve rejeitar zero e números negativos", () => {
      expect(validateTotalPacotes(0).isValid).toBe(false);
      expect(validateTotalPacotes("0").isValid).toBe(false);
      expect(validateTotalPacotes(-1).isValid).toBe(false);
      expect(validateTotalPacotes("-5").isValid).toBe(false);
    });

    it("deve rejeitar números decimais", () => {
      expect(validateTotalPacotes("1.5").isValid).toBe(false);
      expect(validateTotalPacotes("2,5").isValid).toBe(false);
      expect(validateTotalPacotes(3.14).isValid).toBe(false);
    });

    it("deve rejeitar valores maiores que 99", () => {
      expect(validateTotalPacotes(100).isValid).toBe(false);
      expect(validateTotalPacotes("101").isValid).toBe(false);
      expect(validateTotalPacotes(999).isValid).toBe(false);
    });

    it("deve rejeitar textos não numéricos", () => {
      expect(validateTotalPacotes("abc").isValid).toBe(false);
      expect(validateTotalPacotes("10a").isValid).toBe(false);
    });

    it("deve aceitar números inteiros válidos entre 1 e 99", () => {
      const res1 = validateTotalPacotes(1);
      expect(res1.isValid).toBe(true);
      expect(res1.value).toBe(1);

      const res5 = validateTotalPacotes("5");
      expect(res5.isValid).toBe(true);
      expect(res5.value).toBe(5);

      const res99 = validateTotalPacotes("99");
      expect(res99.isValid).toBe(true);
      expect(res99.value).toBe(99);
    });
  });

  describe("formatDoisDigitos", () => {
    it("deve formatar números menores que 10 com zero à esquerda", () => {
      expect(formatDoisDigitos(1)).toBe("01");
      expect(formatDoisDigitos(5)).toBe("05");
      expect(formatDoisDigitos(9)).toBe("09");
    });

    it("deve manter números com 2 dígitos sem alteração", () => {
      expect(formatDoisDigitos(10)).toBe("10");
      expect(formatDoisDigitos(25)).toBe("25");
      expect(formatDoisDigitos(99)).toBe("99");
    });
  });

  describe("generateEtiquetasList", () => {
    it("deve gerar a lista correta de etiquetas com numeração sequencial", () => {
      const lista = generateEtiquetasList({
        cliente: "CLIENTE TESTE S/A",
        servico: "FOLHETOS PROMOCIONAIS 4X4",
        quantidade: "5.000",
        osNumero: "73210",
        totalPacotes: 3,
      });

      expect(lista).toHaveLength(3);

      expect(lista[0]).toEqual({
        numero: 1,
        numeroFormatado: "01",
        total: 3,
        totalFormatado: "03",
        textoPacote: "Pacote 01 de 03",
        cliente: "CLIENTE TESTE S/A",
        servico: "FOLHETOS PROMOCIONAIS 4X4",
        quantidade: "5.000",
        osNumero: "73210",
      });

      expect(lista[1].textoPacote).toBe("Pacote 02 de 03");
      expect(lista[2].textoPacote).toBe("Pacote 03 de 03");
    });

    it("deve gerar 1 etiqueta quando total for 1", () => {
      const lista = generateEtiquetasList({
        cliente: "PRIMACOR",
        servico: "CARTÕES DE VISITA",
        quantidade: "1.000",
        osNumero: "80000",
        totalPacotes: 1,
      });

      expect(lista).toHaveLength(1);
      expect(lista[0].textoPacote).toBe("Pacote 01 de 01");
    });

    it("deve retornar array vazio caso o total de pacotes seja inválido", () => {
      const listaZero = generateEtiquetasList({
        cliente: "PRIMACOR",
        servico: "TESTE",
        quantidade: "100",
        osNumero: "123",
        totalPacotes: 0,
      });
      expect(listaZero).toEqual([]);

      const listaInvalida = generateEtiquetasList({
        cliente: "PRIMACOR",
        servico: "TESTE",
        quantidade: "100",
        osNumero: "123",
        totalPacotes: 105,
      });
      expect(listaInvalida).toEqual([]);
    });
  });

  describe("parseOrderInitialFields", () => {
    it("deve extrair campos básicos da O.S.", () => {
      const fields = parseOrderInitialFields({
        cliente: "ACME INDÚSTRIA",
        titulo: "O.S. #73500",
        descricao: "CAIXAS PERSONALIZADAS",
        quantidade: 2500,
      });

      expect(fields.cliente).toBe("ACME INDÚSTRIA");
      expect(fields.osNumero).toBe("73500");
      expect(fields.servico).toBe("CAIXAS PERSONALIZADAS");
      expect(fields.quantidade).toBe("2500");
    });

    it("deve extrair quantidade contida no início da descrição se não houver campo quantidade", () => {
      const fields = parseOrderInitialFields({
        cliente: "BIOCLIN",
        titulo: "73657",
        descricao: "220 BULAS DE Bioclin Fia Vitamina B12",
      });

      expect(fields.cliente).toBe("BIOCLIN");
      expect(fields.osNumero).toBe("73657");
      expect(fields.quantidade).toBe("220");
      expect(fields.servico).toBe("BULAS DE Bioclin Fia Vitamina B12");
    });
  });

  describe("generateEtiquetasPrintHtml", () => {
    it("deve conter a diretiva @page com largura 80mm e altura especificada", () => {
      const etiquetas = generateEtiquetasList({
        cliente: "CLIENTE TESTE",
        servico: "ADESIVOS VINIL",
        quantidade: "500",
        osNumero: "9999",
        totalPacotes: 2,
      });

      const html = generateEtiquetasPrintHtml(etiquetas, 40);
      expect(html).toContain("@page");
      expect(html).toContain("size: 80mm 40mm");
      expect(html).toContain("width: 80mm");
      expect(html).toContain("height: 40mm");
      expect(html).toContain("Pacote <u>01</u> de <u>02</u>");
      expect(html).toContain("Pacote <u>02</u> de <u>02</u>");
      expect(html).toContain("CLIENTE TESTE");
      expect(html).toContain("ADESIVOS VINIL");
      expect(html).toContain("Quantidade:");
      expect(html).toContain("O.S.:");
    });

    it("deve utilizar altura padrão se altura informada for <= 0", () => {
      const etiquetas = generateEtiquetasList({
        cliente: "CLIENTE TESTE",
        servico: "ADESIVOS",
        quantidade: "100",
        osNumero: "1000",
        totalPacotes: 1,
      });

      const html = generateEtiquetasPrintHtml(etiquetas, 0);
      expect(html).toContain(`size: 80mm ${DEFAULT_ALTURA_ETIQUETA_MM}mm`);
    });
  });
});
