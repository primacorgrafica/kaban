/**
 * Kaban Autonomous Engine - Resilient SharePoint Upload Queue & Retry Manager (Fase 4)
 *
 * Provê resiliência transacional, recuperação automática com exponential backoff,
 * telemetria e prevenção de perda de dados em oscilações da Microsoft Graph API.
 */

import { uploadFileToSharePoint } from "@/lib/sharepointService";
import { trackGraphApiTelemetry } from "./telemetry";
import type { DriveItemResponse, SharePointFolderInfo } from "@/types/sharepoint";

export type UploadItemStatus =
  | "QUEUED"
  | "UPLOADING"
  | "RETRYING"
  | "SAVING_METADATA"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface ResilientUploadItem {
  id: string;
  file: File;
  folderInfo: SharePointFolderInfo;
  status: UploadItemStatus;
  progress: number;
  retryCount: number;
  maxRetries: number;
  error: string | null;
  driveItem: DriveItemResponse | null;
  abortController?: AbortController;
  createdAt: number;
}

export interface UploadOptions {
  maxRetries?: number;
  initialBackoffMs?: number;
  onProgress?: (percent: number) => void;
  onStatusChange?: (status: UploadItemStatus, attempt: number) => void;
  abortSignal?: AbortSignal;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_BACKOFF_MS = 1000;

/**
 * Avalia se o erro retornado pela Graph API é transitório e elegível para retentativa
 */
export function isRetryableGraphError(error: any): boolean {
  if (!error) return false;
  const msg = (error.message || String(error)).toLowerCase();

  // Rate limiting (429), timeouts ou falhas transitórias de infraestrutura (503/504)
  if (
    msg.includes("429") ||
    msg.includes("too many requests") ||
    msg.includes("503") ||
    msg.includes("service unavailable") ||
    msg.includes("504") ||
    msg.includes("gateway timeout") ||
    msg.includes("timeout") ||
    msg.includes("network") ||
    msg.includes("fetch failed") ||
    msg.includes("conexão") ||
    msg.includes("connection")
  ) {
    return true;
  }

  return false;
}

/**
 * Executa o upload com retentativas automáticas e exponential backoff
 */
export async function uploadWithResilience(
  file: File,
  folderInfo: SharePointFolderInfo,
  options: UploadOptions = {}
): Promise<DriveItemResponse> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const initialBackoff = options.initialBackoffMs ?? DEFAULT_INITIAL_BACKOFF_MS;
  const startTime = performance.now();

  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      if (options.abortSignal?.aborted) {
        throw new Error("Upload cancelado pelo operador.");
      }

      if (attempt > 0) {
        options.onStatusChange?.("RETRYING", attempt);
      } else {
        options.onStatusChange?.("UPLOADING", attempt);
      }

      const driveItem = await uploadFileToSharePoint(
        file,
        folderInfo,
        options.onProgress,
        options.abortSignal
      );

      const durationMs = performance.now() - startTime;
      trackGraphApiTelemetry("SHAREPOINT_UPLOAD", true, durationMs);
      options.onStatusChange?.("COMPLETED", attempt);
      return driveItem;
    } catch (err: any) {
      attempt++;
      const isAbort = options.abortSignal?.aborted || err?.message?.includes("cancelado");

      if (isAbort || attempt > maxRetries || !isRetryableGraphError(err)) {
        const durationMs = performance.now() - startTime;
        trackGraphApiTelemetry(
          "SHAREPOINT_UPLOAD",
          false,
          durationMs,
          err?.message || "Falha definitiva no upload"
        );
        options.onStatusChange?.(isAbort ? "CANCELLED" : "FAILED", attempt);
        throw err;
      }

      // Exponential backoff com jitter suave: 1s, 2s, 4s...
      const backoffDelay = initialBackoff * Math.pow(2, attempt - 1) + Math.random() * 250;
      console.warn(
        `[AutonomousEngine:UploadQueue] Tentativa ${attempt}/${maxRetries} falhou com erro transitório (${err.message}). Nova tentativa em ${Math.round(backoffDelay)}ms...`
      );

      await new Promise((resolve) => setTimeout(resolve, backoffDelay));
    }
  }

  throw new Error(`Falha no upload após ${maxRetries} tentativas.`);
}

/**
 * Gerenciador centralizado de fila de uploads resilientes
 */
class ResilientUploadQueueManager {
  private queue = new Map<string, ResilientUploadItem>();
  private activeWorkers = 0;
  private maxConcurrency = 2; // Máximo de 2 uploads paralelos para preservar banda e evitar HTTP 429
  private listeners = new Set<(items: ResilientUploadItem[]) => void>();

  public subscribe(callback: (items: ResilientUploadItem[]) => void): () => void {
    this.listeners.add(callback);
    callback(this.getItems());
    return () => this.listeners.delete(callback);
  }

  private notify() {
    const items = this.getItems();
    this.listeners.forEach((cb) => {
      try {
        cb(items);
      } catch (err) {
        console.error("[UploadQueueManager] Erro no listener:", err);
      }
    });
  }

  public getItems(): ResilientUploadItem[] {
    return Array.from(this.queue.values()).sort((a, b) => a.createdAt - b.createdAt);
  }

  public enqueue(
    file: File,
    folderInfo: SharePointFolderInfo,
    maxRetries = DEFAULT_MAX_RETRIES
  ): string {
    const id = `upload-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const item: ResilientUploadItem = {
      id,
      file,
      folderInfo,
      status: "QUEUED",
      progress: 0,
      retryCount: 0,
      maxRetries,
      error: null,
      driveItem: null,
      abortController: new AbortController(),
      createdAt: Date.now(),
    };

    this.queue.set(id, item);
    this.notify();
    void this.processNext();
    return id;
  }

  public cancel(id: string): void {
    const item = this.queue.get(id);
    if (!item) return;

    if (item.abortController && !item.abortController.signal.aborted) {
      item.abortController.abort();
    }
    item.status = "CANCELLED";
    this.notify();
  }

  public clearCompleted(): void {
    for (const [id, item] of this.queue.entries()) {
      if (item.status === "COMPLETED" || item.status === "CANCELLED") {
        this.queue.delete(id);
      }
    }
    this.notify();
  }

  private async processNext(): Promise<void> {
    if (this.activeWorkers >= this.maxConcurrency) return;

    const queuedItem = Array.from(this.queue.values()).find((i) => i.status === "QUEUED");
    if (!queuedItem) return;

    this.activeWorkers++;
    queuedItem.status = "UPLOADING";
    this.notify();

    try {
      const driveItem = await uploadWithResilience(queuedItem.file, queuedItem.folderInfo, {
        maxRetries: queuedItem.maxRetries,
        abortSignal: queuedItem.abortController?.signal,
        onProgress: (percent) => {
          queuedItem.progress = percent;
          this.notify();
        },
        onStatusChange: (newStatus, attempt) => {
          queuedItem.status = newStatus;
          queuedItem.retryCount = attempt;
          this.notify();
        },
      });

      queuedItem.driveItem = driveItem;
      queuedItem.status = "COMPLETED";
      queuedItem.progress = 100;
    } catch (err: any) {
      queuedItem.status = queuedItem.abortController?.signal.aborted ? "CANCELLED" : "FAILED";
      queuedItem.error = err?.message || "Falha no upload";
    } finally {
      this.activeWorkers--;
      this.notify();
      void this.processNext();
    }
  }
}

export const globalUploadQueue = new ResilientUploadQueueManager();
