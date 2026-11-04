import { useEffect } from "react";
import type { ReactNode } from "react";

import { AuthProvider, useAuth } from "../auth/AuthProvider";
import { PlaybackQueueProvider } from "../player/PlaybackQueueProvider";
import { navigateTo } from "./router";

type ProtectedRouteProps = {
  children: ReactNode;
};

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  return (
    <AuthProvider>
      <ProtectedRouteContent>{children}</ProtectedRouteContent>
    </AuthProvider>
  );
}

function ProtectedRouteContent({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  useEffect(() => {
    if (status === "unauthenticated") {
      navigateTo("/login");
    }
  }, [status]);

  if (status === "checking") {
    return (
      <main aria-live="polite" className="center-screen">
        <div className="row">
          <span aria-hidden="true" className="spinner" />
          <span>正在验证登录状态…</span>
        </div>
      </main>
    );
  }

  if (status === "unauthenticated") {
    return null;
  }

  return <PlaybackQueueProvider>{children}</PlaybackQueueProvider>;
}
