import { Link } from "react-router-dom";

export function AccessDeniedPage() {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Немає доступу</h1>
          <p>У вашого облікового запису немає прав для перегляду цього розділу.</p>
        </div>
      </div>

      <div className="page-card">
        <div className="empty-state">
          <strong>Доступ обмежено</strong>
          <p>
            Зверніться до головного адміністратора, якщо вам потрібен доступ до
            цього розділу, міста або підрозділу.
          </p>
          <Link className="secondary-button" to="/">
            На головну
          </Link>
        </div>
      </div>
    </div>
  );
}
