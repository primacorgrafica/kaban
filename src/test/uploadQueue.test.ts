import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isRetryableGraphError,
  uploadWithResilience,
  globalUploadQueue,
} from "@/lib/autonomousEngine/uploadQueue";
import * as sharepointService from "@/lib/sharepointService";

vi.mock("@/lib/sharepointService", () => ({
  uploadFileToSharePoint: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}));

describe("Kaban Autonomous Engine - Resilient Upload Queue (Fase 4)", () => {
  const mockFolderInfo = {
    siteId: "mock-site-id",
    driveId: "mock-drive-id",
    folderId: "mock-folder-id",
    folderName: "OS-73210",
  };

  const mockFile = new File(["dummy content"], "prova_digital.pdf", {
    type: "application/pdf",
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. isRetryableGraphError deve identificar erros transitórios de rate limit e rede", () => {
    expect(isRetryableGraphError(new Error("429 Too Many Requests"))).toBe(true);
    expect(isRetryableGraphError(new Error("503 Service Unavailable"))).toBe(true);
    expect(isRetryableGraphError(new Error("Network timeout after 30000ms"))).toBe(true);
    expect(isRetryableGraphError(new Error("Erro de conexão ao servidor"))).toBe(true);

    // Erros definitivos não devem ser retentados em loop
    expect(isRetryableGraphError(new Error("401 Unauthorized"))).toBe(false);
    expect(isRetryableGraphError(new Error("404 Not Found"))).toBe(false);
  });

  it("2. uploadWithResilience deve retornar com sucesso na primeira tentativa se não houver erros", async () => {
    const mockDriveItem = { id: "item-123", name: "prova_digital.pdf", size: 1024 };
    vi.spyOn(sharepointService, "uploadFileToSharePoint").mockResolvedValueOnce(mockDriveItem as any);

    const onStatusChange = vi.fn();
    const result = await uploadWithResilience(mockFile, mockFolderInfo, {
      maxRetries: 2,
      initialBackoffMs: 10,
      onStatusChange,
    });

    expect(result).toEqual(mockDriveItem);
    expect(onStatusChange).toHaveBeenCalledWith("UPLOADING", 0);
    expect(onStatusChange).toHaveBeenCalledWith("COMPLETED", 0);
  });

  it("3. uploadWithResilience deve retentar automaticamente em falhas transitórias e ter sucesso", async () => {
    const mockDriveItem = { id: "item-recovery", name: "prova_digital.pdf", size: 1024 };

    // Primeira tentativa falha com 503; segunda tentativa tem sucesso
    vi.spyOn(sharepointService, "uploadFileToSharePoint")
      .mockRejectedValueOnce(new Error("503 Service Unavailable: Timeout no cluster"))
      .mockResolvedValueOnce(mockDriveItem as any);

    const onStatusChange = vi.fn();
    const result = await uploadWithResilience(mockFile, mockFolderInfo, {
      maxRetries: 2,
      initialBackoffMs: 10,
      onStatusChange,
    });

    expect(result).toEqual(mockDriveItem);
    expect(onStatusChange).toHaveBeenCalledWith("RETRYING", 1);
    expect(onStatusChange).toHaveBeenCalledWith("COMPLETED", 1);
  });

  it("4. uploadWithResilience deve abortar imediatamente se cancelado pelo operador", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      uploadWithResilience(mockFile, mockFolderInfo, {
        maxRetries: 3,
        initialBackoffMs: 10,
        abortSignal: controller.signal,
      })
    ).rejects.toThrow("Upload cancelado pelo operador.");
  });

  it("5. globalUploadQueue deve gerenciar enfileiramento e cancelamento de tarefas", () => {
    const uploadId = globalUploadQueue.enqueue(mockFile, mockFolderInfo);
    expect(typeof uploadId).toBe("string");
    expect(uploadId.startsWith("upload-")).toBe(true);

    globalUploadQueue.cancel(uploadId);
    const item = globalUploadQueue.getItems().find((i) => i.id === uploadId);
    expect(item?.status).toBe("CANCELLED");
  });
});
