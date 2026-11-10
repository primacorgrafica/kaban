import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Remoção da Lógica de Aviso 'PODE SEGUIR'", () => {
  const projectRoot = path.resolve(__dirname, "..");
  const repoRoot = path.resolve(projectRoot, "..");

  it("deve conter arquivo de migration para remover o trigger e função do PostgreSQL", () => {
    const migrationPath = path.join(
      repoRoot,
      "supabase",
      "migrations",
      "20261110_remover_logica_pode_seguir.sql"
    );
    expect(fs.existsSync(migrationPath)).toBe(true);

    const migrationContent = fs.readFileSync(migrationPath, "utf8");
    expect(migrationContent).toContain(
      "DROP TRIGGER IF EXISTS trg_notify_marcelo_on_preimpressao_saida ON public.orders;"
    );
    expect(migrationContent).toContain(
      "DROP FUNCTION IF EXISTS public.notify_marcelo_on_preimpressao_saida();"
    );
    expect(migrationContent).toContain("DELETE FROM public.avisos");
    expect(migrationContent).toContain("PODE SEGUIR");
  });

  it("useAvisos.ts deve filtrar e purgar avisos residuais de 'PODE SEGUIR'", () => {
    const hookPath = path.join(projectRoot, "hooks", "useAvisos.ts");
    const content = fs.readFileSync(hookPath, "utf8");

    expect(content).toContain('a.mensagem !== "PODE SEGUIR"');
    expect(content).toContain('.delete().eq("id", av.id)');
  });

  it("Dashboard.tsx deve filtrar avisos residuais de 'PODE SEGUIR'", () => {
    const dashboardPath = path.join(projectRoot, "components", "Dashboard.tsx");
    const content = fs.readFileSync(dashboardPath, "utf8");

    expect(content).toContain('a.mensagem !== "PODE SEGUIR"');
  });

  it("simulação da função de filtro de avisos deve remover itens com 'PODE SEGUIR'", () => {
    const mockAvisos = [
      { id: "1", titulo: "OS 1001", mensagem: "PODE SEGUIR", tipo: "lembrete" },
      { id: "2", titulo: "OS 1002", mensagem: "pode seguir para acabamento", tipo: "lembrete" },
      { id: "3", titulo: "Comunicado Geral", mensagem: "Manutenção programada às 18h", tipo: "info" },
      { id: "4", titulo: "OS 1004", mensagem: "Arquivo aprovado pelo cliente", tipo: "info" },
    ];

    const filterFn = (avisos: typeof mockAvisos) =>
      avisos.filter(
        (a) => a.mensagem !== "PODE SEGUIR" && !a.mensagem?.toUpperCase().includes("PODE SEGUIR")
      );

    const filtered = filterFn(mockAvisos);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((a) => a.id)).toEqual(["3", "4"]);
  });
});
