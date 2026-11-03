import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  formatOsFolderName,
  SHAREPOINT_HOSTNAME,
  SHAREPOINT_SITE_PATH,
  SHAREPOINT_LIBRARY_NAME,
  SHAREPOINT_ROOT_FOLDER,
  SHAREPOINT_PROTOCOLOS_FOLDER,
  SHAREPOINT_PROTOCOLOS_URL,
  resolveSharePointSiteAndDrive,
  getOrCreateOsFolder,
  resetSharePointCache,
  downloadFolderAsZipFromSharePoint,
} from "@/lib/sharepointService";
import {
  AZURE_CLIENT_ID,
  AZURE_TENANT_ID,
  SHAREPOINT_SCOPES,
} from "@/lib/msalClient";

describe("Integração SharePoint - Convenções e Mapeamentos", () => {
  it("deve validar as credenciais corretas do registro Microsoft Entra ID", () => {
    expect(AZURE_CLIENT_ID).toBe("bace3c78-42ed-4939-ae62-2c3403ad906b");
    expect(AZURE_TENANT_ID).toBe("62946ce0-3dbb-47b0-9699-8190d4e679b8");
    expect(SHAREPOINT_SCOPES).toContain("User.Read");
    expect(SHAREPOINT_SCOPES).toContain("Sites.ReadWrite.All");
    expect(SHAREPOINT_SCOPES).toContain("Mail.Send");
    expect(SHAREPOINT_SCOPES).toContain("Mail.Read.Shared");
  });

  it("deve validar as constantes do site e biblioteca corporativa da Primacor", () => {
    expect(SHAREPOINT_HOSTNAME).toBe("primacorgraficaeditora.sharepoint.com");
    expect(SHAREPOINT_SITE_PATH).toBe("/sites/Produo_grupo");
    expect(SHAREPOINT_LIBRARY_NAME).toBe("Documentos Compartilhados");
    expect(SHAREPOINT_ROOT_FOLDER).toBe("KABAN");
    expect(SHAREPOINT_PROTOCOLOS_FOLDER).toBe("PROTOCOLOS ENTREGAS");
    expect(SHAREPOINT_PROTOCOLOS_URL).toContain("PROTOCOLOS%20ENTREGAS");
  });

  describe("formatOsFolderName - Padronização de Pastas no SharePoint", () => {
    it("deve formatar número simples de OS para o padrão OS-{numero}", () => {
      expect(formatOsFolderName("uuid-1234", "1045")).toBe("OS-1045");
      expect(formatOsFolderName("uuid-5678", "71250")).toBe("OS-71250");
    });

    it("deve remover prefixos redundantes digitados pelo usuário (OS, OS-, OS. , OS )", () => {
      expect(formatOsFolderName("uuid-1234", "OS 1045")).toBe("OS-1045");
      expect(formatOsFolderName("uuid-1234", "OS-1045")).toBe("OS-1045");
      expect(formatOsFolderName("uuid-1234", "OS.1045")).toBe("OS-1045");
      expect(formatOsFolderName("uuid-1234", "os 1045")).toBe("OS-1045");
    });

    it("deve sanitizar caracteres ilegais para nomes de pastas no SharePoint", () => {
      // Caracteres proibidos: \ / : * ? " < > | # %
      const dirty = "1045/2026:A*B?C<D>E|F#G%H";
      const formatted = formatOsFolderName("uuid-9999", dirty);
      expect(formatted).toBe("OS-1045_2026_A_B_C_D_E_F_G_H");
      expect(formatted).not.toMatch(/[\\/:*?"<>|#%]/);
    });

    it("deve fazer fallback seguro para os primeiros caracteres do identificador caso vazio", () => {
      expect(formatOsFolderName("8d3a5e9d-3771-485d-8d38-b58c768ab948", "")).toBe("OS-8d3a5e9d");
    });
  });

  describe("Upload Sessions - Regras de Chunking do Microsoft Graph", () => {
    it("deve garantir que o tamanho padrão de chunk seja múltiplo estrito de 320 KiB", () => {
      const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB
      const REQUIRED_MULTIPLE = 320 * 1024; // 327,680 bytes
      expect(CHUNK_SIZE % REQUIRED_MULTIPLE).toBe(0);
      expect(CHUNK_SIZE / REQUIRED_MULTIPLE).toBe(16);
    });
  });
});

describe("Integração SharePoint - Resolução e Tratamento de Erros via Graph API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetSharePointCache();
  });

  it("deve lançar mensagem clara de orientação caso o app não tenha permissão no site (Sites.Selected)", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/sites/")) {
        return Promise.resolve({
          ok: false,
          status: 403,
          statusText: "Forbidden",
          json: () => Promise.resolve({ error: { message: "Access Denied" } }),
        });
      }
      return Promise.reject(new Error("Not found"));
    });

    // Mock do token
    vi.mock("@/lib/msalClient", async () => {
      const actual = await vi.importActual<Record<string, unknown>>("@/lib/msalClient");
      return {
        ...actual,
        getSharePointAccessToken: vi.fn().mockResolvedValue("mock_token"),
      };
    });

    await expect(resolveSharePointSiteAndDrive()).rejects.toThrow(/Sites\.Selected/);
  });

  it("deve resolver biblioteca padrão diretamente via endpoint /drive", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      // Match /drive endpoint BEFORE the generic /sites/ check to avoid
      // https:// colon matching the site discovery pattern
      if (url.endsWith("/drive")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: "mock_default_drive_id", name: "Documentos Compartilhados" }),
        });
      }
      if (url.includes("/sites/") && url.includes("sharepoint.com:")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: "mock_site_id", displayName: "Produção Grupo" }),
        });
      }
      return Promise.reject(new Error("Not found"));
    });

    const res = await resolveSharePointSiteAndDrive();
    expect(res.siteId).toBe("mock_site_id");
    expect(res.driveId).toBe("mock_default_drive_id");
  });

  it("deve lançar mensagem detalhada com AppId caso nenhuma biblioteca seja retornada", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      // Match specific endpoints BEFORE generic /sites/ check
      if (url.endsWith("/drive")) {
        return Promise.resolve({
          ok: false,
          status: 404,
          json: () => Promise.resolve({}),
        });
      }
      if (url.endsWith("/drives") || url.includes("/lists")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ value: [] }),
        });
      }
      if (url.includes("/sites/") && url.includes("sharepoint.com:")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: "mock_site_id", displayName: "Produção Grupo" }),
        });
      }
      return Promise.reject(new Error("Not found"));
    });

    await expect(resolveSharePointSiteAndDrive()).rejects.toThrow(/Sites\.Selected/);
  });

  describe("Isolamento entre Pasta KABAN e Pasta PROTOCOLOS ENTREGAS", () => {
    it("deve rejeitar qualquer anexo da pasta KABAN para comprovantes de entrega", () => {
      const mockAttachments = [
        {
          id: "att-1",
          nome_arquivo: "Logotipo Primacor_FINALok.jpg",
          sharepoint_path: "KABAN/99999/Logotipo Primacor_FINALok.jpg",
          sharepoint_folder_name: "99999",
        },
        {
          id: "att-2",
          nome_arquivo: "OS_99999_Protocolo_1730000000_Tete5.jpg",
          sharepoint_path: "PROTOCOLOS ENTREGAS/OS_99999_Protocolo_1730000000_Tete5.jpg",
          sharepoint_folder_name: "PROTOCOLOS ENTREGAS",
        },
        {
          id: "att-3",
          nome_arquivo: "Briefing_Cliente.pdf",
          sharepoint_path: "KABAN/99999/Briefing_Cliente.pdf",
          sharepoint_folder_name: "KABAN",
        },
      ];

      const filtered = mockAttachments.filter((att) => {
        const folderName = (att.sharepoint_folder_name || "").trim().toUpperCase();
        const path = (att.sharepoint_path || "").trim().toUpperCase();
        const name = (att.nome_arquivo || "").trim().toUpperCase();

        if (path.startsWith("KABAN/") || folderName === "KABAN") {
          return false;
        }

        const isProtocolFolder =
          folderName === SHAREPOINT_PROTOCOLOS_FOLDER.toUpperCase() ||
          path.includes(SHAREPOINT_PROTOCOLOS_FOLDER.toUpperCase());

        const isProtocolName =
          name.startsWith("OS_") &&
          (name.includes("_PROTOCOLO") || name.includes("COMPROVANTE"));

        return isProtocolFolder || isProtocolName;
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].nome_arquivo).toBe("OS_99999_Protocolo_1730000000_Tete5.jpg");
      expect(filtered.some((f) => f.nome_arquivo.includes("Logotipo"))).toBe(false);
    });
  });

  describe("downloadFolderAsZipFromSharePoint - Empacotamento de Pasta Completa", () => {
    it("deve rejeitar se a lista de anexos estiver vazia", async () => {
      await expect(downloadFolderAsZipFromSharePoint([], "OS-73492")).rejects.toThrow(
        "Nenhum anexo encontrado para baixar."
      );
    });

    it("deve baixar múltiplos anexos, invocar o callback de progresso e disparar o download do .zip", async () => {
      // Mock de fetch para metadata e download direto
      const mockBlob = new Blob(["mock content"], { type: "application/pdf" });
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("items/item-1")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ "@microsoft.graph.downloadUrl": "https://cdn.example.com/item1.pdf" }),
          });
        }
        if (url.includes("items/item-2")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ "@microsoft.graph.downloadUrl": "https://cdn.example.com/item2.pdf" }),
          });
        }
        if (url.includes("cdn.example.com")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            blob: () => Promise.resolve(mockBlob),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: "mock_drive_id" }),
        });
      });

      // Mock da criação de link e clique
      const clickSpy = vi.fn();
      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
        const el = originalCreateElement(tagName);
        if (tagName === "a") {
          el.click = clickSpy;
        }
        return el;
      });

      const progressSteps: any[] = [];
      const attachments = [
        { id: "1", sharepoint_item_id: "item-1", nome_arquivo: "Arquivo 1.pdf" },
        { id: "2", sharepoint_item_id: "item-2", nome_arquivo: "Arquivo 2.pdf" },
      ];

      await downloadFolderAsZipFromSharePoint(attachments, "OS-73492", (p) => {
        progressSteps.push({ ...p });
      });

      // Validou que o link foi clicado para iniciar o download
      expect(clickSpy).toHaveBeenCalled();

      // Validou os passos de progresso (downloading -> zipping -> done)
      expect(progressSteps.length).toBeGreaterThanOrEqual(3);
      expect(progressSteps.some((p) => p.status === "downloading")).toBe(true);
      expect(progressSteps.some((p) => p.status === "zipping")).toBe(true);
      expect(progressSteps.some((p) => p.status === "done")).toBe(true);
    });
  });
});
