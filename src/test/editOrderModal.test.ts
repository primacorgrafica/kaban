import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Edição de Card em 3 Etapas (CreateOrderDialog)", () => {
  const projectRoot = path.resolve(__dirname, "..");

  it("CreateOrderDialog deve exportar CreateOrderDialogProps com suporte a orderToEdit e onUpdate", () => {
    const dialogFile = fs.readFileSync(
      path.join(projectRoot, "components", "CreateOrderDialog.tsx"),
      "utf8"
    );

    expect(dialogFile).toContain("export interface CreateOrderDialogProps");
    expect(dialogFile).toContain("orderToEdit?: Order | null;");
    expect(dialogFile).toContain("onUpdate?: (id: string, data: Partial<Order>) => Promise<any> | any;");
    expect(dialogFile).toContain("open?: boolean;");
    expect(dialogFile).toContain("onOpenChange?: (open: boolean) => void;");
  });

  it("CreateOrderDialog deve suportar alternância de passos livre em modo edição", () => {
    const dialogFile = fs.readFileSync(
      path.join(projectRoot, "components", "CreateOrderDialog.tsx"),
      "utf8"
    );

    // Deve permitir clique nos passos em modo de edição
    expect(dialogFile).toContain("if (isEdit) setStep(s.id as 1 | 2 | 3);");
    // Botão de submissão deve indicar atualização quando em modo de edição
    expect(dialogFile).toContain('isEdit ? "Atualizar O.S." : "Criar Ordem de Serviço"');
    // Deve exibir o número da OS no título do diálogo quando em edição
    expect(dialogFile).toContain('`O.S. #${orderToEdit?.titulo}`');
  });

  it("OrderCard.tsx deve abrir CreateOrderDialog em vez do antigo formulário inline", () => {
    const orderCardFile = fs.readFileSync(
      path.join(projectRoot, "components", "OrderCard.tsx"),
      "utf8"
    );

    expect(orderCardFile).toContain('import { CreateOrderDialog } from "./CreateOrderDialog";');
    expect(orderCardFile).toContain("const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);");
    expect(orderCardFile).toContain("<CreateOrderDialog");
    expect(orderCardFile).toContain("orderToEdit={order}");
    expect(orderCardFile).toContain("onUpdate={onUpdate}");
    // O antigo formulário inline {editing ? (...) : (...)} não deve existir
    expect(orderCardFile).not.toContain("{editing ? (");
  });

  it("OrderDetailDialog.tsx deve abrir CreateOrderDialog em vez do antigo formulário inline", () => {
    const detailFile = fs.readFileSync(
      path.join(projectRoot, "components", "OrderDetailDialog.tsx"),
      "utf8"
    );

    expect(detailFile).toContain('import { CreateOrderDialog } from "./CreateOrderDialog";');
    expect(detailFile).toContain("const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);");
    expect(detailFile).toContain("<CreateOrderDialog");
    expect(detailFile).toContain("orderToEdit={order}");
    expect(detailFile).toContain("onUpdate={onUpdate}");
    expect(detailFile).not.toContain("{editing ? (");
  });

  it("OrderSlideOver.tsx deve integrar CreateOrderDialog para edição completa de informações", () => {
    const slideOverFile = fs.readFileSync(
      path.join(projectRoot, "components", "OrderSlideOver.tsx"),
      "utf8"
    );

    expect(slideOverFile).toContain('import { CreateOrderDialog } from "./CreateOrderDialog";');
    expect(slideOverFile).toContain("<CreateOrderDialog");
    expect(slideOverFile).toContain("orderToEdit={order}");
    expect(slideOverFile).toContain("onUpdate={onUpdate}");
  });

  it("CreateOrderDialog deve restringir o campo de Número da O.S. e O.S. anterior para aceitar apenas dígitos", () => {
    const dialogFile = fs.readFileSync(
      path.join(projectRoot, "components", "CreateOrderDialog.tsx"),
      "utf8"
    );

    // Campo Nº da O.S. deve filtrar caracteres não numéricos
    expect(dialogFile).toContain('replace(/\\D/g, "")');
    expect(dialogFile).toContain('inputMode="numeric"');
    expect(dialogFile).toContain('pattern="[0-9]*"');
    expect(dialogFile).toContain('placeholder="Apenas números (Ex: 75120)"');
  });
});
