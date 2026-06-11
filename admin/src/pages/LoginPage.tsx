import { useEffect, useState } from "react";
import type { SyntheticEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

export function LoginPage() {
  const navigate = useNavigate();
  const { authenticated, loading: authLoading, signIn } = useAuth();

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && authenticated) {
      navigate("/", { replace: true });
    }
  }, [authenticated, authLoading, navigate]);

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");

    if (!login.trim() || !password) {
      setError("Введіть логін і пароль");
      return;
    }

    setLoading(true);

    try {
      await signIn({
        login: login.trim(),
        password,
      });

      navigate("/");
    } catch {
      setError("Невірний логін або пароль");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-logo">ОХ</div>

        <h1>Бортовий журнал</h1>
        <p>Вхід до адмін-панелі</p>

        <label>
          Логін
          <input
            value={login}
            onChange={(event) => setLogin(event.target.value)}
            placeholder="Введіть логін"
            autoComplete="username"
          />
        </label>

        <label>
          Пароль
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Введіть пароль"
            type="password"
            autoComplete="current-password"
          />
        </label>

        {error && <div className="form-error">{error}</div>}

        <button disabled={loading || authLoading}>
          {loading ? "Вхід..." : "Увійти"}
        </button>
      </form>
    </div>
  );
}
