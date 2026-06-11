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
  downloadAlarmsReportExcel,
  getAlarmsReport,
} from "../../api/reports.api";
import type {
  AlarmGroupRow,
  AlarmReportTotals,
  AlarmReasonRow,
  AlarmsReportFilters,
  AlarmsReportResponse,
} from "../../api/reports.api";
import { getVehicles } from "../../api/vehicles.api";
import type { Vehicle } from "../../api/vehicles.api";
import { filterByReportScope, resetDependentReportFilters } from "../../utils/report-reference-filters";

const defaultFilters: AlarmsReportFilters = {};

function formatNumber(value: number | undefined) {
  return (value ?? 0).toLocaleString("uk-UA");
}

function formatKm(value: number | undefined) {
  return `${formatNumber(value)} км`;
}

function getMaxValue(rows: AlarmGroupRow[], key: keyof AlarmReportTotals) {
  return Math.max(...rows.map((row) => Number(row[key] ?? 0)), 1);
}

function percent(value: number, max: number) {
  return `${Math.max((value / max) * 100, 2)}%`;
}

export function ReportsAlarmsPage() {
  const [filters, setFilters] = useState<AlarmsReportFilters>(defaultFilters);
  const [report, setReport] = useState<AlarmsReportResponse | null>(null);

  const [cities, setCities] = useState<City[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const [loading, setLoading] = useState(true);
  const [excelLoading, setExcelLoading] = useState(false);
  const [referencesLoading, setReferencesLoading] = useState(true);
  const [error, setError] = useState("");

  const totals = report?.data.totals;
  const additionalRows = report?.data.additionalByReason ?? [];
  const byCity = report?.data.byCity ?? [];
  const byMonth = report?.data.byMonth ?? [];

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

  const maxCityAlarms = useMemo(
    () => getMaxValue(byCity, "totalAlarms"),
    [byCity]
  );

  const maxMonthAlarms = useMemo(
    () => getMaxValue(byMonth, "totalAlarms"),
    [byMonth]
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
      const data = await getAlarmsReport(nextFilters);
      setReport(data);
    } catch {
      setError("Не вдалося завантажити звіт за спрацюваннями");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReferences();
    loadReport(defaultFilters);
  }, []);

  function updateFilter<Key extends keyof AlarmsReportFilters>(
    key: Key,
    value: AlarmsReportFilters[Key]
  ) {
    setFilters((prev) =>
      resetDependentReportFilters(
        {
          ...prev,
          [key]: value,
        },
        String(key),
      ) as typeof prev,
    );
  }

  async function handleApply() {
    await loadReport(filters);
  }

  async function handleReset() {
    setFilters(defaultFilters);
    await loadReport(defaultFilters);
  }

  function renderMainRows(totals?: AlarmReportTotals) {
    return (
      <>
        <tr className="summary-row">
          <td>
            <strong>Усього спрацювань</strong>
          </td>
          <td>{formatNumber(totals?.totalAlarms)}</td>
          <td>{formatNumber(totals?.totalOh)}</td>
          <td>{formatNumber(totals?.totalPartner)}</td>
        </tr>

        <tr>
          <td>Хибні</td>
          <td>{formatNumber(totals?.falseTotal)}</td>
          <td>{formatNumber(totals?.falseOh)}</td>
          <td>{formatNumber(totals?.falsePartner)}</td>
        </tr>

        <tr>
          <td>Бойові</td>
          <td>{formatNumber(totals?.combatTotal)}</td>
          <td>{formatNumber(totals?.combatOh)}</td>
          <td>{formatNumber(totals?.combatPartner)}</td>
        </tr>

        <tr className="summary-row">
          <td>
            <strong>Додатково</strong>
          </td>
          <td>{formatNumber(totals?.additionalTotal)}</td>
          <td>{formatNumber(totals?.additionalOh)}</td>
          <td>{formatNumber(totals?.additionalPartner)}</td>
        </tr>

        {additionalRows.map((row: AlarmReasonRow) => (
          <tr key={row.reasonName}>
            <td className="nested-cell">— {row.reasonName}</td>
            <td>{formatNumber(row.total)}</td>
            <td>{formatNumber(row.oh)}</td>
            <td>{formatNumber(row.partner)}</td>
          </tr>
        ))}

        <tr>
          <td>Затримано</td>
          <td>{formatNumber(totals?.detained)}</td>
          <td>—</td>
          <td>—</td>
        </tr>

        <tr>
          <td>Передано</td>
          <td>{formatNumber(totals?.transferred)}</td>
          <td>—</td>
          <td>—</td>
        </tr>
      </>
    );
  }

  async function handleExcel() {
    setExcelLoading(true);
    setError("");
  
    try {
      await downloadAlarmsReportExcel(filters);
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
          <h1>За спрацюваннями</h1>
          <p>Аналітика ОХ / Партнери, бойові / хибні та додаткові причини</p>
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
              placeholder="Місто, наряд, авто, співробітник..."
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
            {excelLoading ? "Завантаження..." : "Завантажити Excel"}
          </button>
        </div>
      </div>

      {error && <div className="form-error report-error">{error}</div>}

      {loading ? (
        <div className="empty-state">Завантаження звіту...</div>
      ) : (
        <>
          <div className="stats-grid report-stats-grid">
            <div className="stat-card">
              <span>Спрацювань усього</span>
              <strong>{formatNumber(totals?.totalAlarms)}</strong>
            </div>

            <div className="stat-card">
              <span>ОХ / Партнери</span>
              <strong>
                {formatNumber(totals?.totalOh)} /{" "}
                {formatNumber(totals?.totalPartner)}
              </strong>
            </div>

            <div className="stat-card">
              <span>Бойові / Хибні</span>
              <strong>
                {formatNumber(totals?.combatTotal)} /{" "}
                {formatNumber(totals?.falseTotal)}
              </strong>
            </div>

            <div className="stat-card">
              <span>Додатково</span>
              <strong>
                {formatNumber(totals?.additionalTotal)} (
                {formatNumber(totals?.additionalOh)} /{" "}
                {formatNumber(totals?.additionalPartner)})
              </strong>
            </div>

            <div className="stat-card">
              <span>Затримано / Передано</span>
              <strong>
                {formatNumber(totals?.detained)} /{" "}
                {formatNumber(totals?.transferred)}
              </strong>
            </div>

            <div className="stat-card">
              <span>Змін / Поїздок</span>
              <strong>
                {formatNumber(totals?.totalShifts)} /{" "}
                {formatNumber(totals?.totalTrips)}
              </strong>
            </div>

            <div className="stat-card">
              <span>Пробіг</span>
              <strong>{formatKm(totals?.totalDistanceKm)}</strong>
            </div>
          </div>

          <div className="report-grid">
            <div className="panel-card table-card">
              <div className="table-header">
                <div>
                  <h2>Основна розбивка</h2>
                  <p>Усього / ОХ / Партнери</p>
                </div>
              </div>

              <div className="table-wrap">
                <table className="data-table compact-data-table">
                  <thead>
                    <tr>
                      <th>Показник</th>
                      <th>Усього</th>
                      <th>ОХ</th>
                      <th>Партнери</th>
                    </tr>
                  </thead>

                  <tbody>{renderMainRows(totals)}</tbody>
                </table>
              </div>
            </div>

            <div className="panel-card">
              <div className="table-header">
                <div>
                  <h2>Графік за містами</h2>
                  <p>Спрацювань усього</p>
                </div>
              </div>

              {byCity.length === 0 ? (
                <div className="empty-state">Немає даних</div>
              ) : (
                <div className="bar-list">
                  {byCity.map((row) => (
                    <div className="bar-row" key={row.key}>
                      <div className="bar-row-head">
                        <span>{row.name}</span>
                        <strong>{formatNumber(row.totalAlarms)}</strong>
                      </div>
                      <div className="bar-track">
                        <div
                          className="bar-fill"
                          style={{
                            width: percent(row.totalAlarms, maxCityAlarms),
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="report-grid report-grid-wide">
            <div className="panel-card table-card">
              <div className="table-header">
                <div>
                  <h2>За містами</h2>
                  <p>Порівняння міст за спрацюваннями</p>
                </div>
              </div>

              {byCity.length === 0 ? (
                <div className="empty-state">Немає даних за містами</div>
              ) : (
                <div className="table-wrap">
                  <table className="data-table alarms-table">
                    <thead>
                      <tr>
                        <th>Місто</th>
                        <th>Спрацювань</th>
                        <th>ОХ</th>
                        <th>Партнери</th>
                        <th>Бойові</th>
                        <th>Хибні</th>
                        <th>Дод.</th>
                        <th>Затримано</th>
                        <th>Передано</th>
                      </tr>
                    </thead>

                    <tbody>
                      {byCity.map((row) => (
                        <tr key={row.key}>
                          <td>
                            <strong>{row.name}</strong>
                          </td>
                          <td>{formatNumber(row.totalAlarms)}</td>
                          <td>{formatNumber(row.totalOh)}</td>
                          <td>{formatNumber(row.totalPartner)}</td>
                          <td>{formatNumber(row.combatTotal)}</td>
                          <td>{formatNumber(row.falseTotal)}</td>
                          <td>{formatNumber(row.additionalTotal)}</td>
                          <td>{formatNumber(row.detained)}</td>
                          <td>{formatNumber(row.transferred)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="panel-card table-card">
              <div className="table-header">
                <div>
                  <h2>За місяцями</h2>
                  <p>Динаміка спрацювань</p>
                </div>
              </div>

              {byMonth.length === 0 ? (
                <div className="empty-state">Немає даних за місяцями</div>
              ) : (
                <div className="table-wrap">
                  <table className="data-table alarms-table">
                    <thead>
                      <tr>
                        <th>Місяць</th>
                        <th>Спрацювань</th>
                        <th>ОХ</th>
                        <th>Партнери</th>
                        <th>Бойові</th>
                        <th>Хибні</th>
                        <th>Дод.</th>
                        <th>Затримано</th>
                        <th>Передано</th>
                      </tr>
                    </thead>

                    <tbody>
                      {byMonth.map((row) => (
                        <tr key={row.key}>
                          <td>
                            <strong>{row.name}</strong>
                          </td>
                          <td>{formatNumber(row.totalAlarms)}</td>
                          <td>{formatNumber(row.totalOh)}</td>
                          <td>{formatNumber(row.totalPartner)}</td>
                          <td>{formatNumber(row.combatTotal)}</td>
                          <td>{formatNumber(row.falseTotal)}</td>
                          <td>{formatNumber(row.additionalTotal)}</td>
                          <td>{formatNumber(row.detained)}</td>
                          <td>{formatNumber(row.transferred)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="panel-card">
            <div className="table-header">
              <div>
                <h2>Динаміка за місяцями</h2>
                <p>Спрацювань усього</p>
              </div>
            </div>

            {byMonth.length === 0 ? (
              <div className="empty-state">Немає даних</div>
            ) : (
              <div className="bar-list">
                {byMonth.map((row) => (
                  <div className="bar-row" key={row.key}>
                    <div className="bar-row-head">
                      <span>{row.name}</span>
                      <strong>{formatNumber(row.totalAlarms)}</strong>
                    </div>
                    <div className="bar-track">
                      <div
                        className="bar-fill"
                        style={{
                          width: percent(row.totalAlarms, maxMonthAlarms),
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}