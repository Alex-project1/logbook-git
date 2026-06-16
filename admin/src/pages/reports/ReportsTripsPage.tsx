import { useEffect, useMemo, useState } from "react";
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
  downloadTripsTableExcel,
  getTripsTableReport,
} from "../../api/reports.api";
import type {
  TripTableRow,
  TripsTableFilters,
  TripsTableResponse,
} from "../../api/reports.api";
import { getTripGoals } from "../../api/trip-goals.api";
import type { TripGoal } from "../../api/trip-goals.api";
import { getVehicles } from "../../api/vehicles.api";
import type { Vehicle } from "../../api/vehicles.api";
import { filterByReportScope, resetDependentReportFilters } from "../../utils/report-reference-filters";

const defaultFilters: TripsTableFilters = {
  page: 1,
  pageSize: 20,
  sortBy: "departureTime",
  sortDir: "desc",
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("uk-UA");
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatNumber(value: number) {
  return value.toLocaleString("uk-UA");
}

function formatKm(value: number) {
  return `${formatNumber(value)} км`;
}

function getCombatLabel(row: TripTableRow) {
  if (row.eventTotals.combatTotal > 0 && row.eventTotals.falseTotal > 0) {
    return "Є бойові та хибні";
  }

  if (row.eventTotals.combatTotal > 0) {
    return "Бойова";
  }

  if (row.eventTotals.falseTotal > 0) {
    return "Хибна";
  }

  return "—";
}

export function ReportsTripsPage() {
  const [filters, setFilters] = useState<TripsTableFilters>(defaultFilters);
  const [report, setReport] = useState<TripsTableResponse | null>(null);

  const [cities, setCities] = useState<City[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tripGoals, setTripGoals] = useState<TripGoal[]>([]);

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
      const [citiesData, crewsData, vehiclesData, employeesData, goalsData] =
        await Promise.all([
          getCities(false),
          getCrews(undefined, false),
          getVehicles(undefined, false),
          getEmployees(undefined, false),
          getTripGoals(false),
        ]);

      setCities(citiesData);
      setCrews(crewsData);
      setVehicles(vehiclesData);
      setEmployees(employeesData);
      setTripGoals(goalsData);
    } finally {
      setReferencesLoading(false);
    }
  }

  async function loadReport(nextFilters = filters) {
    setLoading(true);
    setError("");

    try {
      const data = await getTripsTableReport(nextFilters);
      setReport(data);
      setExpandedRows({});
    } catch {
      setError("Не вдалося завантажити звіт за поїздками");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReferences();
    loadReport(defaultFilters);
  }, []);

  function updateFilter<Key extends keyof TripsTableFilters>(
    key: Key,
    value: TripsTableFilters[Key]
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
    await loadReport({
      ...filters,
      page: 1,
    });
  }

  async function handleReset() {
    setFilters(defaultFilters);
    await loadReport(defaultFilters);
  }

  async function handlePageChange(page: number) {
    const nextFilters = {
      ...filters,
      page,
    };

    setFilters(nextFilters);
    await loadReport(nextFilters);
  }

  async function handlePageSizeChange(pageSize: number) {
    const nextFilters = {
      ...filters,
      page: 1,
      pageSize,
    };

    setFilters(nextFilters);
    await loadReport(nextFilters);
  }

  async function handleSort(sortBy: NonNullable<TripsTableFilters["sortBy"]>) {
    const nextSortDir: "asc" | "desc" =
      filters.sortBy === sortBy && filters.sortDir === "desc" ? "asc" : "desc";

    const nextFilters: TripsTableFilters = {
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
      await downloadTripsTableExcel(filters);
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
          <h1>Усі поїздки</h1>
          <p>Маршрути з надісланих змін із фільтрами, сортуванням і деталями спрацювань</p>
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
            <span>Ціль поїздки</span>
            <select
              value={filters.goalId ?? 0}
              onChange={(event) =>
                updateFilter("goalId", Number(event.target.value) || undefined)
              }
            >
              <option value={0}>Усі цілі</option>

              {tripGoals.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Тип спрацювання</span>
            <select
              value={filters.alarmSource ?? ""}
              onChange={(event) =>
                updateFilter(
                  "alarmSource",
                  event.target.value
                    ? (event.target.value as "OH" | "PARTNER")
                    : undefined
                )
              }
            >
              <option value="">Усі</option>
              <option value="OH">ОХ</option>
              <option value="PARTNER">Партнери</option>
            </select>
          </label>

          <label className="field">
            <span>Бойова / хибна</span>
            <select
              value={
                typeof filters.isCombat === "boolean"
                  ? String(filters.isCombat)
                  : ""
              }
              onChange={(event) =>
                updateFilter(
                  "isCombat",
                  event.target.value === ""
                    ? undefined
                    : event.target.value === "true"
                )
              }
            >
              <option value="">Усі</option>
              <option value="true">Бойові</option>
              <option value="false">Хибні</option>
            </select>
          </label>

          <label className="field">
            <span>Пошук</span>
            <input
              value={filters.search ?? ""}
              onChange={(event) => updateFilter("search", event.target.value)}
              placeholder="Адреса, наряд, авто, співробітник..."
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
          <span>Рядків на сторінці</span>
          <strong>{formatNumber(report?.summary.totalRowsOnPage ?? 0)}</strong>
        </div>

        <div className="stat-card">
          <span>Пробіг на сторінці</span>
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
      </div>

      <div className="panel-card table-card">
        <div className="table-header">
          <div>
            <h2>Маршрути</h2>
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
              <option value={10}>10 рядків</option>
              <option value={20}>20 рядків</option>
              <option value={50}>50 рядків</option>
              <option value={100}>100 рядків</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="empty-state">Завантаження поїздок...</div>
        ) : rows.length === 0 ? (
          <div className="empty-state">Поїздки за вибраними фільтрами не знайдено</div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="data-table trips-table">
                <thead>
                  <tr>
                    <th></th>
                    <th onClick={() => handleSort("shiftDate")}>Дата</th>
                    <th>Місто</th>
                    <th>Підрозділ</th>
                    <th>Наряд</th>
                    <th>Авто</th>
                    <th>Старший</th>
                    <th>Водій</th>
                    <th>Спідометр початок</th>
                    <th>Звідки</th>
                    <th onClick={() => handleSort("departureTime")}>Виїхав</th>
                    <th>Куди</th>
                    <th onClick={() => handleSort("arrivalTime")}>Прибув</th>
                    <th onClick={() => handleSort("arrivalMinutes")}>Хв.</th>
                    <th onClick={() => handleSort("distanceKm")}>Км</th>
                    <th>Ціль</th>
                    <th>Спрацювання</th>
                    <th>Бойова?</th>
                    <th>Затримано</th>
                    <th>Передано</th>
                    <th>Примітка</th>
                  </tr>
                </thead>

                <tbody>
                  {rows.map((row) => {
                    const expanded = expandedRows[row.id];

                    return (
                      <>
                        <tr key={row.id}>
                          <td>
                            <button
                              className="row-toggle-button"
                              onClick={() => toggleRow(row.id)}
                            >
                              {expanded ? "−" : "+"}
                            </button>
                          </td>
                          <td>{formatDate(row.shiftDate)}</td>
                          <td>{row.city.name}</td>
                          <td>{row.department?.name ?? "—"}</td>
                          <td>{row.crew.name}</td>
                          <td>
                            {row.vehicle.title}
                            {row.vehicle.licensePlate && (
                              <div className="muted-text">
                                {row.vehicle.licensePlate}
                              </div>
                            )}
                          </td>
                          <td>{row.seniorEmployee.fullName}</td>
                          <td>{row.driverEmployee.fullName}</td>
                          <td>{row.odometerStart}</td>
                          <td>{row.fromLocation}</td>
                          <td>{formatTime(row.departureTime)}</td>
                          <td>{row.toLocation}</td>
                          <td>{formatTime(row.arrivalTime)}</td>
                          <td>{row.arrivalMinutes}</td>
                          <td>{row.distanceKm}</td>
                          <td>{row.goal.name}</td>
                          <td>{row.eventSummary}</td>
                          <td>{getCombatLabel(row)}</td>
                          <td>{row.eventTotals.detained}</td>
                          <td>{row.eventTotals.transferred}</td>
                          <td>{row.note || "—"}</td>
                        </tr>

                        {expanded && (
                          <tr className="expanded-row">
                            <td colSpan={20}>
                              <div className="expanded-content">
                                <h3>Події поїздки</h3>

                                {row.events.length === 0 ? (
                                  <div className="empty-state">
                                    У цієї поїздки немає подій спрацювань
                                  </div>
                                ) : (
                                  <div className="event-list">
                                    {row.events.map((event) => (
                                      <div className="event-card" key={event.id}>
                                        <strong>{event.title}</strong>

                                        <div className="event-grid">
                                          <span>Усього: {event.countTotal}</span>
                                          <span>ОХ: {event.ohCount}</span>
                                          <span>Партнери: {event.partnerCount}</span>
                                          <span>
                                            Тип:{" "}
                                            {event.isCombat === null
                                              ? "—"
                                              : event.isCombat
                                                ? "Бойова"
                                                : "Хибна"}
                                          </span>
                                          <span>
                                            Причина: {event.reasonName || "—"}
                                          </span>
                                          <span>
                                            Затримано: {event.detainedCount}
                                          </span>
                                          <span>
                                            Передано: {event.transferredCount}
                                          </span>
                                        </div>

                                        {event.note && (
                                          <div className="muted-text">
                                            {event.note}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
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