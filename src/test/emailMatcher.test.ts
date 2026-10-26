import { describe, it, expect } from "vitest";
import {
  extractOsNumbers,
  validateOsCandidates,
  findOsInSubject,
  findOsInEmail,
} from "../lib/emailMatcher";

describe("emailMatcher - Extração e Validação de O.S. em E-mails", () => {
  describe("extractOsNumbers", () => {
    it("deve extrair números precedidos por 'OS', 'O.S.', 'Ordem', 'nº'", () => {
      expect(extractOsNumbers("Aprovação da OS 73210")).toContain("73210");
      expect(extractOsNumbers("Referente a O.S. 73210")).toContain("73210");
      expect(extractOsNumbers("O.S 73210 - Prova Digital")).toContain("73210");
      expect(extractOsNumbers("Ordem 73210 - Embalagens")).toContain("73210");
      expect(extractOsNumbers("Ordem de Serviço 73210")).toContain("73210");
      expect(extractOsNumbers("Segue layout nº 73210 para validação")).toContain("73210");
      expect(extractOsNumbers("OS-73210 aprovada")).toContain("73210");
    });

    it("deve extrair números genéricos de 4 a 6 dígitos sem contexto explícito", () => {
      const candidates = extractOsNumbers("Segue orçamento do pedido 73210 atualizado");
      expect(candidates).toContain("73210");
    });

    it("deve priorizar candidatos com contexto de 'OS' antes de números genéricos", () => {
      const text = "Orçamento 1234 gerado para a OS 73210";
      const candidates = extractOsNumbers(text);
      expect(candidates[0]).toBe("73210");
    });

    it("não deve extrair números com menos de 4 dígitos ou mais de 6 dígitos (evita datas e telefones)", () => {
      const text = "Em 20261020, o cliente 42 solicitou prova pelo telefone 987654321";
      const candidates = extractOsNumbers(text);
      expect(candidates).not.toContain("20261020"); // 8 dígitos
      expect(candidates).not.toContain("42"); // 2 dígitos
      expect(candidates).not.toContain("987654321"); // 9 dígitos
    });

    it("deve retornar array vazio para texto vazio, nulo ou indefinido", () => {
      expect(extractOsNumbers("")).toEqual([]);
      expect(extractOsNumbers(null as any)).toEqual([]);
      expect(extractOsNumbers(undefined as any)).toEqual([]);
    });
  });

  describe("validateOsCandidates", () => {
    it("deve filtrar apenas candidatos que existem no conjunto de O.S. ativas", () => {
      const activeOs = new Set(["73210", "84500", "91234"]);
      const candidates = ["73210", "99999", "12345"];

      const result = validateOsCandidates(candidates, activeOs);
      expect(result.matches).toEqual(["73210"]);
      expect(result.ambiguous).toBe(false);
    });

    it("deve sinalizar ambiguidade quando houver múltiplos números válidos", () => {
      const activeOs = new Set(["73210", "84500"]);
      const candidates = ["73210", "84500"];

      const result = validateOsCandidates(candidates, activeOs);
      expect(result.matches).toHaveLength(2);
      expect(result.ambiguous).toBe(true);
    });

    it("não deve confundir números semelhantes (ex: 7321 vs 73210)", () => {
      const activeOs = new Set(["73210"]);
      const candidates = ["7321"]; // Falta um dígito

      const result = validateOsCandidates(candidates, activeOs);
      expect(result.matches).toHaveLength(0);
    });
  });

  describe("findOsInSubject - Identificação Exclusiva no Assunto para Respostas de Clientes", () => {
    const activeOs = new Set(["73210", "85000", "92100"]);

    const validSubjectCases = [
      { subject: "73210", expected: "73210" },
      { subject: "RE: 73210", expected: "73210" },
      { subject: "RES: O.S. 73210", expected: "73210" },
      { subject: "Re: Orçamento - 73210", expected: "73210" },
      { subject: "RES: OS 73210", expected: "73210" },
      { subject: "Re: OS #73210 - Folder Institucional", expected: "73210" },
      { subject: "Re: Ordem 73210", expected: "73210" },
      { subject: "Re: Ordem de Serviço 73210", expected: "73210" },
      { subject: "RES: O.S.: 73210", expected: "73210" },
      { subject: "Re: Prova digital nº 73210", expected: "73210" },
      { subject: "Re: Orçamento 2026 - 73210", expected: "73210" },
    ];

    it.each(validSubjectCases)("deve identificar O.S. '$expected' no assunto: '$subject'", ({ subject, expected }) => {
      const result = findOsInSubject(subject, activeOs);
      expect(result.osNumber).toBe(expected);
    });

    it("deve retornar null se o assunto não contiver nenhuma O.S. ativa", () => {
      expect(findOsInSubject("Dúvida sobre entrega", activeOs).osNumber).toBeNull();
      expect(findOsInSubject("Re: Orçamento sem número", activeOs).osNumber).toBeNull();
      expect(findOsInSubject("RES: Pedido 99999", activeOs).osNumber).toBeNull();
    });

    it("não deve associar números parciais no assunto (ex: 7321 para 73210)", () => {
      expect(findOsInSubject("Re: Pedido 7321", activeOs).osNumber).toBeNull();
    });
  });

  describe("findOsInEmail", () => {
    const activeOs = new Set(["73210", "85000", "92100"]);

    it("deve encontrar a O.S. no assunto com alta prioridade", () => {
      const subject = "Aprovação O.S. 73210 - Primacor";
      const body = "Olá, segue aprovação do material.";

      const result = findOsInEmail(subject, body, activeOs);
      expect(result.osNumber).toBe("73210");
      expect(result.ambiguous).toBe(false);
    });

    it("deve encontrar a O.S. no corpo se o assunto não contiver o número", () => {
      const subject = "Aprovação de Prova Digital";
      const body = "Favor prosseguir com a impressão da OS 73210 conforme arquivo anexo.";

      const result = findOsInEmail(subject, body, activeOs);
      expect(result.osNumber).toBe("73210");
      expect(result.ambiguous).toBe(false);
    });

    it("deve priorizar O.S. do assunto mesmo que o corpo cite outra O.S.", () => {
      const subject = "Alteração O.S. 73210";
      const body = "Por favor verificar se podemos usar as mesmas medidas da O.S. 85000 anterior.";

      const result = findOsInEmail(subject, body, activeOs);
      expect(result.osNumber).toBe("73210");
    });

    it("deve retornar null quando nenhuma O.S. ativa for mencionada", () => {
      const subject = "Dúvida sobre prazo de entrega";
      const body = "Bom dia, quando fica pronto o material da Campanha de Páscoa?";

      const result = findOsInEmail(subject, body, activeOs);
      expect(result.osNumber).toBeNull();
      expect(result.ambiguous).toBe(false);
    });
  });
});
