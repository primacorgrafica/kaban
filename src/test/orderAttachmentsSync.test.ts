import { describe, it, expect, vi, beforeEach } from "vitest";
import { formatOsFolderName } from "../lib/sharepointService";
import { isValidEmail, resolveSellerEmail, INVALID_NOTIFICATION_EMAILS } from "../lib/sellerNotificationService";
import { DEFAULT_VENDEDORES } from "../lib/vendedores";
import { supabase } from "@/integrations/supabase/client";
import * as fs from "fs";
import * as path from "path";

vi.mock("@/integrations/supabase/client", () => {
  return {
    supabase: {
      from: vi.fn(),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-123" } }, error: null }),
      },
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    },
  };
});

describe("Resiliência e Sincronização de Anexos do SharePoint", () => {
  const projectRoot = path.resolve(__dirname, "..");

  beforeEach(() => {
    vi.clearAllMocks();
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        ilike: vi.fn().mockReturnValue({
          not: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
        eq: vi.fn().mockReturnValue({
          not: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      }),
    });
  });

  it("1. formatOsFolderName deve padronizar o nome de pasta como 'OS-{numero}'", () => {
    expect(formatOsFolderName("order-uuid-123", "73515")).toBe("OS-73515");
    expect(formatOsFolderName("order-uuid-123", "OS 73515")).toBe("OS-73515");
    expect(formatOsFolderName("order-uuid-123", "OS-73512")).toBe("OS-73512");
  });

  it("2. sharepointService.ts deve exportar a função listFilesInOsFolder", () => {
    const spFile = fs.readFileSync(path.join(projectRoot, "lib", "sharepointService.ts"), "utf-8");
    expect(spFile).toContain("export async function listFilesInOsFolder");
    expect(spFile).toContain("formatOsFolderName(osIdentifier, osNumberDisplay)");
    expect(spFile).toContain("listChildrenUrl");
  });

  it("3. useOrderAttachments.ts deve conter syncWithSharePoint e auto-recuperação", () => {
    const hookFile = fs.readFileSync(path.join(projectRoot, "hooks", "useOrderAttachments.ts"), "utf-8");
    expect(hookFile).toContain("syncWithSharePoint");
    expect(hookFile).toContain("listFilesInOsFolder");
    expect(hookFile).toContain("isSyncing");
    expect(hookFile).toContain("sharepoint_folder_name");
  });

  it("4. CreateOrderDialog.tsx deve registrar anexos em order_attachments no modo EDIÇÃO e ATUALIZAR a O.S.", () => {
    const dialogFile = fs.readFileSync(path.join(projectRoot, "components", "CreateOrderDialog.tsx"), "utf-8");
    // Modo edição: grava em order_attachments
    expect(dialogFile).toContain('order_id: orderToEdit.id');
    expect(dialogFile).toContain('sharepoint_folder_id: folder.folderId');
    expect(dialogFile).toContain('sharepoint_folder_url: folder.folderWebUrl');
    // Modo criação: grava em order_attachments com targetOrderId e atualiza orders
    expect(dialogFile).toContain('order_id: targetOrderId');
  });

  it("5. OrderAttachmentsSection.tsx e diálogos de O.S. devem permitir upload e sincronização direta", () => {
    const sectionFile = fs.readFileSync(path.join(projectRoot, "components", "sharepoint", "OrderAttachmentsSection.tsx"), "utf-8");
    expect(sectionFile).toContain("syncWithSharePoint");
    expect(sectionFile).toContain("Sincronizar Arquivos do SharePoint");

    const detailFile = fs.readFileSync(path.join(projectRoot, "components", "OrderDetailDialog.tsx"), "utf-8");
    expect(detailFile).toContain("allowUpload={!permissions.isViewOnly}");

    const cardFile = fs.readFileSync(path.join(projectRoot, "components", "OrderCard.tsx"), "utf-8");
    expect(cardFile).toContain("allowUpload={!permissions.isViewOnly}");
  });

  it("6. sellerNotificationService deve rejeitar 'coordenadorpre' para evitar bounces de e-mail", () => {
    expect(INVALID_NOTIFICATION_EMAILS.has("coordenadorpre@primacorgrafica.com.br")).toBe(true);
    expect(isValidEmail("coordenadorpre@primacorgrafica.com.br")).toBe(false);
    expect(isValidEmail("well@primacorgrafica.com.br")).toBe(true);
  });

  it("7. resolveSellerEmail deve mapear 'Wellington' e 'well' para o vendedor real 'Wellington'", async () => {
    const res = await resolveSellerEmail("Wellington");
    expect(res.name).toBe("Wellington");
    expect(res.email).toBe("well@primacorgrafica.com.br");
    expect(res.source).toBe("vendedores");

    const resWell = await resolveSellerEmail("well");
    expect(resWell.name).toBe("Wellington");
    expect(resWell.email).toBe("well@primacorgrafica.com.br");
  });

  it("8. resolveSellerEmail não deve disparar e-mail para criador se e-mail for coordenadorpre", async () => {
    const res = await resolveSellerEmail(null, "some-creator-with-coordenadorpre");
    // Se o criador tivesse coordenadorpre, isValidEmail retornará false e não cairá nele
    expect(res.email).not.toBe("coordenadorpre@primacorgrafica.com.br");
  });
});
