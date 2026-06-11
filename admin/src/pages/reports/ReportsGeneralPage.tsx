import { useEffect, useMemo, useState } from "react";
import {
  downloadReportsExcel,
  getGeneralReport,
} from "../../api/reports.api";
import type {
  GeneralByCityRow,
  GeneralReportResponse,
  GeneralTotals,
  ReportFilters,
} from "../../api/reports.api";
import { ReportFiltersPanel } from "./ReportFiltersPanel";

function numberValue(value: number | undefined) {
  return value ?? 0;
}

function formatNumber(value: number | undefined) {
  return numberValue(value).toLocaleString("uk-UA");
}

function formatKm(value: number | undefined) {
  return `${formatNumber(value)} км`;
}

function getAdditionalReasonRows(totals?: GeneralTotals) {
  if (!totals) return [];

  return Object.entries(totals.additionalByReason ?? {}).map(
    ([reasonName, stats]) => ({
      reasonName,
      ...stats,
    })
  );
}

export function ReportsGeneralPage() {
  const [filters, setFilters] = useState<ReportFilters>({});
  const [appliedFilters, setAppliedFilters] = useState<ReportFilters>({});

  const [report, setReport] = useState<GeneralReportResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [excelLoading, setExcelLoading] = useState(false);
  const [error, setError] = useState("");

  const totals = report?.data.totals;
  const byCity = report?.data.byCity ?? [];

  const additionalRows = useMemo(
    () => getAdditionalReasonRows(totals),
    [totals]
  );

  async function loadReport(nextFilters = appliedFilters) {
    setLoading(true);
    setError("");

    try {
      const data = await getGeneralReport(nextFilters);
      setReport(data);
    } catch {
      setError("Не вдалося завантажити звіт");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReport({});
  }, []);

  async function handleApply() {
    setAppliedFilters(filters);
    await loadReport(filters);
  }

  async function handleReset() {
    setFilters({});
    setAppliedFilters({});
    await loadReport({});
  }

  async function handleExcel() {
    setExcelLoading(true);
    setError("");

    try {
      await downloadReportsExcel(appliedFilters);
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
          <h1>Загальна статистика</h1>
          <p>Зведений звіт за містами, спрацюваннями, пробігом і затриманнями</p>
        </div>
      </div>

      <ReportFiltersPanel
        value={filters}
        onChange={setFilters}
        onApply={handleApply}
        onReset={handleReset}
        onExcel={handleExcel}
        loading={loading}
        excelLoading={excelLoading}
      />

      {error && <div className="form-error report-error">{error}</div>}

      {loading ? (
        <div className="empty-state">Завантаження звіту...</div>
      ) : (
        <>
          <div className="stats-grid report-stats-grid">
            <div className="stat-card">
              <span>Змін</span>
              <strong>{formatNumber(totals?.totalShifts)}</strong>
            </div>

            <div className="stat-card">
              <span>Поїздок</span>
              <strong>{formatNumber(totals?.totalTrips)}</strong>
            </div>

            <div className="stat-card">
              <span>Пробіг</span>
              <strong>{formatKm(totals?.totalDistanceKm)}</strong>
            </div>

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
              <strong>{formatNumber(totals?.additionalTotal)}</strong>
            </div>

            <div className="stat-card">
              <span>Затримано / Передано</span>
              <strong>
                {formatNumber(totals?.detained)} /{" "}
                {formatNumber(totals?.transferred)}
              </strong>
            </div>

            <div className="stat-card">
              <span>Середнє навантаження</span>
              <strong>{formatNumber(totals?.averageAlarmsPerShift)}</strong>
            </div>

            <div className="stat-card">
              <span>Середній пробіг</span>
              <strong>{formatKm(totals?.averageDistancePerShift)}</strong>
            </div>
          </div>

          <div className="report-grid">
            <div className="panel-card table-card">
              <div className="table-header">
                <div>
                  <h2>Статистика за містами</h2>
                  <p>Порівняння міст за вибраний період</p>
                </div>
              </div>

              {byCity.length === 0 ? (
                <div className="empty-state">Немає даних за містами</div>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Місто</th>
                        <th>Змін</th>
                        <th>Поїздок</th>
                        <th>Пробіг</th>
                        <th>Спрацювань</th>
                        <th>ОХ</th>
                        <th>Партнери</th>
                        <th>Бойові</th>
                        <th>Хибні</th>
                        <th>Дод.</th>
                        <th>Затримано</th>
                        <th>Передано</th>
                        <th>Середня</th>
                      </tr>
                    </thead>

                    <tbody>
                      {byCity.map((row: GeneralByCityRow) => (
                        <tr key={row.cityId}>
                          <td>
                            <strong>{row.cityName}</strong>
                          </td>
                          <td>{formatNumber(row.totalShifts)}</td>
                          <td>{formatNumber(row.totalTrips)}</td>
                          <td>{formatKm(row.totalDistanceKm)}</td>
                          <td>{formatNumber(row.totalAlarms)}</td>
                          <td>{formatNumber(row.totalOh)}</td>
                          <td>{formatNumber(row.totalPartner)}</td>
                          <td>{formatNumber(row.combatTotal)}</td>
                          <td>{formatNumber(row.falseTotal)}</td>
                          <td>{formatNumber(row.additionalTotal)}</td>
                          <td>{formatNumber(row.detained)}</td>
                          <td>{formatNumber(row.transferred)}</td>
                          <td>{formatNumber(row.averageAlarmsPerShift)}</td>
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
                  <h2>Додаткові спрацювання</h2>
                  <p>Розбивка за причинами: усього / ОХ / партнери</p>
                </div>
              </div>

              {additionalRows.length === 0 ? (
                <div className="empty-state">Немає додаткових спрацювань</div>
              ) : (
                <div className="table-wrap">
                  <table className="data-table compact-data-table">
                    <thead>
                      <tr>
                        <th>Причина</th>
                        <th>Усього</th>
                        <th>ОХ</th>
                        <th>Партнери</th>
                      </tr>
                    </thead>

                    <tbody>
                      <tr className="summary-row">
                        <td>
                          <strong>Додатково</strong>
                        </td>
                        <td>{formatNumber(totals?.additionalTotal)}</td>
                        <td>{formatNumber(totals?.additionalOh)}</td>
                        <td>{formatNumber(totals?.additionalPartner)}</td>
                      </tr>

                      {additionalRows.map((row) => (
                        <tr key={row.reasonName}>
                          <td className="nested-cell">— {row.reasonName}</td>
                          <td>{formatNumber(row.total)}</td>
                          <td>{formatNumber(row.oh)}</td>
                          <td>{formatNumber(row.partner)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}