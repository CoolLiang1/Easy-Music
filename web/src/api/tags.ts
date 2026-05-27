import { apiRequest } from "./http";
import type { Tag, TagCreate, TagUpdate } from "../types/tag";

export function listTags(accessToken: string) {
  return apiRequest<Tag[]>("/api/tags", {
    accessToken,
  });
}

export function createTag(accessToken: string, payload: TagCreate) {
  return apiRequest<Tag>("/api/tags", {
    method: "POST",
    accessToken,
    body: payload,
  });
}

export function updateTag(
  accessToken: string,
  tagId: number | string,
  payload: TagUpdate,
) {
  return apiRequest<Tag>(`/api/tags/${encodeURIComponent(tagId)}`, {
    method: "PATCH",
    accessToken,
    body: payload,
  });
}

export function deleteTag(accessToken: string, tagId: number | string) {
  return apiRequest<void>(`/api/tags/${encodeURIComponent(tagId)}`, {
    method: "DELETE",
    accessToken,
  });
}
