import { type FormEvent, useEffect, useId, useState } from "react";

import { ApiClientError } from "../api/http";
import { AuthProvider, useAuth } from "../auth/AuthProvider";
import { Callout } from "../components/ui/common";
import { Icon } from "../components/ui/Icon";
import { navigateTo } from "../routes/router";

export function LoginPage() {
  return (
    <AuthProvider restoreStoredSession={false}>
      <LoginForm />
    </AuthProvider>
  );
}

function LoginForm() {
  const { login, logout, status } = useAuth();
  const usernameId = useId();
  const passwordId = useId();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
      await login({ username: username.trim(), password });
      navigateTo("/library");
    } catch (requestError: unknown) {
      setError(getLoginErrorMessage(requestError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const disabled = isSubmitting || status === "checking";

  return (
    <main className="login-screen">
      <section aria-labelledby="login-title" className="login-card">
        <div className="login-brand">
          <img alt="" src="/icons/pwa-192x192.png" />
          <div>
            <h1 id="login-title">Easy Music</h1>
            <p>登录你的私人曲库</p>
          </div>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="field" htmlFor={usernameId}>
            <span className="field-label">用户名</span>
            <input
              autoComplete="username"
              autoFocus
              className="input"
              disabled={disabled}
              id={usernameId}
              name="username"
              onChange={(event) => setUsername(event.target.value)}
              required
              type="text"
              value={username}
            />
          </label>

          <label className="field" htmlFor={passwordId}>
            <span className="field-label">密码</span>
            <span className="password-box">
              <input
                autoComplete="current-password"
                className="input"
                disabled={disabled}
                id={passwordId}
                name="password"
                onChange={(event) => setPassword(event.target.value)}
                required
                type={showPassword ? "text" : "password"}
                value={password}
              />
              <button
                aria-label={showPassword ? "隐藏密码" : "显示密码"}
                aria-pressed={showPassword}
                className="icon-btn"
                onClick={() => setShowPassword((current) => !current)}
                type="button"
              >
                <Icon name={showPassword ? "eyeOff" : "eye"} size={17} />
              </button>
            </span>
          </label>

          {error ? <Callout tone="danger">{error}</Callout> : null}

          <button className="btn btn-primary btn-lg btn-block" disabled={disabled} type="submit">
            {isSubmitting ? (
              <>
                <span aria-hidden="true" className="spinner" />
                正在登录…
              </>
            ) : (
              "登录"
            )}
          </button>
        </form>

        <p className="login-foot">使用服务器上创建的管理员账号登录</p>
      </section>
    </main>
  );
}

function getLoginErrorMessage(error: unknown) {
  if (error instanceof ApiClientError && (error.status === 400 || error.status === 401)) {
    return "用户名或密码不正确。";
  }

  if (error instanceof TypeError) {
    return "无法连接服务器，请确认后端正在运行。";
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "登录失败。请检查用户名和密码后重试。";
}
