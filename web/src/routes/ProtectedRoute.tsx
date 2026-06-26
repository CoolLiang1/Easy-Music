import { useEffect } from "react";
import type { ReactNode } from "react";

import { AuthProvider, useAuth } from "../auth/AuthProvider";
import { PlaybackQueueProvider } from "../player/PlaybackQueueProvider";
import { navigateTo } from "./router";

type ProtectedRouteProps = {
  children: ReactNode;
  isAuthenticated: boolean;
  onUsePlaceholderSession: () => void;
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
      <main className="login-shell">
        <section className="login-panel" aria-live="polite">
          <p className="eyebrow">Easy Music</p>
          <h1>Checking session</h1>
          <p className="page-copy">
            Your saved browser session is being verified.
          </p>
        </section>
      </main>
    );
  }

  if (status === "unauthenticated") {
    return null;
  }

  return <PlaybackQueueProvider>{children}</PlaybackQueueProvider>;
}
