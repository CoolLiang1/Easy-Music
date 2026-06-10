import { apiRequest } from "./http";
import type {
  ImportBatchResponse,
  ImportConfigurationResponse,
  ImportConfirmRequest,
  ImportConfirmResponse,
  ImportScanRequest,
  ImportScanResponse,
} from "../types/imports";

export function getImportConfiguration(accessToken: string) {
  return apiRequest<ImportConfigurationResponse>("/api/imports/configuration", {
    accessToken,
  });
}

export function scanImportDirectory(
  accessToken: string,
  payload: ImportScanRequest,
) {
  return apiRequest<ImportScanResponse>("/api/imports/scan", {
    accessToken,
    body: payload,
    method: "POST",
  });
}

export function confirmAudioImport(
  accessToken: string,
  payload: ImportConfirmRequest,
) {
  return apiRequest<ImportConfirmResponse>("/api/imports", {
    accessToken,
    body: payload,
    method: "POST",
  });
}

export function getLatestImportBatch(accessToken: string) {
  return apiRequest<ImportBatchResponse | null>("/api/imports/batches/latest", {
    accessToken,
  });
}

export function getImportBatch(accessToken: string, batchId: number | string) {
  return apiRequest<ImportBatchResponse>(
    `/api/imports/batches/${encodeURIComponent(batchId)}`,
    {
      accessToken,
    },
  );
}
