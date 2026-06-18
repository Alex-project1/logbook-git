import { useEffect, useMemo, useState } from "react";
import { getAdminMe } from "../api/auth.api";
import type { AdminUser } from "../api/auth.api";
import {
  getEmployeesTableReport,
  getGeneralReport,
} from "../api/reports.api";
import type {
  EmployeesTableResponse,
  GeneralReportResponse,
  ReportFilters,
} from "../api/reports.api";

type PeriodKey = "today" | "7days" | "30days" | "all" | "custom";

const periodOptions: {
  key: PeriodKey;
  label: string;
}[] = [
  { key: "today", label: "Сьогодні" },
  { key: "7days", label: "7 днів" },
  { key: "30days", label: "30 днів" },
  { key: "all", label: "Увесь час" },
];

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getPeriodFilters(
  period: PeriodKey,
  customDateFrom = "",
  customDateTo = ""
): ReportFilters {
  if (period === "custom") {
    return {
      dateFrom: customDateFrom || undefined,
      dateTo: customDateTo || undefined,
    };
  }

  if (period === "all") {
    return {};
  }

  const today = new Date();
  const from = new Date(today);

  if (period === "today") {
    return {
      dateFrom: toDateInputValue(today),
      dateTo: toDateInputValue(today),
    };
  }

  if (period === "7days") {
    from.setDate(today.getDate() - 6);

    return {
      dateFrom: toDateInputValue(from),
      dateTo: toDateInputValue(today),
    };
  }

  from.setDate(today.getDate() - 29);

  return {
    dateFrom: toDateInputValue(from),
    dateTo: toDateInputValue(today),
  };
}

function formatNumber(value: number) {
  return value.toLocaleString("uk-UA", {
    maximumFractionDigits: 2,
  });
}

function formatKm(value: number) {
  return `${formatNumber(value)} км`;
}

function getPeriodLabel(filters: ReportFilters) {
  if (filters.dateFrom && filters.dateTo) {
    return `${filters.dateFrom} — ${filters.dateTo}`;
  }

  if (filters.dateFrom) {
    return `з ${filters.dateFrom}`;
  }

  if (filters.dateTo) {
    return `до ${filters.dateTo}`;
  }

  return "Усі дані за весь час";
}

export function DashboardPage() {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [generalReport, setGeneralReport] =
    useState<GeneralReportResponse | null>(null);
  const [employeesReport, setEmployeesReport] =
    useState<EmployeesTableResponse | null>(null);

  const [period, setPeriod] = useState<PeriodKey>("30days");
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const filters = useMemo(
    () => getPeriodFilters(period, customDateFrom, customDateTo),
    [period, customDateFrom, customDateTo]
  );

  async function loadDashboard(
    nextPeriod = period,
    nextCustomDateFrom = customDateFrom,
    nextCustomDateTo = customDateTo
  ) {
    setLoading(true);
    setError("");

    try {
      const nextFilters = getPeriodFilters(
        nextPeriod,
        nextCustomDateFrom,
        nextCustomDateTo
      );

      const [meResponse, generalData, employeesData] = await Promise.all([
        getAdminMe(),
        getGeneralReport(nextFilters),
        getEmployeesTableReport({
          ...nextFilters,
          page: 1,
          pageSize: 10,
          sortBy: "totalShifts",
          sortDir: "desc",
        }),
      ]);

      setUser(meResponse.user);
      setGeneralReport(generalData);
      setEmployeesReport(employeesData);
    } catch {
      setError("Не вдалося завантажити дані панелі керування");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard("30days", "", "");
  }, []);

  async function handlePeriodChange(nextPeriod: PeriodKey) {
    setPeriod(nextPeriod);
    await loadDashboard(nextPeriod, customDateFrom, customDateTo);
  }

  async function handleCustomPeriodApply() {
    if (customDateFrom && customDateTo && customDateFrom > customDateTo) {
      setError("Дата початку не може бути пізніше дати завершення");
      return;
    }

    setPeriod("custom");
    await loadDashboard("custom", customDateFrom, customDateTo);
  }

  if (loading && !generalReport) {
    return <div className="page">Завантаження...</div>;
  }

  const generalTotals = generalReport?.data.totals;
  const employeeSummary = employeesReport?.summary;

  const machineShifts = generalTotals?.totalShifts ?? 0;
  const postDutyEquivalent = employeeSummary?.postDutyShiftEquivalent ?? 0;
  const postDutyHours = employeeSummary?.postDutyHours ?? 0;
  const postDutyCount = employeeSummary?.postDutyCount ?? 0;
  const postDutyRecordCount =
    (
      employeeSummary as
        | {
            postDutyRecordCount?: number;
          }
        | undefined
    )?.postDutyRecordCount ?? 0;
  const totalShiftsWithPosts = machineShifts + postDutyEquivalent;

  const topEmployees = employeesReport?.data ?? [];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Панель керування</h1>
          <p>Оперативне зведення щодо змін, постів, спрацювань і навантаження</p>
        </div>

        {user && (
          <div className="user-card">
            <strong>{user.name}</strong>
            <span>{user.role.name}</span>
          </div>
        )}
      </div>

      <div className="panel-card dashboard-toolbar">
        <div className="dashboard-toolbar-main">
          <div>
            <h2>Період</h2>
            <p>{getPeriodLabel(filters)}</p>
          </div>

          <div className="dashboard-period-buttons">
            {periodOptions.map((option) => (
              <button
                key={option.key}
                className={
                  period === option.key ? "primary-button" : "secondary-button"
                }
                onClick={() => handlePeriodChange(option.key)}
                disabled={loading}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="dashboard-custom-period">
          <label className="field">
            <span>Дата від</span>
            <input
              type="date"
              value={customDateFrom}
              onChange={(event) => setCustomDateFrom(event.target.value)}
            />
          </label>

          <label className="field">
            <span>Дата до</span>
            <input
              type="date"
              value={customDateTo}
              onChange={(event) => setCustomDateTo(event.target.value)}
            />
          </label>

          <button
            className={period === "custom" ? "primary-button" : "secondary-button"}
            onClick={handleCustomPeriodApply}
            disabled={loading}
          >
            Застосувати період
          </button>
        </div>
      </div>

      {error && <div className="form-error report-error">{error}</div>}

      <div className="stats-grid dashboard-stats-grid">
        <div className="stat-card">
          <span>Усього змін із постами</span>
          <strong>{formatNumber(totalShiftsWithPosts)}</strong>
          <small>
            Наряди ГШР: {formatNumber(machineShifts)} · Пости:{" "}
            {formatNumber(postDutyEquivalent)}
          </small>
        </div>

        <div className="stat-card">
          <span>Постових людино-змін</span>
          <strong>{formatNumber(postDutyCount)}</strong>
          <small>
            {formatNumber(postDutyRecordCount)} чергування ·{" "}
            {formatNumber(postDutyCount)} співробітники ·{" "}
            {formatNumber(postDutyHours)} год
          </small>
        </div>

        <div className="stat-card">
          <span>Поїздок</span>
          <strong>{formatNumber(generalTotals?.totalTrips ?? 0)}</strong>
        </div>

        <div className="stat-card">
          <span>Пробіг</span>
          <strong>{formatKm(generalTotals?.totalDistanceKm ?? 0)}</strong>
        </div>

        <div className="stat-card">
          <span>Спрацювань</span>
          <strong>{formatNumber(generalTotals?.totalAlarms ?? 0)}</strong>
        </div>

        <div className="stat-card">
          <span>ОХ / Партнери</span>
          <strong>
            {formatNumber(generalTotals?.totalOh ?? 0)} /{" "}
            {formatNumber(generalTotals?.totalPartner ?? 0)}
          </strong>
        </div>

        <div className="stat-card">
          <span>Бойові / Хибні</span>
          <strong>
            {formatNumber(generalTotals?.combatTotal ?? 0)} /{" "}
            {formatNumber(generalTotals?.falseTotal ?? 0)}
          </strong>
        </div>

        <div className="stat-card">
          <span>Затримано / Передано</span>
          <strong>
            {formatNumber(generalTotals?.detained ?? 0)} /{" "}
            {formatNumber(generalTotals?.transferred ?? 0)}
          </strong>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="panel-card">
          <div className="table-header">
            <div>
              <h2>Топ співробітників за навантаженням</h2>
              <p>З урахуванням нарядів ГШР і постових чергувань</p>
            </div>
          </div>

          {topEmployees.length === 0 ? (
            <div className="empty-state">Немає даних за вибраний період</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table compact-data-table">
                <thead>
                  <tr>
                    <th>Співробітник</th>
                    <th>Місто</th>
                    <th>Змін</th>
                    <th>Пости</th>
                    <th>Зі зброєю</th>
                  </tr>
                </thead>

                <tbody>
                  {topEmployees.slice(0, 10).map((row) => (
                    <tr key={`${row.employeeId}_${row.cityId}`}>
                      <td>
                        <strong>{row.fullName}</strong>
                      </td>
                      <td>{row.cityName}</td>
                      <td>{formatNumber(row.totalShifts)}</td>
                      <td>{formatNumber(row.postDutyShiftEquivalent)}</td>
                      <td>{formatNumber(row.weaponShifts)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="panel-card dashboard-insights-card">
          <div className="table-header">
            <div>
              <h2>Підсумки за постами</h2>
              <p>Чергування рахуються як години / 24</p>
            </div>
          </div>

          <div className="dashboard-insights-list">
            <div className="dashboard-insight-card">
              <div className="dashboard-insight-head">
                <strong>Додаткові пости</strong>
                <span>Постові чергування</span>
              </div>

              <div className="dashboard-metric-grid">
                <div className="dashboard-metric">
                  <span>Еквівалент змін</span>
                  <strong>{formatNumber(postDutyEquivalent)}</strong>
                </div>

                <div className="dashboard-metric">
                  <span>Години</span>
                  <strong>{formatNumber(postDutyHours)}</strong>
                </div>

                <div className="dashboard-metric">
                  <span>Чергування</span>
                  <strong>{formatNumber(postDutyRecordCount)}</strong>
                </div>

                <div className="dashboard-metric">
                  <span>Людино-зміни</span>
                  <strong>{formatNumber(postDutyCount)}</strong>
                </div>
              </div>
            </div>

            <div className="dashboard-insight-card">
              <div className="dashboard-insight-head">
                <strong>Спрацювання</strong>
                <span>Оперативні показники</span>
              </div>

              <div className="dashboard-metric-grid">
                <div className="dashboard-metric">
                  <span>Усього</span>
                  <strong>{formatNumber(generalTotals?.totalAlarms ?? 0)}</strong>
                </div>

                <div className="dashboard-metric">
                  <span>ОХ</span>
                  <strong>{formatNumber(generalTotals?.totalOh ?? 0)}</strong>
                </div>

                <div className="dashboard-metric">
                  <span>Партнери</span>
                  <strong>
                    {formatNumber(generalTotals?.totalPartner ?? 0)}
                  </strong>
                </div>

                <div className="dashboard-metric dashboard-metric-wide">
                  <span>Додаткові спрацювання</span>
                  <strong>
                    {formatNumber(generalTotals?.additionalTotal ?? 0)}
                  </strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {loading && <div className="muted-text">Оновлення даних...</div>}
    </div>
  );
}