import { apiRequest } from "./http";
import type { LibraryOrganizationReport } from "../types/libraryReport";

export function getLibraryOrganizationReport(accessToken: string) {
  return apiRequest<LibraryOrganizationReport>("/api/library/reports", {
    accessToken,
  });
}
