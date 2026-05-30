import { Fragment, useEffect, useMemo, useState } from "react";
import { getCities } from "../../api/cities.api";
import type { City } from "../../api/cities.api";
import { getCrews } from "../../api/crews.api";
import type { Crew } from "../../api/crews.api";
import { getEmployees } from "../../api/employees.api";
import type { Employee } from "../../api/employees.api";
import {
  downloadEmployeesTableExcel,
  getEmployeesTableReport,
} from "../../api/reports.api";
import type {
  EmployeeTableRow,
  EmployeesTableFilters,
  EmployeesTableResponse,
} from "../../api/reports.api";
import { getVehicles } from "../../api/vehicles.api";
import type { Vehicle } from "../../api/vehicles.api";

const defaultFilters: EmployeesTableFilters = {
  page: 1,
  pageSize: 20,
  sortBy: "totalAlarms",
  sortDir: "desc",
};

function formatNumber(value: number) {
  return value.toLocaleString("ru-RU");
}

function formatKm(value: number) {
  return `${formatNumber(value)} км`;
}

function getAdditionalRows(row: EmployeeTableRow) {
  return Object.entries(row.additionalByReason ?? {}).map(
    ([reasonName, stats]) => ({
      reasonName,
      ...stats,
    })
  );
}
function getPostDutyRows(row: EmployeeTableRow) {
  return Object.entries(row.postDutyByPost ?? {}).map(([postName, stats]) => ({
    postName,
    ...stats,
  }));
}
export function ReportsEmployeesPage() {
  const [filters, setFilters] =
    useState<EmployeesTableFilters>(defaultFilters);

  const [report, setReport] = useState<EmployeesTableResponse | null>(null);

  const [cities, setCities] = useState<City[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

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
      const data = await getEmployeesTableReport(nextFilters);
      setReport(data);
      setExpandedRows({});
    } catch {
      setError("Не удалось загрузить отчет по сотрудникам");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReferences();
    loadReport(defaultFilters);
  }, []);

  function updateFilter<Key extends keyof EmployeesTableFilters>(
    key: Key,
    value: EmployeesTableFilters[Key]
  ) {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
      page: key === "page" ? (value as number) : 1,
    }));
  }

  async function handleApply() {
    const nextFilters: EmployeesTableFilters = {
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
    const nextFilters: EmployeesTableFilters = {
      ...filters,
      page,
    };

    setFilters(nextFilters);
    await loadReport(nextFilters);
  }

  async function handlePageSizeChange(pageSize: number) {
    const nextFilters: EmployeesTableFilters = {
      ...filters,
      page: 1,
      pageSize,
    };

    setFilters(nextFilters);
    await loadReport(nextFilters);
  }

  async function handleSort(
    sortBy: NonNullable<EmployeesTableFilters["sortBy"]>
  ) {
    const nextSortDir: "asc" | "desc" =
      filters.sortBy === sortBy && filters.sortDir === "desc" ? "asc" : "desc";

    const nextFilters: EmployeesTableFilters = {
      ...filters,
      sortBy,
      sortDir: nextSortDir,
      page: 1,
    };

    setFilters(nextFilters);
    await loadReport(nextFilters);
  }

  function getRowKey(row: EmployeeTableRow) {
    return `${row.employeeId}_${row.cityId}`;
  }

  function toggleRow(rowKey: string) {
    setExpandedRows((prev) => ({
      ...prev,
      [rowKey]: !prev[rowKey],
    }));
  }

  async function handleExcel() {
    setExcelLoading(true);
    setError("");

    try {
      await downloadEmployeesTableExcel(filters);
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
          <h1>По сотрудникам</h1>
          <p>
            Статистика по сменам, ролям, оружию, сработкам, нагрузке и
            задержаниям
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
              placeholder="ФИО, город, наряд, авто..."
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
          <span>Сотрудников</span>
          <strong>{formatNumber(report?.summary.totalEmployees ?? 0)}</strong>
        </div>

        <div className="stat-card">
          <span>Смен</span>
          <strong>{formatNumber(report?.summary.totalShifts ?? 0)}</strong>
        </div>

        <div className="stat-card">
          <span>Водителем / Старшим</span>
          <strong>
            {formatNumber(report?.summary.driverShifts ?? 0)} /{" "}
            {formatNumber(report?.summary.seniorShifts ?? 0)}
          </strong>
        </div>

        <div className="stat-card">
          <span>С оружием</span>
          <strong>{formatNumber(report?.summary.weaponShifts ?? 0)}</strong>
        </div>
        <div className="stat-card">
          <span>Дополнительно</span>
          <strong>
            {formatNumber(report?.summary.postDutyShiftEquivalent ?? 0)}
          </strong>
          <small>
            {formatNumber(report?.summary.postDutyHours ?? 0)} ч ·{" "}
            {formatNumber(report?.summary.postDutyCount ?? 0)} выходов
          </small>
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
            <h2>Сотрудники</h2>
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
          <div className="empty-state">Загрузка сотрудников...</div>
        ) : rows.length === 0 ? (
          <div className="empty-state">
            Сотрудники по выбранным фильтрам не найдены
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="data-table employees-report-table">
                <thead>
                  <tr>
                    <th></th>
                    <th onClick={() => handleSort("fullName")}>ФИО</th>
                    <th>Город</th>
                    <th onClick={() => handleSort("totalShifts")}>Смен</th>
                    <th onClick={() => handleSort("driverShifts")}>Водителем</th>
                    <th onClick={() => handleSort("seniorShifts")}>Старшим</th>
                    <th onClick={() => handleSort("weaponShifts")}>С оружием</th>
                    <th>Дополнительно</th>
                    <th onClick={() => handleSort("totalAlarms")}>Сработок</th>
                    <th onClick={() => handleSort("averageAlarmsPerShift")}>
                      Средняя
                    </th>
                    <th>ОХ</th>
                    <th>Партнеры</th>
                    <th>Боевые</th>
                    <th>Ложные</th>
                    <th>Доп.</th>
                    <th onClick={() => handleSort("detained")}>Задержано</th>
                    <th onClick={() => handleSort("transferred")}>Передано</th>
                    <th onClick={() => handleSort("totalDistanceKm")}>Пробег</th>
                  </tr>
                </thead>

                <tbody>
                  {rows.map((row) => {
                    const rowKey = getRowKey(row);
                    const expanded = expandedRows[rowKey];
                    const additionalRows = getAdditionalRows(row);
                    const postDutyRows = getPostDutyRows(row);

                    return (
                      <Fragment key={rowKey}>
                        <tr>
                          <td>
                            <button
                              className="row-toggle-button"
                              onClick={() => toggleRow(rowKey)}
                            >
                              {expanded ? "−" : "+"}
                            </button>
                          </td>
                          <td>
                            <strong>{row.fullName}</strong>
                          </td>
                          <td>{row.cityName}</td>
                          <td>{row.totalShifts}</td>
                          <td>{row.driverShifts}</td>
                          <td>{row.seniorShifts}</td>
                          <td>{row.weaponShifts}</td>
                          <td>{row.postDutyShiftEquivalent}</td>
                          <td>{row.totalAlarms}</td>
                          <td>{row.averageAlarmsPerShift}</td>
                          <td>{row.totalOh}</td>
                          <td>{row.totalPartner}</td>
                          <td>{row.combatTotal}</td>
                          <td>{row.falseTotal}</td>
                          <td>{row.additionalTotal}</td>
                          <td>{row.detained}</td>
                          <td>{row.transferred}</td>
                          <td>{formatKm(row.totalDistanceKm)}</td>
                        </tr>

                        {expanded && (
                          <tr className="expanded-row">
                            <td colSpan={18}>
                              <div className="expanded-content">
                                <h3>Детализация сотрудника</h3>

                                <div className="event-list">
                                  <div className="event-card">
                                    <strong>Роли и нагрузка</strong>

                                    <div className="event-grid">
                                      <span>Всего смен: {row.totalShifts}</span>
                                      <span>Водителем: {row.driverShifts}</span>
                                      <span>Старшим: {row.seniorShifts}</span>
                                      <span>С оружием: {row.weaponShifts}</span>
                                      <span>Дополнительно: {row.postDutyShiftEquivalent}</span>
                                      <span>Постовые часы: {row.postDutyHours}</span>
                                      <span>Выходов на посты: {row.postDutyCount}</span>
                                      <span>
                                        Средняя нагрузка: {row.averageAlarmsPerShift}
                                      </span>
                                      <span>Пробег: {formatKm(row.totalDistanceKm)}</span>
                                    </div>
                                  </div>
                                  <div className="event-card">
                                    <strong>Дополнительные посты</strong>

                                    {postDutyRows.length === 0 ? (
                                      <div className="muted-text">
                                        Нет постовых дежурств
                                      </div>
                                    ) : (
                                      <div className="mini-table-wrap">
                                        <table className="mini-table">
                                          <thead>
                                            <tr>
                                              <th>Пост</th>
                                              <th>Смен</th>
                                              <th>Часы</th>
                                              <th>Выходов</th>
                                            </tr>
                                          </thead>

                                          <tbody>
                                            <tr>
                                              <td>
                                                <strong>Дополнительно</strong>
                                              </td>
                                              <td>{row.postDutyShiftEquivalent}</td>
                                              <td>{row.postDutyHours}</td>
                                              <td>{row.postDutyCount}</td>
                                            </tr>

                                            {postDutyRows.map((post) => (
                                              <tr key={post.postName}>
                                                <td>— {post.postName}</td>
                                                <td>{post.shiftEquivalent}</td>
                                                <td>{post.hours}</td>
                                                <td>{post.count}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
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