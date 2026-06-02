import { useEffect, useMemo, useState } from "react";
import { getAccessibleCities } from "../../api/cities.api";
import type { City } from "../../api/cities.api";
import { getTripGoals } from "../../api/trip-goals.api";
import type { TripGoal } from "../../api/trip-goals.api";
import { AccordionSection } from "../../components/AccordionSection";
import {
  getCustomReport,
  downloadCustomReportExcel,
  type CustomReportMetric,
  type CustomReportGroupMode,
  type CustomReportResponse,
  type CustomReportTable,
} from "../../api/reports.api";

type PeriodMode = "month" | "quarter" | "year" | "custom";

type CustomReportSectionId =
  | "settings"
  | "metrics"
  | "tripGoals"
  | "compare"
  | "mainTable"
  | "compareTable"
  | "charts";

const metricOptions: {
  value: CustomReportMetric;
  label: string;
  hint: string;
}[] = [
  {
    value: "totalShifts",
    label: "Всего смен",
    hint: "С учетом часов: 24ч = 1 смена",
  },
  {
    value: "totalTrips",
    label: "Всего поездок",
    hint: "Количество поездок",
  },
  {
    value: "totalDistanceKm",
    label: "Пробег",
    hint: "Километры по поездкам",
  },
  {
    value: "totalAlarms",
    label: "Всего сработок",
    hint: "ОХ + партнеры + дополнительные",
  },
  {
    value: "falseTotal",
    label: "Ложные",
    hint: "Ложные обычные сработки",
  },
  {
    value: "combatTotal",
    label: "Боевые",
    hint: "Боевые обычные сработки",
  },
  {
    value: "additionalTotal",
    label: "Дополнительные",
    hint: "С подпунктами причин",
  },
  {
    value: "detained",
    label: "Задержано",
    hint: "С подпунктом передано в полицию",
  },
];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toDateInput(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}`;
}

function formatDateLabel(value: string) {
  if (!value) return "—";

  return new Date(`${value}T00:00:00`).toLocaleDateString("ru-RU");
}

function formatPeriodLabel(dateFrom: string, dateTo: string) {
  return `${formatDateLabel(dateFrom)} — ${formatDateLabel(dateTo)}`;
}

function getCurrentQuarter() {
  return Math.floor(new Date().getMonth() / 3) + 1;
}

function getPeriodRange(params: {
  mode: PeriodMode;
  year: number;
  month: number;
  quarter: number;
  dateFrom: string;
  dateTo: string;
}) {
  if (params.mode === "month") {
    const start = new Date(params.year, params.month - 1, 1);
    const end = new Date(params.year, params.month, 0);

    return {
      dateFrom: toDateInput(start),
      dateTo: toDateInput(end),
    };
  }

  if (params.mode === "quarter") {
    const startMonth = (params.quarter - 1) * 3;
    const start = new Date(params.year, startMonth, 1);
    const end = new Date(params.year, startMonth + 3, 0);

    return {
      dateFrom: toDateInput(start),
      dateTo: toDateInput(end),
    };
  }

  if (params.mode === "year") {
    return {
      dateFrom: `${params.year}-01-01`,
      dateTo: `${params.year}-12-31`,
    };
  }

  return {
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  };
}

function formatNumber(value: number) {
  return value.toLocaleString("ru-RU", {
    maximumFractionDigits: 2,
  });
}

function getMaxValue(values: number[]) {
  return Math.max(...values, 1);
}

function CustomReportTableView({
  title,
  table,
  periodLabel,
  open,
  onToggle,
}: {
  title: string;
  table: CustomReportTable;
  periodLabel?: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="panel-card custom-report-table-card">
      <AccordionSection
        title={title}
        subtitle={periodLabel || "Кастомная таблица по выбранным показателям"}
        open={open}
        onToggle={onToggle}
      >
        <div className="table-wrap">
          <table className="data-table custom-report-table">
            <thead>
              <tr>
                <th>Показатель</th>
                {table.columns.map((column) => (
                  <th key={column.key}>{column.label}</th>
                ))}
              </tr>
            </thead>

            <tbody>
              {table.rows.map((row) => (
                <tr
                  key={row.key}
                  className={row.level > 0 ? "custom-report-subrow" : ""}
                >
                  <td className="custom-report-label-cell">
                    <div
                      className={`custom-report-label custom-report-label-level-${row.level}`}
                    >
                      {row.level > 0 && (
                        <span className="custom-report-label-arrow">
                          {row.level === 1 ? "↳" : "•"}
                        </span>
                      )}
                      <span className="custom-report-label-text">
                        {row.label}
                      </span>
                    </div>
                  </td>

                  {table.columns.map((column) => (
                    <td key={column.key}>
                      {formatNumber(
                        column.key === "total"
                          ? row.total
                          : (row.groups[column.key] ?? 0),
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AccordionSection>
    </div>
  );
}

function SimpleBarChart({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: number }[];
}) {
  const max = getMaxValue(rows.map((row) => row.value));

  return (
    <div className="panel-card custom-chart-card">
      <div className="table-header">
        <div>
          <h2>{title}</h2>
          <p>График построен по сформированной таблице</p>
        </div>
      </div>

      <div className="custom-bars">
        {rows.length === 0 ? (
          <div className="empty-state">Нет данных для графика</div>
        ) : (
          rows.map((row) => (
            <div className="custom-bar-row" key={row.label}>
              <div className="custom-bar-label">{row.label}</div>

              <div className="custom-bar-track">
                <div
                  className="custom-bar-fill"
                  style={{
                    width: `${Math.max((row.value / max) * 100, 3)}%`,
                  }}
                />
              </div>

              <strong>{formatNumber(row.value)}</strong>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function AlarmGroupComparisonChart({
  title,
  rows,
}: {
  title: string;
  rows: {
    name: string;
    totalAlarms: number;
    falseTotal: number;
    combatTotal: number;
    additionalTotal: number;
  }[];
}) {
  const max = getMaxValue(
    rows.flatMap((row) => [
      row.totalAlarms,
      row.falseTotal,
      row.combatTotal,
      row.additionalTotal,
    ]),
  );

  return (
    <div className="panel-card custom-chart-card">
      <div className="table-header">
        <div>
          <h2>{title}</h2>
          <p>
            Всего сработок = обычные + дополнительные. Ложные и боевые относятся
            только к обычным сработкам.
          </p>
        </div>
      </div>

      <div className="alarm-comparison-list">
        {rows.length === 0 ? (
          <div className="empty-state">Нет данных для графика</div>
        ) : (
          rows.map((row) => (
            <div className="alarm-comparison-card" key={row.name}>
              <strong>{row.name}</strong>

              <div className="alarm-comparison-metrics">
                <div className="alarm-metric-row">
                  <span>Всего</span>

                  <div className="alarm-metric-track">
                    <div
                      className="alarm-metric-fill alarm-metric-total"
                      style={{
                        width: `${Math.max((row.totalAlarms / max) * 100, 3)}%`,
                      }}
                    />
                  </div>

                  <b>{formatNumber(row.totalAlarms)}</b>
                </div>

                <div className="alarm-metric-row">
                  <span>Ложные</span>

                  <div className="alarm-metric-track">
                    <div
                      className="alarm-metric-fill alarm-metric-false"
                      style={{
                        width: `${Math.max((row.falseTotal / max) * 100, 3)}%`,
                      }}
                    />
                  </div>

                  <b>{formatNumber(row.falseTotal)}</b>
                </div>

                <div className="alarm-metric-row">
                  <span>Боевые</span>

                  <div className="alarm-metric-track">
                    <div
                      className="alarm-metric-fill alarm-metric-combat"
                      style={{
                        width: `${Math.max((row.combatTotal / max) * 100, 3)}%`,
                      }}
                    />
                  </div>

                  <b>{formatNumber(row.combatTotal)}</b>
                </div>

                <div className="alarm-metric-row">
                  <span>Доп.</span>

                  <div className="alarm-metric-track">
                    <div
                      className="alarm-metric-fill alarm-metric-additional"
                      style={{
                        width: `${Math.max(
                          (row.additionalTotal / max) * 100,
                          3,
                        )}%`,
                      }}
                    />
                  </div>

                  <b>{formatNumber(row.additionalTotal)}</b>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function PeriodComparisonChart({
  rows,
}: {
  rows: {
    metric: CustomReportMetric;
    label: string;
    main: number;
    compare: number | null;
  }[];
}) {
  const max = getMaxValue(rows.flatMap((row) => [row.main, row.compare ?? 0]));

  return (
    <div className="panel-card custom-chart-card">
      <div className="table-header">
        <div>
          <h2>Сравнение периодов</h2>
          <p>Основной период сравнивается с выбранным периодом сравнения</p>
        </div>
      </div>

      <div className="period-comparison-list">
        {rows.length === 0 ? (
          <div className="empty-state">Нет данных для сравнения</div>
        ) : (
          rows.map((row) => {
            const compare = row.compare ?? 0;
            const diff = row.main - compare;

            return (
              <div className="period-comparison-card" key={row.metric}>
                <div className="period-comparison-title">
                  <strong>{row.label}</strong>

                  <span
                    className={diff >= 0 ? "positive-diff" : "negative-diff"}
                  >
                    {diff >= 0 ? "+" : ""}
                    {formatNumber(diff)}
                  </span>
                </div>

                <div className="period-metric-row">
                  <span>Основной</span>

                  <div className="period-metric-track">
                    <div
                      className="period-metric-fill period-main"
                      style={{
                        width: `${Math.max((row.main / max) * 100, 3)}%`,
                      }}
                    />
                  </div>

                  <b>{formatNumber(row.main)}</b>
                </div>

                <div className="period-metric-row">
                  <span>Сравнение</span>

                  <div className="period-metric-track">
                    <div
                      className="period-metric-fill period-compare"
                      style={{
                        width: `${Math.max((compare / max) * 100, 3)}%`,
                      }}
                    />
                  </div>

                  <b>{formatNumber(compare)}</b>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export function ReportsCustomPage() {
  const now = new Date();

  const [cities, setCities] = useState<City[]>([]);
  const [tripGoals, setTripGoals] = useState<TripGoal[]>([]);

  const [periodMode, setPeriodMode] = useState<PeriodMode>("month");
  const [periodYear, setPeriodYear] = useState(now.getFullYear());
  const [periodMonth, setPeriodMonth] = useState(now.getMonth() + 1);
  const [periodQuarter, setPeriodQuarter] = useState(getCurrentQuarter());

  const [customDateFrom, setCustomDateFrom] = useState(
    toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)),
  );
  const [customDateTo, setCustomDateTo] = useState(
    toDateInput(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  );

  const [compareEnabled, setCompareEnabled] = useState(false);
  const [compareYear, setCompareYear] = useState(now.getFullYear());
  const [compareMonth, setCompareMonth] = useState(
    now.getMonth() === 0 ? 12 : now.getMonth(),
  );
  const [compareQuarter, setCompareQuarter] = useState(
    Math.max(getCurrentQuarter() - 1, 1),
  );
  const [compareDateFrom, setCompareDateFrom] = useState(customDateFrom);
  const [compareDateTo, setCompareDateTo] = useState(customDateTo);

  const [cityId, setCityId] = useState<number>(0);
  const [groupMode, setGroupMode] = useState<CustomReportGroupMode>("city");

  const [metrics, setMetrics] = useState<CustomReportMetric[]>([
    "totalShifts",
    "totalTrips",
    "totalDistanceKm",
    "totalAlarms",
    "falseTotal",
    "combatTotal",
    "additionalTotal",
    "detained",
  ]);

  const [tripGoalIds, setTripGoalIds] = useState<number[]>([]);

  const [report, setReport] = useState<CustomReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [excelDownloading, setExcelDownloading] = useState(false);
  const [referencesLoading, setReferencesLoading] = useState(true);
  const [error, setError] = useState("");

  const [openedSections, setOpenedSections] = useState<
    Record<CustomReportSectionId, boolean>
  >({
    settings: false,
    metrics: false,
    tripGoals: false,
    compare: false,
    mainTable: true,
    compareTable: true,
    charts: true,
  });

  const [mainPeriodLabel, setMainPeriodLabel] = useState("");
  const [comparePeriodLabel, setComparePeriodLabel] = useState("");

  function toggleSection(sectionId: CustomReportSectionId) {
    setOpenedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  }

  const years = useMemo(() => {
    const current = new Date().getFullYear();

    return Array.from({ length: 8 }, (_, index) => current - index + 1);
  }, []);

  const activeTripGoals = useMemo(
    () => tripGoals.filter((goal) => goal.isActive),
    [tripGoals],
  );

  useEffect(() => {
    async function loadReferences() {
      setReferencesLoading(true);

      try {
        const [citiesData, goalsData] = await Promise.all([
          getAccessibleCities(false),
          getTripGoals(false),
        ]);

        setCities(citiesData);
        setTripGoals(goalsData);
      } catch {
        setError("Не удалось загрузить справочники");
      } finally {
        setReferencesLoading(false);
      }
    }

    loadReferences();
  }, []);

  function toggleMetric(metric: CustomReportMetric) {
    setMetrics((prev) =>
      prev.includes(metric)
        ? prev.filter((item) => item !== metric)
        : [...prev, metric],
    );
  }

  function toggleTripGoal(goalId: number) {
    setTripGoalIds((prev) =>
      prev.includes(goalId)
        ? prev.filter((item) => item !== goalId)
        : [...prev, goalId],
    );
  }

  function selectAllMetrics() {
    setMetrics(metricOptions.map((option) => option.value));
  }

  function clearMetrics() {
    setMetrics([]);
  }

  function selectAllTripGoals() {
    setTripGoalIds(activeTripGoals.map((goal) => goal.id));
  }

  function clearTripGoals() {
    setTripGoalIds([]);
  }

  function buildCurrentReportRequest() {
    const mainPeriod = getPeriodRange({
      mode: periodMode,
      year: periodYear,
      month: periodMonth,
      quarter: periodQuarter,
      dateFrom: customDateFrom,
      dateTo: customDateTo,
    });

    const comparePeriod = getPeriodRange({
      mode: periodMode,
      year: compareYear,
      month: compareMonth,
      quarter: compareQuarter,
      dateFrom: compareDateFrom,
      dateTo: compareDateTo,
    });

    const filters = {
      cityId: cityId || undefined,
      groupMode: cityId ? groupMode : "city",
      metrics,
      tripGoalIds,
      dateFrom: mainPeriod.dateFrom,
      dateTo: mainPeriod.dateTo,
      compareDateFrom: compareEnabled ? comparePeriod.dateFrom : undefined,
      compareDateTo: compareEnabled ? comparePeriod.dateTo : undefined,
    };

    return {
      mainPeriod,
      comparePeriod,
      filters,
    };
  }

  async function handleBuildReport() {
    if (metrics.length === 0) {
      setError("Выберите хотя бы один показатель");
      setOpenedSections((prev) => ({
        ...prev,
        settings: true,
        metrics: true,
      }));
      return;
    }

    const { mainPeriod, comparePeriod, filters } = buildCurrentReportRequest();

    setMainPeriodLabel(
      `Основной период: ${formatPeriodLabel(mainPeriod.dateFrom, mainPeriod.dateTo)}`,
    );

    setComparePeriodLabel(
      compareEnabled
        ? `Период сравнения: ${formatPeriodLabel(
            comparePeriod.dateFrom,
            comparePeriod.dateTo,
          )}`
        : "",
    );

    setLoading(true);
    setError("");

    try {
      const data = await getCustomReport(filters);

      setReport(data);

      setOpenedSections((prev) => ({
        ...prev,
        mainTable: true,
        compareTable: Boolean(data.data.compare),
        charts: true,
      }));
    } catch (err: any) {
      setError(err.response?.data?.message || "Не удалось сформировать отчет");
    } finally {
      setLoading(false);
    }
  }

  async function handleDownloadExcel() {
    if (metrics.length === 0) {
      setError("Выберите хотя бы один показатель");
      setOpenedSections((prev) => ({
        ...prev,
        settings: true,
        metrics: true,
      }));
      return;
    }

    const { mainPeriod, comparePeriod, filters } = buildCurrentReportRequest();

    setMainPeriodLabel(
      `Основной период: ${formatPeriodLabel(mainPeriod.dateFrom, mainPeriod.dateTo)}`,
    );

    setComparePeriodLabel(
      compareEnabled
        ? `Период сравнения: ${formatPeriodLabel(
            comparePeriod.dateFrom,
            comparePeriod.dateTo,
          )}`
        : "",
    );

    setExcelDownloading(true);
    setError("");

    try {
      await downloadCustomReportExcel(filters);
    } catch (err: any) {
      setError(err.response?.data?.message || "Не удалось скачать Excel");
    } finally {
      setExcelDownloading(false);
    }
  }

  useEffect(() => {
    handleBuildReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const periodComparisonRows =
    report?.data.charts.periodComparison.filter(
      (row) => row.compare !== null,
    ) ?? [];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Кастомный отчет</h1>
          <p>
            Настраиваемая аналитика по периодам, городам, нарядам и показателям
          </p>
        </div>
      </div>

      <div className="panel-card report-filters">
        <AccordionSection
          title="Настройки отчета"
          subtitle="Период, город, детализация, показатели и сравнение"
          open={openedSections.settings}
          onToggle={() => toggleSection("settings")}
        >
          <div className="custom-report-toolbar">
            <div>
              <strong>Параметры формирования</strong>
              <span>
                {mainPeriodLabel || "По умолчанию выбран текущий месяц"}
              </span>
            </div>

            <div className="table-header-actions">
              <button
                className="primary-button"
                onClick={handleBuildReport}
                disabled={loading || referencesLoading}
              >
                {loading ? "Формируем..." : "Сформировать"}
              </button>

              <button
                type="button"
                className="secondary-button"
                onClick={handleDownloadExcel}
                disabled={excelDownloading || loading || referencesLoading}
              >
                {excelDownloading ? "Скачиваем..." : "Скачать Excel"}
              </button>
            </div>
          </div>

          <div className="custom-report-filter-grid">
            <label className="field">
              <span>Период</span>
              <select
                value={periodMode}
                onChange={(event) =>
                  setPeriodMode(event.target.value as PeriodMode)
                }
              >
                <option value="month">Месяц</option>
                <option value="quarter">Квартал</option>
                <option value="year">Год</option>
                <option value="custom">Произвольный период</option>
              </select>
            </label>

            {periodMode !== "custom" && (
              <label className="field">
                <span>Год</span>
                <select
                  value={periodYear}
                  onChange={(event) =>
                    setPeriodYear(Number(event.target.value))
                  }
                >
                  {years.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {periodMode === "month" && (
              <label className="field">
                <span>Месяц</span>
                <select
                  value={periodMonth}
                  onChange={(event) =>
                    setPeriodMonth(Number(event.target.value))
                  }
                >
                  {Array.from({ length: 12 }, (_, index) => index + 1).map(
                    (month) => (
                      <option key={month} value={month}>
                        {month}
                      </option>
                    ),
                  )}
                </select>
              </label>
            )}

            {periodMode === "quarter" && (
              <label className="field">
                <span>Квартал</span>
                <select
                  value={periodQuarter}
                  onChange={(event) =>
                    setPeriodQuarter(Number(event.target.value))
                  }
                >
                  <option value={1}>1 квартал</option>
                  <option value={2}>2 квартал</option>
                  <option value={3}>3 квартал</option>
                  <option value={4}>4 квартал</option>
                </select>
              </label>
            )}

            {periodMode === "custom" && (
              <>
                <label className="field">
                  <span>Дата от</span>
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
              </>
            )}

            <label className="field">
              <span>Город</span>
              <select
                value={cityId}
                onChange={(event) => {
                  const nextCityId = Number(event.target.value);
                  setCityId(nextCityId);

                  if (!nextCityId) {
                    setGroupMode("city");
                  }
                }}
                disabled={referencesLoading}
              >
                <option value={0}>Все доступные города</option>

                {cities.map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Детализация</span>
              <select
                value={groupMode}
                onChange={(event) =>
                  setGroupMode(event.target.value as CustomReportGroupMode)
                }
                disabled={!cityId}
              >
                <option value="city">По городам</option>
                <option value="crew">По нарядам выбранного города</option>
              </select>
            </label>
          </div>

          <div className="custom-report-section">
            <AccordionSection
              title="Показатели"
              subtitle={`Выбрано: ${metrics.length} из ${metricOptions.length}`}
              open={openedSections.metrics}
              onToggle={() => toggleSection("metrics")}
            >
              <div className="custom-report-section-header">
                <div>
                  <strong>Показатели таблицы</strong>
                  <span>Выберите строки, которые нужно показать в отчете</span>
                </div>

                <div className="table-header-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={selectAllMetrics}
                  >
                    Выбрать все
                  </button>

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={clearMetrics}
                  >
                    Снять все
                  </button>
                </div>
              </div>

              <div className="custom-checkbox-grid">
                {metricOptions.map((option) => (
                  <label className="custom-checkbox-card" key={option.value}>
                    <input
                      type="checkbox"
                      checked={metrics.includes(option.value)}
                      onChange={() => toggleMetric(option.value)}
                    />

                    <span>
                      <strong>{option.label}</strong>
                      <small>{option.hint}</small>
                    </span>
                  </label>
                ))}
              </div>
            </AccordionSection>
          </div>

          <div className="custom-report-section">
            <AccordionSection
              title="Цели поездок"
              subtitle={
                tripGoalIds.length
                  ? `Дополнительных строк: ${tripGoalIds.length}`
                  : "Цели не выбраны — дополнительные строки не добавляются"
              }
              open={openedSections.tripGoals}
              onToggle={() => toggleSection("tripGoals")}
            >
              <div className="custom-report-section-header">
                <div>
                  <strong>Дополнительные строки по целям</strong>
                  <span>
                    Выбранные цели добавляются вложенными строками под “Всего
                    поездок”
                  </span>
                </div>

                <div className="table-header-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={selectAllTripGoals}
                  >
                    Выбрать все
                  </button>

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={clearTripGoals}
                  >
                    Сбросить цели
                  </button>
                </div>
              </div>

              <div className="custom-checkbox-grid">
                {activeTripGoals.map((goal) => (
                  <label className="custom-checkbox-card" key={goal.id}>
                    <input
                      type="checkbox"
                      checked={tripGoalIds.includes(goal.id)}
                      onChange={() => toggleTripGoal(goal.id)}
                    />

                    <span>
                      <strong>{goal.name}</strong>
                      <small>Добавить отдельную строку в отчет</small>
                    </span>
                  </label>
                ))}
              </div>
            </AccordionSection>
          </div>

          <div className="custom-report-section">
            <AccordionSection
              title="Сравнительный период"
              subtitle={
                compareEnabled
                  ? comparePeriodLabel || "Сравнение включено"
                  : "Сравнение выключено"
              }
              open={openedSections.compare}
              onToggle={() => toggleSection("compare")}
            >
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={compareEnabled}
                  onChange={(event) => setCompareEnabled(event.target.checked)}
                />
                <span>Добавить сравнительный отчет</span>
              </label>

              {compareEnabled && (
                <div className="custom-report-filter-grid">
                  {periodMode !== "custom" && (
                    <label className="field">
                      <span>Год сравнения</span>
                      <select
                        value={compareYear}
                        onChange={(event) =>
                          setCompareYear(Number(event.target.value))
                        }
                      >
                        {years.map((year) => (
                          <option key={year} value={year}>
                            {year}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  {periodMode === "month" && (
                    <label className="field">
                      <span>Месяц сравнения</span>
                      <select
                        value={compareMonth}
                        onChange={(event) =>
                          setCompareMonth(Number(event.target.value))
                        }
                      >
                        {Array.from(
                          { length: 12 },
                          (_, index) => index + 1,
                        ).map((month) => (
                          <option key={month} value={month}>
                            {month}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  {periodMode === "quarter" && (
                    <label className="field">
                      <span>Квартал сравнения</span>
                      <select
                        value={compareQuarter}
                        onChange={(event) =>
                          setCompareQuarter(Number(event.target.value))
                        }
                      >
                        <option value={1}>1 квартал</option>
                        <option value={2}>2 квартал</option>
                        <option value={3}>3 квартал</option>
                        <option value={4}>4 квартал</option>
                      </select>
                    </label>
                  )}

                  {periodMode === "custom" && (
                    <>
                      <label className="field">
                        <span>Дата сравнения от</span>
                        <input
                          type="date"
                          value={compareDateFrom}
                          onChange={(event) =>
                            setCompareDateFrom(event.target.value)
                          }
                        />
                      </label>

                      <label className="field">
                        <span>Дата сравнения до</span>
                        <input
                          type="date"
                          value={compareDateTo}
                          onChange={(event) =>
                            setCompareDateTo(event.target.value)
                          }
                        />
                      </label>
                    </>
                  )}
                </div>
              )}
            </AccordionSection>
          </div>
        </AccordionSection>
      </div>

      {error && <div className="form-error report-error">{error}</div>}

      {!report ? (
        <div className="empty-state">Сформируйте отчет</div>
      ) : (
        <>
          <CustomReportTableView
            title="Основной отчет"
            table={report.data.main.table}
            periodLabel={mainPeriodLabel}
            open={openedSections.mainTable}
            onToggle={() => toggleSection("mainTable")}
          />

          {report.data.compare && (
            <CustomReportTableView
              title="Сравнительный отчет"
              table={report.data.compare.table}
              periodLabel={comparePeriodLabel}
              open={openedSections.compareTable}
              onToggle={() => toggleSection("compareTable")}
            />
          )}

          <div className="panel-card custom-report-charts-card">
            <AccordionSection
              title="Графики"
              subtitle="Визуальная аналитика по сформированной таблице"
              open={openedSections.charts}
              onToggle={() => toggleSection("charts")}
            >
              <div className="content-grid custom-charts-grid">
                <AlarmGroupComparisonChart
                  title={
                    cityId && groupMode === "crew"
                      ? "Сравнение нарядов по сработкам"
                      : "Сравнение городов по сработкам"
                  }
                  rows={report.data.charts.byGroups.map((group) => ({
                    name: group.name,
                    totalAlarms: group.totalAlarms,
                    falseTotal: group.falseTotal,
                    combatTotal: group.combatTotal,
                    additionalTotal: group.additionalTotal,
                  }))}
                />

                {report.data.compare && (
                  <PeriodComparisonChart rows={periodComparisonRows} />
                )}

                <SimpleBarChart
                  title="Причины дополнительных сработок"
                  rows={report.data.charts.additionalReasons.map((reason) => ({
                    label: reason.reasonName,
                    value: reason.total,
                  }))}
                />
              </div>
            </AccordionSection>
          </div>
        </>
      )}
    </div>
  );
}
