import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  getCurrentUser,
  login as loginRequest,
  logout as logoutRequest,
} from "../api/auth";
import type { CurrentUser, LoginRequest } from "../types/auth";
import {
  clearStoredAccessToken,
  readStoredAccessToken,
  storeAccessToken,
} from "./storage";

type AuthStatus = "checking" | "authenticated" | "unauthenticated";

type AuthContextValue = {
  accessToken: string | null;
  currentUser: CurrentUser | null;
  error: string | null;
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  status: AuthStatus;
};

const AuthContext = createContext<AuthContextValue | null>(null);

type AuthProviderProps = {
  children: ReactNode;
  restoreStoredSession?: boolean;
};

export function AuthProvider({
  children,
  restoreStoredSession = true,
}: AuthProviderProps) {
  const [accessToken, setAccessToken] = useState<string | null>(() =>
    restoreStoredSession ? readStoredAccessToken() : null,
  );
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>(() =>
    restoreStoredSession && readStoredAccessToken()
      ? "checking"
      : "unauthenticated",
  );

  const clearSession = useCallback(() => {
    clearStoredAccessToken();
    setAccessToken(null);
    setCurrentUser(null);
    setStatus("unauthenticated");
  }, []);

  useEffect(() => {
    if (!restoreStoredSession) {
      return;
    }

    const storedToken = readStoredAccessToken();

    if (!storedToken) {
      clearSession();
      return;
    }

    let isActive = true;
    setStatus("checking");
    setError(null);

    getCurrentUser(storedToken)
      .then((user) => {
        if (!isActive) {
          return;
        }

        setAccessToken(storedToken);
        setCurrentUser(user);
        setStatus("authenticated");
      })
      .catch((requestError: unknown) => {
        if (!isActive) {
          return;
        }

        clearSession();
        setError(getErrorMessage(requestError));
      });

    return () => {
      isActive = false;
    };
  }, [clearSession, restoreStoredSession]);

  const login = useCallback(async (credentials: LoginRequest) => {
    setError(null);

    try {
      const tokenResponse = await loginRequest(credentials);
      storeAccessToken(tokenResponse.access_token);

      const user = await getCurrentUser(tokenResponse.access_token);
      setAccessToken(tokenResponse.access_token);
      setCurrentUser(user);
      setStatus("authenticated");
    } catch (requestError) {
      clearSession();
      throw requestError;
    }
  }, [clearSession]);

  const logout = useCallback(async () => {
    const token = readStoredAccessToken();
    clearSession();
    setError(null);

    if (!token) {
      return;
    }

    try {
      await logoutRequest(token);
    } catch {
      // Local logout should still complete if the token is already expired.
    }
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      accessToken,
      currentUser,
      error,
      login,
      logout,
      status,
    }),
    [accessToken, currentUser, error, login, logout, status],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error("useAuth must be used within AuthProvider.");
  }

  return value;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "请求失败。";
}
