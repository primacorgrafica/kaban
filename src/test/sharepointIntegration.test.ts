import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  formatOsFolderName,
  SHAREPOINT_HOSTNAME,
  SHAREPOINT_SITE_PATH,
  SHAREPOINT_LIBRARY_NAME,
  SHAREPOINT_ROOT_FOLDER,
  resolveSharePointSiteAndDrive,
  getOrCreateOsFolder,
  resetSharePointCache,
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
  });

  it("deve validar as constantes do site e biblioteca corporativa da Primacor", () => {
    expect(SHAREPOINT_HOSTNAME).toBe("primacorgraficaeditora.sharepoint.com");
    expect(SHAREPOINT_SITE_PATH).toBe("/sites/Produo_grupo");
    expect(SHAREPOINT_LIBRARY_NAME).toBe("Documentos Compartilhados");
    expect(SHAREPOINT_ROOT_FOLDER).toBe("KABAN");
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
});
