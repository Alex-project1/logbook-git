import { Fragment, useEffect, useMemo, useState } from "react";
import { getCities } from "../../api/cities.api";
import type { City } from "../../api/cities.api";
import { getDepartments } from "../../api/departments.api";
import type { Department } from "../../api/departments.api";
import { dedupeDepartments, formatDepartmentOption } from "../../utils/department-options";
import { getCrews } from "../../api/crews.api";
import type { Crew } from "../../api/crews.api";
import { getEmployees } from "../../api/employees.api";
import type { Employee } from "../../api/employees.api";
import {
  downloadCrewsTableExcel,
  getCrewsTableReport,
} from "../../api/reports.api";
import type {
  CrewTableRow,
  CrewsTableFilters,
  CrewsTableResponse,
} from "../../api/reports.api";
import { getVehicles } from "../../api/vehicles.api";
import type { Vehicle } from "../../api/vehicles.api";
import { filterByReportScope, resetDependentReportFilters } from "../../utils/report-reference-filters";

const defaultFilters: CrewsTableFilters = {
  page: 1,
  pageSize: 20,
  sortBy: "totalAlarms",
  sortDir: "desc",
};

function formatNumber(value: number) {
  return value.toLocaleString("uk-UA");
}

function formatKm(value: number) {
  return `${formatNumber(value)} км`;
}

function getAdditionalRows(row: CrewTableRow) {
  return Object.entries(row.additionalByReason ?? {}).map(
    ([reasonName, stats]) => ({
      reasonName,
      ...stats,
    })
  );
}

function getDistanceRows(row: CrewTableRow) {
  return Object.entries(row.distanceByGoal ?? {}).map(([goalName, distance]) => ({
    goalName,
    distance,
  }));
}

export function ReportsCrewsPage() {
  const [filters, setFilters] = useState<CrewsTableFilters>(defaultFilters);
  const [report, setReport] = useState<CrewsTableResponse | null>(null);

  const [cities, setCities] = useState<City[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});

  const [loading, setLoading] = useState(true);
  const [excelLoading, setExcelLoading] = useState(false);
  const [referencesLoading, setReferencesLoading] = useState(true);
  const [error, setError] = useState("");

  const rows = report?.data ?? [];
  const pagination = report?.pagination;

  const activeCities = useMemo(
    () => cities.filter((city) => city.isActive),
    [cities]
  );

  const activeDepartments = useMemo(
    () =>
      dedupeDepartments(
        departments.filter((department) => {
          if (department.deletedAt || !department.isActive) return false;
          if (filters.cityId && department.cityId !== filters.cityId) return false;
          return true;
        }),
      ),
    [departments, filters.cityId],
  );

  const visibleCrews = useMemo(
    () => filterByReportScope(crews, filters),
    [crews, filters.cityId, filters.departmentId],
  );

  const visibleVehicles = useMemo(
    () => filterByReportScope(vehicles, filters),
    [vehicles, filters.cityId, filters.departmentId],
  );

  const visibleEmployees = useMemo(
    () => filterByReportScope(employees, filters),
    [employees, filters.cityId, filters.departmentId],
  );

  useEffect(() => {
    getDepartments({ includeInactive: true })
      .then(setDepartments)
      .catch(() => setDepartments([]));
  }, []);

  async function loadReferences() {
    setReferencesLoading(true);

    try {
      const [citiesData, crewsData, vehiclesData, employeesData] =
        await Promise.all([
          getCities(false),
          getCrews(undefined, false),
          getVehicles(undefined, false),
          getEmployees(undefined, false),
        ]);

      setCities(citiesData);
      setCrews(crewsData);
      setVehicles(vehiclesData);
      setEmployees(employeesData);
    } finally {
      setReferencesLoading(false);
    }
  }

  async function loadReport(nextFilters = filters) {
    setLoading(true);
    setError("");

    try {
      const data = await getCrewsTableReport(nextFilters);
      setReport(data);
      setExpandedRows({});
    } catch {
      setError("Не вдалося завантажити звіт за нарядами");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReferences();
    loadReport(defaultFilters);
  }, []);

  function updateFilter<Key extends keyof CrewsTableFilters>(
    key: Key,
    value: CrewsTableFilters[Key]
  ) {
    setFilters((prev) =>
      resetDependentReportFilters(
        {
          ...prev,
          [key]: value,
          page: key === "page" ? (value as number) : 1,
        },
        String(key),
      ) as typeof prev,
    );
  }

  async function handleApply() {
    const nextFilters: CrewsTableFilters = {
      ...filters,
      page: 1,
    };

    setFilters(nextFilters);
    await loadReport(nextFilters);
  }

  async function handleReset() {
    setFilters(defaultFilters);
    await loadReport(defaultFilters);
  }

  async function handlePageChange(page: number) {
    const nextFilters: CrewsTableFilters = {
      ...filters,
      page,
    };

    setFilters(nextFilters);
    await loadReport(nextFilters);
  }

  async function handlePageSizeChange(pageSize: number) {
    const nextFilters: CrewsTableFilters = {
      ...filters,
      page: 1,
      pageSize,
    };

    setFilters(nextFilters);
    await loadReport(nextFilters);
  }

  async function handleSort(sortBy: NonNullable<CrewsTableFilters["sortBy"]>) {
    const nextSortDir: "asc" | "desc" =
      filters.sortBy === sortBy && filters.sortDir === "desc" ? "asc" : "desc";

    const nextFilters: CrewsTableFilters = {
      ...filters,
      sortBy,
      sortDir: nextSortDir,
      page: 1,
    };

    setFilters(nextFilters);
    await loadReport(nextFilters);
  }

  function toggleRow(rowId: number) {
    setExpandedRows((prev) => ({
      ...prev,
      [rowId]: !prev[rowId],
    }));
  }

  async function handleExcel() {
    setExcelLoading(true);
    setError("");
  
    try {
      await downloadCrewsTableExcel(filters);
    } catch {
      setError("Не вдалося завантажити Excel");
    } finally {
      setExcelLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>За нарядами</h1>
          <p>Порівняння нарядів за змінами, пробігом, спрацюваннями та навантаженням</p>
        </div>
      </div>

      <div className="panel-card report-filters">
        <div className="trips-filters-grid">
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
              disabled={referencesLoading}
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
            <span>Підрозділ</span>
            <select
              value={filters.departmentId ?? 0}
              onChange={(event) =>
                updateFilter("departmentId", Number(event.target.value) || undefined)
              }
              disabled={referencesLoading}
            >
              <option value={0}>Усі підрозділи</option>

              {activeDepartments.map((department) => (
                <option key={department.id} value={department.id}>
                  {formatDepartmentOption(department, { showCity: !filters.cityId, showType: false })}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Наряд</span>
            <select
              value={filters.crewId ?? 0}
              onChange={(event) =>
                updateFilter("crewId", Number(event.target.value) || undefined)
              }
            >
              <option value={0}>Усі наряди</option>

              {visibleCrews.map((crew) => (
                <option key={crew.id} value={crew.id}>
                  {crew.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Автомобіль</span>
            <select
              value={filters.vehicleId ?? 0}
              onChange={(event) =>
                updateFilter("vehicleId", Number(event.target.value) || undefined)
              }
            >
              <option value={0}>Усі автомобілі</option>

              {visibleVehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.title}
                  {vehicle.licensePlate ? ` · ${vehicle.licensePlate}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Співробітник</span>
            <select
              value={filters.employeeId ?? 0}
              onChange={(event) =>
                updateFilter("employeeId", Number(event.target.value) || undefined)
              }
            >
              <option value={0}>Усі співробітники</option>

              {visibleEmployees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.fullName}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Пошук</span>
            <input
              value={filters.search ?? ""}
              onChange={(event) => updateFilter("search", event.target.value)}
              placeholder="Наряд, місто, авто, співробітник..."
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

          <button
            className="secondary-button"
            onClick={handleExcel}
            disabled={excelLoading}
          >
            {excelLoading ? "Завантажуємо..." : "Завантажити Excel"}
          </button>
        </div>
      </div>

      {error && <div className="form-error report-error">{error}</div>}

      <div className="stats-grid report-stats-grid">
        <div className="stat-card">
          <span>Нарядів</span>
          <strong>{formatNumber(report?.summary.totalCrews ?? 0)}</strong>
        </div>

        <div className="stat-card">
          <span>Змін</span>
          <strong>{formatNumber(report?.summary.totalShifts ?? 0)}</strong>
        </div>

        <div className="stat-card">
          <span>Поїздок</span>
          <strong>{formatNumber(report?.summary.totalTrips ?? 0)}</strong>
        </div>

        <div className="stat-card">
          <span>Пробіг</span>
          <strong>{formatKm(report?.summary.totalDistanceKm ?? 0)}</strong>
        </div>

        <div className="stat-card">
          <span>Спрацювань</span>
          <strong>{formatNumber(report?.summary.totalAlarms ?? 0)}</strong>
        </div>

        <div className="stat-card">
          <span>ОХ / Партнери</span>
          <strong>
            {formatNumber(report?.summary.totalOh ?? 0)} /{" "}
            {formatNumber(report?.summary.totalPartner ?? 0)}
          </strong>
        </div>

        <div className="stat-card">
          <span>Бойові / Хибні</span>
          <strong>
            {formatNumber(report?.summary.combatTotal ?? 0)} /{" "}
            {formatNumber(report?.summary.falseTotal ?? 0)}
          </strong>
        </div>

        <div className="stat-card">
          <span>Затримано / Передано</span>
          <strong>
            {formatNumber(report?.summary.detained ?? 0)} /{" "}
            {formatNumber(report?.summary.transferred ?? 0)}
          </strong>
        </div>
      </div>

      <div className="panel-card table-card">
        <div className="table-header">
          <div>
            <h2>Наряди</h2>
            <p>
              Усього рядків: {formatNumber(pagination?.total ?? 0)} · Сторінка{" "}
              {pagination?.page ?? 1} з {pagination?.totalPages ?? 1}
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
          <div className="empty-state">Завантаження нарядів...</div>
        ) : rows.length === 0 ? (
          <div className="empty-state">
            Наряди за вибраними фільтрами не знайдено
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="data-table crews-report-table">
                <thead>
                  <tr>
                    <th></th>
                    <th onClick={() => handleSort("crewName")}>Наряд</th>
                    <th>Місто</th>
                    <th onClick={() => handleSort("totalShifts")}>Змін</th>
                    <th onClick={() => handleSort("totalTrips")}>Поїздок</th>
                    <th onClick={() => handleSort("totalDistanceKm")}>Пробіг</th>
                    <th onClick={() => handleSort("averageDistancePerShift")}>
                      Сер. пробіг
                    </th>
                    <th onClick={() => handleSort("totalAlarms")}>Спрацювань</th>
                    <th onClick={() => handleSort("averageAlarmsPerShift")}>
                      Середня
                    </th>
                    <th>ОХ</th>
                    <th>Партнери</th>
                    <th>Бойові</th>
                    <th>Хибні</th>
                    <th>Дод.</th>
                    <th onClick={() => handleSort("detained")}>Затримано</th>
                    <th onClick={() => handleSort("transferred")}>Передано</th>
                  </tr>
                </thead>

                <tbody>
                  {rows.map((row) => {
                    const expanded = expandedRows[row.crewId];
                    const additionalRows = getAdditionalRows(row);
                    const distanceRows = getDistanceRows(row);

                    return (
                      <Fragment key={row.crewId}>
                        <tr>
                          <td>
                            <button
                              className="row-toggle-button"
                              onClick={() => toggleRow(row.crewId)}
                            >
                              {expanded ? "−" : "+"}
                            </button>
                          </td>
                          <td>
                            <strong>{row.crewName}</strong>
                          </td>
                          <td>{row.cityName}</td>
                          <td>{row.totalShifts}</td>
                          <td>{row.totalTrips}</td>
                          <td>{formatKm(row.totalDistanceKm)}</td>
                          <td>{formatKm(row.averageDistancePerShift)}</td>
                          <td>{row.totalAlarms}</td>
                          <td>{row.averageAlarmsPerShift}</td>
                          <td>{row.totalOh}</td>
                          <td>{row.totalPartner}</td>
                          <td>{row.combatTotal}</td>
                          <td>{row.falseTotal}</td>
                          <td>{row.additionalTotal}</td>
                          <td>{row.detained}</td>
                          <td>{row.transferred}</td>
                        </tr>

                        {expanded && (
                          <tr className="expanded-row">
                            <td colSpan={16}>
                              <div className="expanded-content">
                                <h3>Деталізація наряду</h3>

                                <div className="event-list">
                                  <div className="event-card">
                                    <strong>Додаткові спрацювання</strong>

                                    {additionalRows.length === 0 ? (
                                      <div className="muted-text">
                                        Немає додаткових спрацювань
                                      </div>
                                    ) : (
                                      <div className="mini-table-wrap">
                                        <table className="mini-table">
                                          <thead>
                                            <tr>
                                              <th>Причина</th>
                                              <th>Усього</th>
                                              <th>ОХ</th>
                                              <th>Партнери</th>
                                            </tr>
                                          </thead>

                                          <tbody>
                                            <tr>
                                              <td>
                                                <strong>Додатково</strong>
                                              </td>
                                              <td>{row.additionalTotal}</td>
                                              <td>{row.additionalOh}</td>
                                              <td>{row.additionalPartner}</td>
                                            </tr>

                                            {additionalRows.map((reason) => (
                                              <tr key={reason.reasonName}>
                                                <td>— {reason.reasonName}</td>
                                                <td>{reason.total}</td>
                                                <td>{reason.oh}</td>
                                                <td>{reason.partner}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                  </div>

                                  <div className="event-card">
                                    <strong>Пробіг за цілями</strong>

                                    {distanceRows.length === 0 ? (
                                      <div className="muted-text">
                                        Немає даних за цілями поїздки
                                      </div>
                                    ) : (
                                      <div className="mini-table-wrap">
                                        <table className="mini-table">
                                          <thead>
                                            <tr>
                                              <th>Ціль</th>
                                              <th>Пробіг</th>
                                            </tr>
                                          </thead>

                                          <tbody>
                                            {distanceRows.map((goal) => (
                                              <tr key={goal.goalName}>
                                                <td>{goal.goalName}</td>
                                                <td>{formatKm(goal.distance)}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
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