import { useState } from "react";
import type { SyntheticEvent } from "react";
import { useNavigate } from "react-router-dom";
import { loginAdmin } from "../api/auth.api";

export function LoginPage() {
  const navigate = useNavigate();

  const [login, setLogin] = useState("admin");
  const [password, setPassword] = useState("admin12345");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      const response = await loginAdmin({
        login,
        password,
      });

      localStorage.setItem("admin_access_token", response.accessToken);
      navigate("/");
    } catch (err) {
      setError("Неверный логин или пароль");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-logo">Ж</div>

        <h1>Бортовой журнал</h1>
        <p>Вход в админ-панель</p>

        <label>
          Логин
          <input
            value={login}
            onChange={(event) => setLogin(event.target.value)}
            placeholder="Введите логин"
            autoComplete="username"
          />
        </label>

        <label>
          Пароль
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Введите пароль"
            type="password"
            autoComplete="current-password"
          />
        </label>

        {error && <div className="form-error">{error}</div>}

        <button disabled={loading}>
          {loading ? "Вход..." : "Войти"}
        </button>
      </form>
    </div>
  );
}