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
  });
}

export function logout(accessToken: string) {
  return apiRequest<LogoutResponse>("/api/auth/logout", {
    method: "POST",
    accessToken,
  });
}

export function getCurrentUser(accessToken: string) {
  return apiRequest<CurrentUser>("/api/auth/me", {
    accessToken,
  });
}
