import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  getCurrentUser,
  login as loginRequest,
  logout as logoutRequest,
  refreshSession,
} from "../api/auth";
import { ApiClientError, setAccessTokenRefresher } from "../api/http";
import type { CurrentUser, LoginRequest } from "../types/auth";
import {
  clearStoredTokens,
  readStoredAccessToken,
  readStoredRefreshToken,
  storeTokens,
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

const SESSION_EXPIRED_MESSAGE = "登录已过期，请重新登录。";

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
    restoreStoredSession && hasStoredSession() ? "checking" : "unauthenticated",
  );
  const pendingRefreshRef = useRef<Promise<string | null> | null>(null);

  const clearSession = useCallback(() => {
    clearStoredTokens();
    setAccessToken(null);
    setCurrentUser(null);
    setStatus("unauthenticated");
  }, []);

  // Renews the access token with the stored refresh token. Concurrent callers
  // share one request so a burst of 401s rotates the refresh token only once.
  const refreshAccessToken = useCallback(
    (expiredAccessToken: string | null): Promise<string | null> => {
      const storedAccessToken = readStoredAccessToken();
      if (
        expiredAccessToken &&
        storedAccessToken &&
        storedAccessToken !== expiredAccessToken
      ) {
        // Another request or tab already renewed the session.
        setAccessToken(storedAccessToken);
        return Promise.resolve(storedAccessToken);
      }

      if (pendingRefreshRef.current) {
        return pendingRefreshRef.current;
      }

      const refreshToken = readStoredRefreshToken();
      if (!refreshToken) {
        clearSession();
        setError(SESSION_EXPIRED_MESSAGE);
        return Promise.resolve(null);
      }

      const pending = refreshSession(refreshToken)
        .then((tokens) => {
          storeTokens(tokens.access_token, tokens.refresh_token);
          setAccessToken(tokens.access_token);
          return tokens.access_token;
        })
        .catch((requestError: unknown) => {
          if (isUnauthorized(requestError)) {
            clearSession();
            setError(SESSION_EXPIRED_MESSAGE);
          }
          // Network or server errors keep the stored session for a later retry.
          return null;
        })
        .finally(() => {
          pendingRefreshRef.current = null;
        });

      pendingRefreshRef.current = pending;
      return pending;
    },
    [clearSession],
  );

  useEffect(() => {
    if (!restoreStoredSession) {
      return;
    }

    return setAccessTokenRefresher(refreshAccessToken);
  }, [refreshAccessToken, restoreStoredSession]);

  useEffect(() => {
    if (!restoreStoredSession) {
      return;
    }

    const storedToken = readStoredAccessToken();

    if (!hasStoredSession()) {
      clearSession();
      return;
    }

    let isActive = true;
    setStatus("checking");
    setError(null);

    const tokenPromise = storedToken
      ? Promise.resolve<string | null>(storedToken)
      : refreshAccessToken(null);

    tokenPromise
      .then((token) => {
        if (!token) {
          throw new Error(SESSION_EXPIRED_MESSAGE);
        }

        // A 401 here is renewed transparently by apiRequest.
        return getCurrentUser(token);
      })
      .then((user) => {
        if (!isActive) {
          return;
        }

        setAccessToken(readStoredAccessToken());
        setCurrentUser(user);
        setStatus("authenticated");
      })
      .catch((requestError: unknown) => {
        if (!isActive) {
          return;
        }

        if (isUnauthorized(requestError) || !hasStoredSession()) {
          clearSession();
        } else {
          // Server unreachable: keep the stored tokens so a reload can resume.
          setAccessToken(null);
          setCurrentUser(null);
          setStatus("unauthenticated");
        }
        setError(getErrorMessage(requestError));
      });

    return () => {
      isActive = false;
    };
  }, [clearSession, refreshAccessToken, restoreStoredSession]);

  const login = useCallback(async (credentials: LoginRequest) => {
    setError(null);

    try {
      const tokenResponse = await loginRequest(credentials);
      storeTokens(tokenResponse.access_token, tokenResponse.refresh_token);

      const user = await getCurrentUser(tokenResponse.access_token);
      setAccessToken(readStoredAccessToken());
      setCurrentUser(user);
      setStatus("authenticated");
    } catch (requestError) {
      clearSession();
      throw requestError;
    }
  }, [clearSession]);

  const logout = useCallback(async () => {
    const refreshToken = readStoredRefreshToken();
    clearSession();
    setError(null);

    if (!refreshToken) {
      return;
    }

    try {
      await logoutRequest(refreshToken);
    } catch {
      // Local logout should still complete if the server is unreachable.
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

function hasStoredSession() {
  return Boolean(readStoredAccessToken() || readStoredRefreshToken());
}

function isUnauthorized(error: unknown) {
  return error instanceof ApiClientError && error.status === 401;
}
