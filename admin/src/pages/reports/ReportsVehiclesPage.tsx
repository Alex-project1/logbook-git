import { Fragment, useEffect, useMemo, useState } from "react";
import { getCities } from "../../api/cities.api";
import type { City } from "../../api/cities.api";
import { getCrews } from "../../api/crews.api";
import type { Crew } from "../../api/crews.api";
import { getEmployees } from "../../api/employees.api";
import type { Employee } from "../../api/employees.api";
import {
  downloadVehiclesTableExcel,
  getVehiclesTableReport,
} from "../../api/reports.api";
import type {
  VehicleTableRow,
  VehiclesTableFilters,
  VehiclesTableResponse,
} from "../../api/reports.api";
import { getVehicles } from "../../api/vehicles.api";
import type { Vehicle } from "../../api/vehicles.api";

const defaultFilters: VehiclesTableFilters = {
  page: 1,
  pageSize: 20,
  sortBy: "totalDistanceKm",
  sortDir: "desc",
};

function formatNumber(value: number) {
  return value.toLocaleString("ru-RU");
}

function formatKm(value: number) {
  return `${formatNumber(value)} км`;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("ru-RU");
}

function getAdditionalRows(row: VehicleTableRow) {
  return Object.entries(row.additionalByReason ?? {}).map(
    ([reasonName, stats]) => ({
      reasonName,
      ...stats,
    })
  );
}

function getDistanceRows(row: VehicleTableRow) {
  return Object.entries(row.distanceByGoal ?? {}).map(([goalName, distance]) => ({
    goalName,
    distance,
  }));
}

export function ReportsVehiclesPage() {
  const [filters, setFilters] =
    useState<VehiclesTableFilters>(defaultFilters);

  const [report, setReport] = useState<VehiclesTableResponse | null>(null);

  const [cities, setCities] = useState<City[]>([]);
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
      const data = await getVehiclesTableReport(nextFilters);
      setReport(data);
      setExpandedRows({});
    } catch {
      setError("Не удалось загрузить отчет по автомобилям");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReferences();
    loadReport(defaultFilters);
  }, []);

  function updateFilter<Key extends keyof VehiclesTableFilters>(
    key: Key,
    value: VehiclesTableFilters[Key]
  ) {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
      page: key === "page" ? (value as number) : 1,
    }));
  }

  async function handleApply() {
    const nextFilters: VehiclesTableFilters = {
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
    const nextFilters: VehiclesTableFilters = {
      ...filters,
      page,
    };

    setFilters(nextFilters);
    await loadReport(nextFilters);
  }

  async function handlePageSizeChange(pageSize: number) {
    const nextFilters: VehiclesTableFilters = {
      ...filters,
      page: 1,
      pageSize,
    };

    setFilters(nextFilters);
    await loadReport(nextFilters);
  }

  async function handleSort(
    sortBy: NonNullable<VehiclesTableFilters["sortBy"]>
  ) {
    const nextSortDir: "asc" | "desc" =
      filters.sortBy === sortBy && filters.sortDir === "desc" ? "asc" : "desc";

    const nextFilters: VehiclesTableFilters = {
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
      await downloadVehiclesTableExcel(filters);
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
          <h1>По автомобилям</h1>
          <p>
            Пробег, смены, спидометр, сработки и нагрузка по каждому автомобилю
          </p>
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
              placeholder="Авто, номер, город, наряд..."
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

      <div className="stats-grid report-stats-grid">
        <div className="stat-card">
          <span>Автомобилей</span>
          <strong>{formatNumber(report?.summary.totalVehicles ?? 0)}</strong>
        </div>

        <div className="stat-card">
          <span>Смен</span>
          <strong>{formatNumber(report?.summary.totalShifts ?? 0)}</strong>
        </div>

        <div className="stat-card">
          <span>Поездок</span>
          <strong>{formatNumber(report?.summary.totalTrips ?? 0)}</strong>
        </div>

        <div className="stat-card">
          <span>Пробег</span>
          <strong>{formatKm(report?.summary.totalDistanceKm ?? 0)}</strong>
        </div>

        <div className="stat-card">
          <span>Сработок</span>
          <strong>{formatNumber(report?.summary.totalAlarms ?? 0)}</strong>
        </div>

        <div className="stat-card">
          <span>ОХ / Партнеры</span>
          <strong>
            {formatNumber(report?.summary.totalOh ?? 0)} /{" "}
            {formatNumber(report?.summary.totalPartner ?? 0)}
          </strong>
        </div>

        <div className="stat-card">
          <span>Боевые / Ложные</span>
          <strong>
            {formatNumber(report?.summary.combatTotal ?? 0)} /{" "}
            {formatNumber(report?.summary.falseTotal ?? 0)}
          </strong>
        </div>

        <div className="stat-card">
          <span>Задержано / Передано</span>
          <strong>
            {formatNumber(report?.summary.detained ?? 0)} /{" "}
            {formatNumber(report?.summary.transferred ?? 0)}
          </strong>
        </div>
      </div>

      <div className="panel-card table-card">
        <div className="table-header">
          <div>
            <h2>Автомобили</h2>
            <p>
              Всего строк: {formatNumber(pagination?.total ?? 0)} · Страница{" "}
              {pagination?.page ?? 1} из {pagination?.totalPages ?? 1}
            </p>
          </div>

          <div className="table-header-actions">
            <select
              className="compact-select"
              value={filters.pageSize ?? 20}
              onChange={(event) => handlePageSizeChange(Number(event.target.value))}
            >
              <option value={20}>20 строк</option>
              <option value={50}>50 строк</option>
              <option value={100}>100 строк</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="empty-state">Загрузка автомобилей...</div>
        ) : rows.length === 0 ? (
          <div className="empty-state">
            Автомобили по выбранным фильтрам не найдены
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="data-table vehicles-report-table">
                <thead>
                  <tr>
                    <th></th>
                    <th onClick={() => handleSort("vehicleTitle")}>Автомобиль</th>
                    <th>Город</th>
                    <th onClick={() => handleSort("totalShifts")}>Смен</th>
                    <th onClick={() => handleSort("totalTrips")}>Поездок</th>
                    <th onClick={() => handleSort("totalDistanceKm")}>Пробег</th>
                    <th onClick={() => handleSort("averageDistancePerShift")}>
                      Сред. пробег
                    </th>
                    <th>Первый спид.</th>
                    <th>Последний спид.</th>
                    <th onClick={() => handleSort("totalAlarms")}>Сработок</th>
                    <th>ОХ</th>
                    <th>Партнеры</th>
                    <th>Боевые</th>
                    <th>Ложные</th>
                    <th>Доп.</th>
                    <th onClick={() => handleSort("detained")}>Задержано</th>
                    <th onClick={() => handleSort("transferred")}>Передано</th>
                  </tr>
                </thead>

                <tbody>
                  {rows.map((row) => {
                    const expanded = expandedRows[row.vehicleId];
                    const additionalRows = getAdditionalRows(row);
                    const distanceRows = getDistanceRows(row);

                    return (
                      <Fragment key={row.vehicleId}>
                        <tr>
                          <td>
                            <button
                              className="row-toggle-button"
                              onClick={() => toggleRow(row.vehicleId)}
                            >
                              {expanded ? "−" : "+"}
                            </button>
                          </td>
                          <td>
                            <strong>{row.vehicleTitle}</strong>
                            {row.licensePlate && (
                              <div className="muted-text">{row.licensePlate}</div>
                            )}
                          </td>
                          <td>{row.cityName}</td>
                          <td>{row.totalShifts}</td>
                          <td>{row.totalTrips}</td>
                          <td>{formatKm(row.totalDistanceKm)}</td>
                          <td>{formatKm(row.averageDistancePerShift)}</td>
                          <td>{row.odometerStartFirstShift ?? "—"}</td>
                          <td>{row.odometerEndLastShift ?? "—"}</td>
                          <td>{row.totalAlarms}</td>
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
                            <td colSpan={17}>
                              <div className="expanded-content">
                                <h3>Детализация автомобиля</h3>

                                <div className="event-list">
                                  <div className="event-card">
                                    <strong>Спидометр за период</strong>

                                    <div className="event-grid">
                                      <span>
                                        Первая смена: {formatDate(row.firstShiftDate)}
                                      </span>
                                      <span>
                                        Первый спидометр:{" "}
                                        {row.odometerStartFirstShift ?? "—"}
                                      </span>
                                      <span>
                                        Последняя смена:{" "}
                                        {formatDate(row.lastShiftDate)}
                                      </span>
                                      <span>
                                        Последний спидометр:{" "}
                                        {row.odometerEndLastShift ?? "—"}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="event-card">
                                    <strong>Дополнительные сработки</strong>

                                    {additionalRows.length === 0 ? (
                                      <div className="muted-text">
                                        Нет дополнительных сработок
                                      </div>
                                    ) : (
                                      <div className="mini-table-wrap">
                                        <table className="mini-table">
                                          <thead>
                                            <tr>
                                              <th>Причина</th>
                                              <th>Всего</th>
                                              <th>ОХ</th>
                                              <th>Партнеры</th>
                                            </tr>
                                          </thead>

                                          <tbody>
                                            <tr>
                                              <td>
                                                <strong>Дополнительно</strong>
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
                                    <strong>Пробег по целям</strong>

                                    {distanceRows.length === 0 ? (
                                      <div className="muted-text">
                                        Нет данных по целям поездки
                                      </div>
                                    ) : (
                                      <div className="mini-table-wrap">
                                        <table className="mini-table">
                                          <thead>
                                            <tr>
                                              <th>Цель</th>
                                              <th>Пробег</th>
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
                Страница {pagination?.page ?? 1} из{" "}
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