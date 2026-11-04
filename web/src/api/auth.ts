import { apiRequest } from "./http";
import type {
  CurrentUser,
  LoginRequest,
  LogoutResponse,
  TokenResponse,
} from "../types/auth";

export function login(credentials: LoginRequest) {
  return apiRequest<TokenResponse>("/api/auth/login", {
    method: "POST",
    body: credentials,
    skipAuthRefresh: true,
  });
}

export function refreshSession(refreshToken: string) {
  return apiRequest<TokenResponse>("/api/auth/refresh", {
    method: "POST",
    body: { refresh_token: refreshToken },
    skipAuthRefresh: true,
  });
}

export function logout(refreshToken: string) {
  return apiRequest<LogoutResponse>("/api/auth/logout", {
    method: "POST",
    body: { refresh_token: refreshToken },
    skipAuthRefresh: true,
  });
}

export function getCurrentUser(accessToken: string) {
  return apiRequest<CurrentUser>("/api/auth/me", {
    accessToken,
  });
}
