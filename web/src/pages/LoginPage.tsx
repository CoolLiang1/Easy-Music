import { RouteLink } from "../routes/RouteLink";

type LoginPageProps = {
  isAuthenticated?: boolean;
  onUsePlaceholderSession?: () => void;
};

export function LoginPage({
  isAuthenticated = false,
  onUsePlaceholderSession,
}: LoginPageProps) {
  return (
    <main className="login-shell">
      <section className="login-panel" aria-labelledby="login-title">
        <p className="eyebrow">Phase 2 Web Console</p>
        <h1 id="login-title">Easy Music</h1>
        <p className="page-copy">
          Temporary route gate for the Web console. Real browser login and
          session handling are scheduled for a later Phase 2 task.
        </p>

        <div className="login-actions">
          {onUsePlaceholderSession ? (
            <button
              className="button primary"
              onClick={onUsePlaceholderSession}
              type="button"
            >
              Use placeholder session
            </button>
          ) : null}
          {isAuthenticated ? (
            <RouteLink className="button secondary" to="/library">
              Return to library
            </RouteLink>
          ) : null}
        </div>
      </section>
    </main>
  );
}
