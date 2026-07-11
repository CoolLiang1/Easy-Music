import { apiRequest } from "./http";
import type {
  LibraryOrganizationReport,
  StorageConsistencyReport,
} from "../types/libraryReport";

export function getLibraryOrganizationReport(accessToken: string) {
  return apiRequest<LibraryOrganizationReport>("/api/library/reports", {
    accessToken,
  });
}

export function getStorageConsistencyReport(accessToken: string) {
  return apiRequest<StorageConsistencyReport>("/api/library/storage-consistency", {
    accessToken,
  });
}
