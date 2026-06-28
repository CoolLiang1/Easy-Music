import { type FormEvent, useEffect, useState } from "react";

import { AuthProvider, useAuth } from "../auth/AuthProvider";
import { RouteLink } from "../routes/RouteLink";
import { navigateTo } from "../routes/router";

type LoginPageProps = {
  isAuthenticated?: boolean;
  onUsePlaceholderSession?: () => void;
};

export function LoginPage(_props: LoginPageProps) {
  return (
    <AuthProvider restoreStoredSession={false}>
      <LoginForm />
    </AuthProvider>
  );
}

function LoginForm() {
  const { login, logout, status } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    void logout();
  }, [logout]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login({ username, password });
      navigateTo("/library");
    } catch (requestError: unknown) {
      setError(getLoginErrorMessage(requestError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="login-shell">
      <section className="login-panel" aria-labelledby="login-title">
        <p className="eyebrow">个人曲库</p>
        <h1 id="login-title">Easy Music</h1>
        <p className="page-copy">
          使用 Easy Music 服务器的管理员账号登录。
        </p>

        <form className="login-actions" onSubmit={handleSubmit}>
          <label>
            用户名
            <input
              autoComplete="username"
              disabled={isSubmitting || status === "checking"}
              name="username"
              onChange={(event) => setUsername(event.target.value)}
              required
              type="text"
              value={username}
            />
          </label>

          <label>
            密码
            <input
              autoComplete="current-password"
              disabled={isSubmitting || status === "checking"}
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>

          {error ? (
            <p className="page-copy" role="alert">
              {error}
            </p>
          ) : null}

          <div className="login-actions">
            <button
              className="button primary"
              disabled={isSubmitting || status === "checking"}
              type="submit"
            >
              {isSubmitting ? "正在登录..." : "登录"}
            </button>
            <RouteLink className="button secondary" to="/library">
              返回曲库
            </RouteLink>
          </div>
        </form>
      </section>
    </main>
  );
}

function getLoginErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "登录失败。请检查用户名和密码后重试。";
}
