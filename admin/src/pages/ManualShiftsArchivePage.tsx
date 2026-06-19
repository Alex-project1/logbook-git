import { useEffect, useMemo, useState } from "react";
import { getAccessibleCities, getCities } from "../api/cities.api";
import type { City } from "../api/cities.api";
import {
  getDeletedManualShifts,
  restoreManualShift,
} from "../api/manual-shifts.api";
import type {
  DeletedShiftArchiveFilters,
  DeletedShiftArchiveResponse,
  DeletedShiftArchiveRow,
} from "../api/manual-shifts.api";

import { getAdminMe } from "../api/auth.api";
import type { AdminUser } from "../api/auth.api";

const defaultFilters: DeletedShiftArchiveFilters = {
  page: 1,
  pageSize: 20,
};

function formatDate(value: string | null) {
  if (!value) return "—";

  return new Date(value).toLocaleDateString("uk-UA");
}

function formatDateTime(value: string | null) {
  if (!value) return "—";

  return new Date(value).toLocaleString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function formatKm(value: number) {
  return `${value.toLocaleString("uk-UA")} км`;
}

function getDutyTypeLabel(value: string) {
  const labels: Record<string, string> = {
    FULL_DAY: "Добовий",
    DAY: "Денний",
    NIGHT: "Нічний",
  };

  return labels[value] ?? value;
}

function getTransportTypeLabel(value: string) {
  const labels: Record<string, string> = {
    AUTO: "Авто",
    MOTO: "Мото",
  };

  return labels[value] ?? value;
}

function formatShiftEquivalent(value: number) {
  return value.toLocaleString("uk-UA", {
    maximumFractionDigits: 2,
  });
}

export function ManualShiftsArchivePage() {
  const [filters, setFilters] =
    useState<DeletedShiftArchiveFilters>(defaultFilters);

  const [report, setReport] = useState<DeletedShiftArchiveResponse | null>(null);
  const [cities, setCities] = useState<City[]>([]);

  const [accessibleCities, setAccessibleCities] = useState<City[]>([]);

  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<number | null>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);

  const rows = report?.data ?? [];
  const pagination = report?.pagination;
  const roleCode = currentUser?.role?.code;
  const canRestoreShifts = roleCode === "super_admin" || roleCode === "admin";
  const activeCities = useMemo(
    () => cities.filter((city) => city.isActive),
    [cities]
  );
  const accessibleCityIds = useMemo(
    () => accessibleCities.map((city) => city.id),
    [accessibleCities]
  );
  
  function canRestoreRow(row: DeletedShiftArchiveRow) {
    const roleCode = currentUser?.role?.code;
  
    if (roleCode === "super_admin") {
      return true;
    }
  
    if (roleCode !== "admin") {
      return false;
    }
  
    return accessibleCityIds.includes(row.city.id);
  }

  async function loadCurrentUser() {
    try {
      const response = await getAdminMe();
      setCurrentUser(response.user);
    } catch {
      setCurrentUser(null);
    }
  }

  async function loadReferences() {
    try {
      const [citiesData, accessibleCitiesData] = await Promise.all([
        getCities(false),
        getAccessibleCities(false),
      ]);

      setCities(citiesData);
      setAccessibleCities(accessibleCitiesData);
    } catch {
      setError("Не вдалося завантажити міста");
    }
  }

  async function loadArchive(nextFilters = filters) {
    setLoading(true);
    setError("");

    try {
      const data = await getDeletedManualShifts(nextFilters);
      setReport(data);
    } catch {
      setError("Не вдалося завантажити архів змін");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function loadCurrentUser() {
      try {
        const response = await getAdminMe();
        setCurrentUser(response.user);
      } catch {
        setCurrentUser(null);
      }
    }

    loadCurrentUser();
    loadReferences();
    loadArchive(defaultFilters);
  }, []);

  function updateFilter<Key extends keyof DeletedShiftArchiveFilters>(
    key: Key,
    value: DeletedShiftArchiveFilters[Key]
  ) {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
      page: key === "page" ? (value as number) : 1,
    }));
  }

  async function handleApply() {
    const nextFilters: DeletedShiftArchiveFilters = {
      ...filters,
      page: 1,
    };

    setFilters(nextFilters);
    await loadArchive(nextFilters);
  }

  async function handleReset() {
    setFilters(defaultFilters);
    await loadArchive(defaultFilters);
  }

  async function handlePageChange(page: number) {
    const nextFilters: DeletedShiftArchiveFilters = {
      ...filters,
      page,
    };

    setFilters(nextFilters);
    await loadArchive(nextFilters);
  }

  async function handlePageSizeChange(pageSize: number) {
    const nextFilters: DeletedShiftArchiveFilters = {
      ...filters,
      page: 1,
      pageSize,
    };

    setFilters(nextFilters);
    await loadArchive(nextFilters);
  }

  async function handleRestore(row: DeletedShiftArchiveRow) {
    const confirmed = window.confirm(
      `Відновити зміну ${row.crew.name} від ${formatDate(row.shiftDate)}?`
    );

    if (!confirmed) {
      return;
    }

    setRestoringId(row.id);
    setError("");
    setSuccess("");

    try {
      await restoreManualShift(row.id);
      setSuccess("Зміну відновлено");
      await loadArchive(filters);
    } catch (err: any) {
      setError(err.response?.data?.message || "Не вдалося відновити зміну");
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Архів змін</h1>
          <p>Видалені зміни, які можна відновити та повернути до звітів</p>
        </div>
      </div>

      <div className="panel-card report-filters">
        <div className="archive-filters-grid">
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
            <span>Місто</span>
            <select
              value={filters.cityId ?? 0}
              onChange={(event) =>
                updateFilter("cityId", Number(event.target.value) || undefined)
              }
            >
              <option value={0}>Усі міста</option>

              {activeCities.map((city) => (
                <option key={city.id} value={city.id}>
                  {city.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Пошук</span>
            <input
              value={filters.search ?? ""}
              onChange={(event) => updateFilter("search", event.target.value)}
              placeholder="Наряд, авто, співробітник..."
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
      {success && <div className="form-success report-error">{success}</div>}

      <div className="panel-card table-card">
        <div className="table-header">
          <div>
            <h2>Видалені зміни</h2>
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
          <div className="empty-state">Завантаження архіву...</div>
        ) : rows.length === 0 ? (
          <div className="empty-state">В архіві немає видалених змін</div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="data-table archive-shifts-table">
                <thead>
                  <tr>
                    <th>Дата зміни</th>
                    <th>Видалено</th>
                    <th>Місто</th>
                    <th>Наряд</th>
                    <th>Тип</th>
                    <th>Транспорт</th>
                    <th>Години</th>
                    <th>Зміни</th>
                    <th>Авто</th>
                    <th>Водій</th>
                    <th>Старший</th>
                    <th>Поїздок</th>
                    <th>Пробіг</th>
                    <th>Спід. початок</th>
                    <th>Спід. кінець</th>
                    {canRestoreShifts && <th>Дії</th>}
                  </tr>
                </thead>

                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>{formatDate(row.shiftDate)}</td>
                      <td>{formatDateTime(row.deletedAt)}</td>
                      <td>{row.city.name}</td>
                      <td>{row.crew.name}</td>
                      <td>{getDutyTypeLabel(row.crewDutyType)}</td>
                      <td>{getTransportTypeLabel(row.crewTransportType)}</td>
                      <td>{Number(row.shiftDurationHours)}</td>
                      <td>{formatShiftEquivalent(row.shiftEquivalent)}</td>
                      <td>
                        {row.vehicle.title}
                        {row.vehicle.licensePlate && (
                          <div className="muted-text">
                            {row.vehicle.licensePlate}
                          </div>
                        )}
                      </td>
                      <td>{row.driverEmployee.fullName}</td>
                      <td>{row.seniorEmployee.fullName}</td>
                      <td>{row.tripsCount}</td>
                      <td>{formatKm(row.totalDistanceKm)}</td>
                      <td>{row.odometerStart}</td>
                      <td>{row.odometerEndCalculated}</td>
                      {canRestoreShifts && (
                        <td>
                          {canRestoreRow(row) ? (
                            <button
                              className="small-button"
                              onClick={() => handleRestore(row)}
                              disabled={restoringId === row.id}
                            >
                              {restoringId === row.id
                                ? "Відновлюємо..."
                                : "Відновити"}
                            </button>
                          ) : (
                            <span className="muted-text">Немає прав</span>
                          )}
                        </td>
                      )}
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