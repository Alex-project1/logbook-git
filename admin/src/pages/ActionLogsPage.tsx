import { useEffect, useState } from "react";
import {
  getAdminActionLogs,
} from "../api/action-logs.api";
import type {
  AdminActionLogFilters,
  AdminActionLogsResponse,
} from "../api/action-logs.api";

const defaultFilters: AdminActionLogFilters = {
  page: 1,
  pageSize: 20,
};

const actionLabels: Record<string, string> = {
  CREATE_SHIFT: "Створення зміни",
  UPDATE_SHIFT: "Редагування зміни",
  DELETE_SHIFT: "Видалення зміни",
  RESTORE_SHIFT: "Відновлення зміни",

  CREATE_DUTY_POST: "Створення поста",
  UPDATE_DUTY_POST: "Редагування поста",
  DELETE_DUTY_POST: "Видалення поста",
  RESTORE_DUTY_POST: "Відновлення поста",

  CREATE_POST_DUTY: "Створення чергування на посту",
  UPDATE_POST_DUTY: "Редагування чергування на посту",
  DELETE_POST_DUTY: "Видалення чергування на посту",
  RESTORE_POST_DUTY: "Відновлення чергування на посту",
};

const entityTypeLabels: Record<string, string> = {
  SHIFT: "Зміна",
  DUTY_POST: "Пост",
  POST_DUTY: "Чергування на посту",
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getActionLabel(action: string) {
  return actionLabels[action] ?? action;
}

function getEntityTypeLabel(entityType: string) {
  return entityTypeLabels[entityType] ?? entityType;
}

export function ActionLogsPage() {
  const [filters, setFilters] =
    useState<AdminActionLogFilters>(defaultFilters);

  const [report, setReport] = useState<AdminActionLogsResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const rows = report?.data ?? [];
  const pagination = report?.pagination;

  async function loadLogs(nextFilters = filters) {
    setLoading(true);
    setError("");

    try {
      const data = await getAdminActionLogs(nextFilters);
      setReport(data);
    } catch {
      setError("Не вдалося завантажити журнал дій");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLogs(defaultFilters);
  }, []);

  function updateFilter<Key extends keyof AdminActionLogFilters>(
    key: Key,
    value: AdminActionLogFilters[Key]
  ) {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
      page: key === "page" ? (value as number) : 1,
    }));
  }

  async function handleApply() {
    const nextFilters: AdminActionLogFilters = {
      ...filters,
      page: 1,
    };

    setFilters(nextFilters);
    await loadLogs(nextFilters);
  }

  async function handleReset() {
    setFilters(defaultFilters);
    await loadLogs(defaultFilters);
  }

  async function handlePageChange(page: number) {
    const nextFilters: AdminActionLogFilters = {
      ...filters,
      page,
    };

    setFilters(nextFilters);
    await loadLogs(nextFilters);
  }

  async function handlePageSizeChange(pageSize: number) {
    const nextFilters: AdminActionLogFilters = {
      ...filters,
      page: 1,
      pageSize,
    };

    setFilters(nextFilters);
    await loadLogs(nextFilters);
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Журнал дій</h1>
          <p>Історія дій зі змінами, постами та чергуваннями на постах</p>
        </div>
      </div>

      <div className="panel-card report-filters">
        <div className="action-logs-filters-grid">
          <label className="field">
            <span>Дата від</span>
            <input
              type="date"
              value={filters.dateFrom ?? ""}
              onChange={(event) =>
                updateFilter("dateFrom", event.target.value || undefined)
              }
            />
          </label>

          <label className="field">
            <span>Дата до</span>
            <input
              type="date"
              value={filters.dateTo ?? ""}
              onChange={(event) =>
                updateFilter("dateTo", event.target.value || undefined)
              }
            />
          </label>

          <label className="field">
            <span>Дія</span>
            <select
              value={filters.action ?? ""}
              onChange={(event) =>
                updateFilter("action", event.target.value || undefined)
              }
            >
              <option value="">Усі дії</option>

              <option value="CREATE_SHIFT">Створення зміни</option>
              <option value="UPDATE_SHIFT">Редагування зміни</option>
              <option value="DELETE_SHIFT">Видалення зміни</option>
              <option value="RESTORE_SHIFT">Відновлення зміни</option>

              <option value="CREATE_DUTY_POST">Створення поста</option>
              <option value="UPDATE_DUTY_POST">Редагування поста</option>
              <option value="DELETE_DUTY_POST">Видалення поста</option>
              <option value="RESTORE_DUTY_POST">Відновлення поста</option>

              <option value="CREATE_POST_DUTY">Створення чергування на посту</option>
              <option value="UPDATE_POST_DUTY">Редагування чергування на посту</option>
              <option value="DELETE_POST_DUTY">Видалення чергування на посту</option>
              <option value="RESTORE_POST_DUTY">Відновлення чергування на посту</option>
            </select>
          </label>

          <label className="field">
            <span>Тип об’єкта</span>
            <select
              value={filters.entityType ?? ""}
              onChange={(event) =>
                updateFilter("entityType", event.target.value || undefined)
              }
            >
              <option value="">Усі об’єкти</option>
              <option value="SHIFT">Зміни</option>
              <option value="DUTY_POST">Пости</option>
              <option value="POST_DUTY">Чергування на постах</option>
            </select>
          </label>

          <label className="field">
            <span>ID об’єкта</span>
            <input
              type="number"
              value={filters.entityId ?? ""}
              onChange={(event) =>
                updateFilter("entityId", Number(event.target.value) || undefined)
              }
              placeholder="Наприклад 125"
            />
          </label>

          <label className="field">
            <span>Пошук</span>
            <input
              value={filters.search ?? ""}
              onChange={(event) => updateFilter("search", event.target.value)}
              placeholder="Адмін, опис, дія..."
            />
          </label>
        </div>

        <div className="report-filter-actions">
          <button className="primary-button" onClick={handleApply} disabled={loading}>
            {loading ? "Завантаження..." : "Сформувати"}
          </button>

          <button className="secondary-button" onClick={handleReset}>
            Скинути
          </button>
        </div>
      </div>

      {error && <div className="form-error report-error">{error}</div>}

      <div className="panel-card table-card">
        <div className="table-header">
          <div>
            <h2>Події</h2>
            <p>
              Усього рядків: {(pagination?.total ?? 0).toLocaleString("uk-UA")} ·
              Сторінка {pagination?.page ?? 1} з {pagination?.totalPages ?? 1}
            </p>
          </div>

          <div className="table-header-actions">
            <select
              className="compact-select"
              value={filters.pageSize ?? 20}
              onChange={(event) => handlePageSizeChange(Number(event.target.value))}
            >
              <option value={20}>20 рядків</option>
              <option value={50}>50 рядків</option>
              <option value={100}>100 рядків</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="empty-state">Завантаження журналу...</div>
        ) : rows.length === 0 ? (
          <div className="empty-state">Записів журналу поки немає</div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="data-table action-logs-table">
                <thead>
                  <tr>
                    <th>Дата/час</th>
                    <th>Адміністратор</th>
                    <th>Дія</th>
                    <th>Об’єкт</th>
                    <th>ID</th>
                    <th>Опис</th>
                  </tr>
                </thead>

                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>{formatDateTime(row.createdAt)}</td>
                      <td>
                        {row.adminName || row.adminLogin || "—"}
                        {row.adminLogin && (
                          <div className="muted-text">{row.adminLogin}</div>
                        )}
                      </td>
                      <td>
                        <span className={`action-badge action-${row.action}`}>
                          {getActionLabel(row.action)}
                        </span>
                      </td>
                      <td>{getEntityTypeLabel(row.entityType)}</td>
                      <td>{row.entityId ?? "—"}</td>
                      <td>{row.description ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pagination-bar">
              <button
                className="secondary-button"
                disabled={(pagination?.page ?? 1) <= 1}
                onClick={() => handlePageChange((pagination?.page ?? 1) - 1)}
              >
                Назад
              </button>

              <span>
                Сторінка {pagination?.page ?? 1} з{" "}
                {pagination?.totalPages ?? 1}
              </span>

              <button
                className="secondary-button"
                disabled={(pagination?.page ?? 1) >= (pagination?.totalPages ?? 1)}
                onClick={() => handlePageChange((pagination?.page ?? 1) + 1)}
              >
                Вперед
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}