import type { ReactNode } from "react";

import { LoginPage } from "../pages/LoginPage";

type ProtectedRouteProps = {
  children: ReactNode;
  isAuthenticated: boolean;
  onUsePlaceholderSession: () => void;
};

export function ProtectedRoute({
  children,
  isAuthenticated,
  onUsePlaceholderSession,
}: ProtectedRouteProps) {
  if (!isAuthenticated) {
    return (
      <LoginPage
        isAuthenticated={false}
        onUsePlaceholderSession={onUsePlaceholderSession}
      />
    );
  }

  return children;
}
