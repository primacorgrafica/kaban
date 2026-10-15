export interface OrderAttachment {
  id: string;
  order_id: string;
  nome_arquivo: string;
  tamanho_bytes: number;
  content_type: string | null;
  sharepoint_item_id: string;
  sharepoint_folder_id: string;
  sharepoint_folder_name: string;
  sharepoint_drive_id: string;
  sharepoint_site_id: string | null;
  sharepoint_web_url: string;
  sharepoint_path: string | null;
  status: "uploading" | "concluido" | "falha";
  criado_por: string | null;
  created_at: string;
  updated_at: string;
}

export type UploadStatus =
  | "queued"
  | "authenticating"
  | "creating_folder"
  | "uploading"
  | "saving_metadata"
  | "success"
  | "error"
  | "cancelled";

export interface PendingUploadItem {
  id: string;
  file: File;
  progress: number;
  status: UploadStatus;
  error?: string;
  abortController?: AbortController;
  uploadedAttachment?: OrderAttachment;
}

export interface SharePointFolderInfo {
  folderId: string;
  folderName: string;
  folderWebUrl: string;
  driveId: string;
  siteId: string;
}

export interface DriveItemResponse {
  id: string;
  name: string;
  size: number;
  webUrl: string;
  file?: {
    mimeType?: string;
  };
  folder?: {
    childCount?: number;
  };
  parentReference?: {
    driveId?: string;
    id?: string;
    path?: string;
  };
  "@microsoft.graph.downloadUrl"?: string;
}
