import { useEffect, useState } from "react";

export type AppRoute =
  | { name: "login" }
  | { name: "aiAssistant" }
  | { name: "duplicates" }
  | { name: "library" }
  | { name: "upload" }
  | { name: "tags" }
  | { name: "recommendations" }
  | { name: "trackDetail"; params: { trackId: string } }
  | { name: "notFound" };

const normalizePath = (path: string) => {
  const normalized = path.replace(/\/+$/, "");
  return normalized || "/";
};

export function getRoute(path: string): AppRoute {
  const normalizedPath = normalizePath(path);

  if (normalizedPath === "/" || normalizedPath === "/library") {
    return { name: "library" };
  }

  if (normalizedPath === "/login") {
    return { name: "login" };
  }

  if (normalizedPath === "/upload") {
    return { name: "upload" };
  }

  if (normalizedPath === "/duplicates") {
    return { name: "duplicates" };
  }

  if (normalizedPath === "/tags") {
    return { name: "tags" };
  }

  if (normalizedPath === "/ai-assistant") {
    return { name: "aiAssistant" };
  }

  if (normalizedPath === "/recommendations") {
    return { name: "recommendations" };
  }

  const trackDetailMatch = normalizedPath.match(/^\/tracks\/([^/]+)$/);
  if (trackDetailMatch) {
    return {
      name: "trackDetail",
      params: { trackId: decodeURIComponent(trackDetailMatch[1]) },
    };
  }

  return { name: "notFound" };
}

export function navigateTo(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function useCurrentPath() {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const handlePathChange = () => setPath(window.location.pathname);

    window.addEventListener("popstate", handlePathChange);
    return () => window.removeEventListener("popstate", handlePathChange);
  }, []);

  return path;
}
