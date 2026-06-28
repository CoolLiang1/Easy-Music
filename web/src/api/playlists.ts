import { apiRequest } from "./http";
import type {
  Playlist,
  PlaylistCreate,
  PlaylistReorder,
  PlaylistSummary,
  PlaylistTrackAdd,
  PlaylistUpdate,
} from "../types/playlist";

export function listPlaylists(accessToken: string) {
  return apiRequest<PlaylistSummary[]>("/api/playlists", {
    accessToken,
  });
}

export function createPlaylist(accessToken: string, payload: PlaylistCreate) {
  return apiRequest<Playlist>("/api/playlists", {
    method: "POST",
    accessToken,
    body: payload,
  });
}

export function getPlaylist(accessToken: string, playlistId: number | string) {
  return apiRequest<Playlist>(`/api/playlists/${encodeURIComponent(playlistId)}`, {
    accessToken,
  });
}

export function updatePlaylist(
  accessToken: string,
  playlistId: number | string,
  payload: PlaylistUpdate,
) {
  return apiRequest<Playlist>(`/api/playlists/${encodeURIComponent(playlistId)}`, {
    method: "PATCH",
    accessToken,
    body: payload,
  });
}

export function deletePlaylist(accessToken: string, playlistId: number | string) {
  return apiRequest<void>(`/api/playlists/${encodeURIComponent(playlistId)}`, {
    method: "DELETE",
    accessToken,
  });
}

export function addPlaylistTrack(
  accessToken: string,
  playlistId: number | string,
  payload: PlaylistTrackAdd,
) {
  return apiRequest<Playlist>(
    `/api/playlists/${encodeURIComponent(playlistId)}/tracks`,
    {
      method: "POST",
      accessToken,
      body: payload,
    },
  );
}

export function removePlaylistTrack(
  accessToken: string,
  playlistId: number | string,
  trackId: number | string,
) {
  return apiRequest<Playlist>(
    `/api/playlists/${encodeURIComponent(playlistId)}/tracks/${encodeURIComponent(trackId)}`,
    {
      method: "DELETE",
      accessToken,
    },
  );
}

export function reorderPlaylistTracks(
  accessToken: string,
  playlistId: number | string,
  payload: PlaylistReorder,
) {
  return apiRequest<Playlist>(
    `/api/playlists/${encodeURIComponent(playlistId)}/tracks/order`,
    {
      method: "PUT",
      accessToken,
      body: payload,
    },
  );
}
