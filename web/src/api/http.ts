import { env } from "../config/env";

export type ApiRequestOptions = {
  accessToken?: string | null;
  /** Set for auth endpoints so a 401 never triggers another refresh. */
  skipAuthRefresh?: boolean;
  body?: BodyInit | Record<string, unknown> | null;
  headers?: HeadersInit;
  method?: string;
};

export type ApiErrorPayload = {
  detail?: unknown;
  message?: unknown;
};

export class ApiClientError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.payload = payload;
  }
}

/**
 * Exchanges an expired access token for a new one. Installed by AuthProvider;
 * resolves to null when the session cannot be renewed.
 */
export type AccessTokenRefresher = (expiredAccessToken: string) => Promise<string | null>;

let accessTokenRefresher: AccessTokenRefresher | null = null;

/** Installs the refresher and returns a function that uninstalls it. */
export function setAccessTokenRefresher(refresher: AccessTokenRefresher) {
  accessTokenRefresher = refresher;

  return () => {
    if (accessTokenRefresher === refresher) {
      accessTokenRefresher = null;
    }
  };
}

/** Returns a renewed access token after a 401, or null if renewal failed. */
export async function refreshExpiredAccessToken(expiredAccessToken: string) {
  if (!accessTokenRefresher) {
    return null;
  }

  return accessTokenRefresher(expiredAccessToken);
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  let response = await sendRequest(path, options, options.accessToken);

  if (
    response.status === 401 &&
    options.accessToken &&
    !options.skipAuthRefresh
  ) {
    const renewedAccessToken = await refreshExpiredAccessToken(options.accessToken);
    if (renewedAccessToken) {
      response = await sendRequest(path, options, renewedAccessToken);
    }
  }

  if (!response.ok) {
    const payload = await parseResponseBody(response);
    throw new ApiClientError(
      getErrorMessage(payload, response.statusText),
      response.status,
      payload,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await parseResponseBody(response)) as T;
}

function sendRequest(
  path: string,
  options: ApiRequestOptions,
  accessToken: string | null | undefined,
) {
  const headers = new Headers(options.headers);
  const body = buildBody(options.body, headers);

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  return fetch(buildUrl(path), {
    method: options.method ?? "GET",
    headers,
    body,
  });
}

function buildBody(
  body: ApiRequestOptions["body"],
  headers: Headers,
): BodyInit | null | undefined {
  if (body === undefined || body === null) {
    return body;
  }

  if (body instanceof FormData) {
    return body;
  }

  if (body instanceof Blob || body instanceof ArrayBuffer) {
    return body;
  }

  if (typeof body === "string" || body instanceof URLSearchParams) {
    return body;
  }

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return JSON.stringify(body);
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("Content-Type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return text || null;
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (isApiErrorPayload(payload)) {
    if (typeof payload.detail === "string") {
      return payload.detail;
    }

    if (typeof payload.message === "string") {
      return payload.message;
    }
  }

  return fallback || "请求失败。";
}

function isApiErrorPayload(payload: unknown): payload is ApiErrorPayload {
  return typeof payload === "object" && payload !== null;
}

function buildUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${env.apiBaseUrl}${normalizedPath}`;
}
