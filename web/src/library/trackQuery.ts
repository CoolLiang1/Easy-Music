import type { TrackQuery, TrackSortField, TrackSortOrder } from "../types/track";

export const LIBRARY_PAGE_SIZE = 25;

export type LibraryQueryState = {
  search: string;
  status: string;
  liked: "" | "true" | "false";
  contentType: string;
  tagId: number | null;
  sort: TrackSortField;
  order: TrackSortOrder;
  offset: number;
};

export const DEFAULT_LIBRARY_QUERY: LibraryQueryState = {
  search: "",
  status: "",
  liked: "",
  contentType: "",
  tagId: null,
  sort: "created_at",
  order: "asc",
  offset: 0,
};

export function toTrackQuery(state: LibraryQueryState): TrackQuery {
  return {
    q: state.search.trim() || undefined,
    statuses: state.status ? [state.status] : undefined,
    liked: state.liked === "" ? undefined : state.liked === "true",
    contentTypes: state.contentType ? [state.contentType] : undefined,
    tagIds: state.tagId === null ? undefined : [state.tagId],
    sort: state.sort,
    order: state.order,
    limit: LIBRARY_PAGE_SIZE,
    offset: state.offset,
  };
}

export function activeLibraryFilterCount(state: LibraryQueryState): number {
  return [
    state.search.trim(),
    state.status,
    state.liked,
    state.contentType,
    state.tagId,
  ].filter((value) => value !== "" && value !== null).length;
}

export function normalizeLibraryOffset(total: number, offset: number): number {
  if (total <= 0) return 0;
  return Math.min(
    Math.max(0, offset),
    Math.floor((total - 1) / LIBRARY_PAGE_SIZE) * LIBRARY_PAGE_SIZE,
  );
}
