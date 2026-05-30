import { useEffect, useMemo, useState } from "react";
import { getCities } from "../../api/cities.api";
import type { City } from "../../api/cities.api";
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

const defaultFilters: AlarmsReportFilters = {};

function formatNumber(value: number | undefined) {
  return (value ?? 0).toLocaleString("ru-RU");
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

  const maxCityAlarms = useMemo(
    () => getMaxValue(byCity, "totalAlarms"),
    [byCity]
  );

  const maxMonthAlarms = useMemo(
    () => getMaxValue(byMonth, "totalAlarms"),
    [byMonth]
  );

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
      setError("Не удалось загрузить отчет по сработкам");
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
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
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
            <strong>Всего сработок</strong>
          </td>
          <td>{formatNumber(totals?.totalAlarms)}</td>
          <td>{formatNumber(totals?.totalOh)}</td>
          <td>{formatNumber(totals?.totalPartner)}</td>
        </tr>

        <tr>
          <td>Ложные</td>
          <td>{formatNumber(totals?.falseTotal)}</td>
          <td>{formatNumber(totals?.falseOh)}</td>
          <td>{formatNumber(totals?.falsePartner)}</td>
        </tr>

        <tr>
          <td>Боевые</td>
          <td>{formatNumber(totals?.combatTotal)}</td>
          <td>{formatNumber(totals?.combatOh)}</td>
          <td>{formatNumber(totals?.combatPartner)}</td>
        </tr>

        <tr className="summary-row">
          <td>
            <strong>Дополнительно</strong>
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
          <td>Задержано</td>
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
      setError("Не удалось скачать Excel");
    } finally {
      setExcelLoading(false);
    }
  }
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>По сработкам</h1>
          <p>Аналитика ОХ / Партнеры, боевые / ложные и дополнительные причины</p>
        </div>
      </div>

      <div className="panel-card report-filters">
        <div className="trips-filters-grid">
          <label className="field">
            <span>Дата от</span>
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
            <span>Город</span>
            <select
              value={filters.cityId ?? 0}
              onChange={(event) =>
                updateFilter("cityId", Number(event.target.value) || undefined)
              }
              disabled={referencesLoading}
            >
              <option value={0}>Все города</option>

              {activeCities.map((city) => (
                <option key={city.id} value={city.id}>
                  {city.name}
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
              <option value={0}>Все наряды</option>

              {crews.map((crew) => (
                <option key={crew.id} value={crew.id}>
                  {crew.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Автомобиль</span>
            <select
              value={filters.vehicleId ?? 0}
              onChange={(event) =>
                updateFilter("vehicleId", Number(event.target.value) || undefined)
              }
            >
              <option value={0}>Все автомобили</option>

              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.title}
                  {vehicle.licensePlate ? ` · ${vehicle.licensePlate}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Сотрудник</span>
            <select
              value={filters.employeeId ?? 0}
              onChange={(event) =>
                updateFilter("employeeId", Number(event.target.value) || undefined)
              }
            >
              <option value={0}>Все сотрудники</option>

              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.fullName}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Поиск</span>
            <input
              value={filters.search ?? ""}
              onChange={(event) => updateFilter("search", event.target.value)}
              placeholder="Город, наряд, авто, сотрудник..."
            />
          </label>
        </div>

        <div className="report-filter-actions">
  <button className="primary-button" onClick={handleApply} disabled={loading}>
    {loading ? "Загрузка..." : "Сформировать"}
  </button>

  <button className="secondary-button" onClick={handleReset}>
    Сбросить
  </button>

  <button
    className="secondary-button"
    onClick={handleExcel}
    disabled={excelLoading}
  >
    {excelLoading ? "Скачивание..." : "Скачать Excel"}
  </button>
</div>
      </div>

      {error && <div className="form-error report-error">{error}</div>}

      {loading ? (
        <div className="empty-state">Загрузка отчета...</div>
      ) : (
        <>
          <div className="stats-grid report-stats-grid">
            <div className="stat-card">
              <span>Сработок всего</span>
              <strong>{formatNumber(totals?.totalAlarms)}</strong>
            </div>

            <div className="stat-card">
              <span>ОХ / Партнеры</span>
              <strong>
                {formatNumber(totals?.totalOh)} /{" "}
                {formatNumber(totals?.totalPartner)}
              </strong>
            </div>

            <div className="stat-card">
              <span>Боевые / Ложные</span>
              <strong>
                {formatNumber(totals?.combatTotal)} /{" "}
                {formatNumber(totals?.falseTotal)}
              </strong>
            </div>

            <div className="stat-card">
              <span>Дополнительно</span>
              <strong>
                {formatNumber(totals?.additionalTotal)} (
                {formatNumber(totals?.additionalOh)} /{" "}
                {formatNumber(totals?.additionalPartner)})
              </strong>
            </div>

            <div className="stat-card">
              <span>Задержано / Передано</span>
              <strong>
                {formatNumber(totals?.detained)} /{" "}
                {formatNumber(totals?.transferred)}
              </strong>
            </div>

            <div className="stat-card">
              <span>Смен / Поездок</span>
              <strong>
                {formatNumber(totals?.totalShifts)} /{" "}
                {formatNumber(totals?.totalTrips)}
              </strong>
            </div>

            <div className="stat-card">
              <span>Пробег</span>
              <strong>{formatKm(totals?.totalDistanceKm)}</strong>
            </div>
          </div>

          <div className="report-grid">
            <div className="panel-card table-card">
              <div className="table-header">
                <div>
                  <h2>Основная разбивка</h2>
                  <p>Всего / ОХ / Партнеры</p>
                </div>
              </div>

              <div className="table-wrap">
                <table className="data-table compact-data-table">
                  <thead>
                    <tr>
                      <th>Показатель</th>
                      <th>Всего</th>
                      <th>ОХ</th>
                      <th>Партнеры</th>
                    </tr>
                  </thead>

                  <tbody>{renderMainRows(totals)}</tbody>
                </table>
              </div>
            </div>

            <div className="panel-card">
              <div className="table-header">
                <div>
                  <h2>График по городам</h2>
                  <p>Сработки всего</p>
                </div>
              </div>

              {byCity.length === 0 ? (
                <div className="empty-state">Нет данных</div>
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
                  <h2>По городам</h2>
                  <p>Сравнение городов по сработкам</p>
                </div>
              </div>

              {byCity.length === 0 ? (
                <div className="empty-state">Нет данных по городам</div>
              ) : (
                <div className="table-wrap">
                  <table className="data-table alarms-table">
                    <thead>
                      <tr>
                        <th>Город</th>
                        <th>Сработок</th>
                        <th>ОХ</th>
                        <th>Партнеры</th>
                        <th>Боевые</th>
                        <th>Ложные</th>
                        <th>Доп.</th>
                        <th>Задержано</th>
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
                  <h2>По месяцам</h2>
                  <p>Динамика сработок</p>
                </div>
              </div>

              {byMonth.length === 0 ? (
                <div className="empty-state">Нет данных по месяцам</div>
              ) : (
                <div className="table-wrap">
                  <table className="data-table alarms-table">
                    <thead>
                      <tr>
                        <th>Месяц</th>
                        <th>Сработок</th>
                        <th>ОХ</th>
                        <th>Партнеры</th>
                        <th>Боевые</th>
                        <th>Ложные</th>
                        <th>Доп.</th>
                        <th>Задержано</th>
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
                <h2>Динамика по месяцам</h2>
                <p>Сработки всего</p>
              </div>
            </div>

            {byMonth.length === 0 ? (
              <div className="empty-state">Нет данных</div>
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
