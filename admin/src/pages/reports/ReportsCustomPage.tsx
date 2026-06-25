import { Fragment, useEffect, useMemo, useState, type CSSProperties } from "react";
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
  | "dynamicsTable"
  | "charts";

const metricOptions: {
  value: CustomReportMetric;
  label: string;
  hint: string;
}[] = [
  {
    value: "totalShifts",
    label: "Усього змін",
    hint: "З урахуванням годин: 24 год = 1 зміна",
  },
  {
    value: "totalTrips",
    label: "Усього поїздок",
    hint: "Кількість поїздок",
  },
  {
    value: "totalDistanceKm",
    label: "Пробіг",
    hint: "Кілометри за поїздками",
  },
  {
    value: "totalAlarms",
    label: "Усього спрацювань",
    hint: "ОХ + партнери + додаткові",
  },
  {
    value: "falseTotal",
    label: "Хибні",
    hint: "Хибні звичайні спрацювання",
  },
  {
    value: "combatTotal",
    label: "Бойові",
    hint: "Бойові звичайні спрацювання",
  },
  {
    value: "additionalTotal",
    label: "Додаткові",
    hint: "З підпунктами причин",
  },
  {
    value: "detained",
    label: "Затримано",
    hint: "З підпунктом передано до поліції",
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

  return new Date(`${value}T00:00:00`).toLocaleDateString("uk-UA");
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
  return value.toLocaleString("uk-UA", {
    maximumFractionDigits: 2,
  });
}

function getMaxValue(values: number[]) {
  return Math.max(...values, 1);
}


type CustomReportTableColumn = CustomReportTable["columns"][number];
type CustomReportTableRow = CustomReportTable["rows"][number];

type DynamicComparisonRow = {
  groupKey: string;
  groupLabel: string;
  metricKey: string;
  metricLabel: string;
  level: number;
  main: number;
  compare: number;
  diff: number;
  percent: number;
  mainDistanceKm: number | null;
  compareDistanceKm: number | null;
};

function getComparableColumns(table: CustomReportTable) {
  return table.columns.filter((column) => column.key !== "total");
}

function getTableCellValue(row: CustomReportTableRow, columnKey: string) {
  return columnKey === "total" ? row.total : row.groups[columnKey] ?? 0;
}

function getRowExtremes(
  row: CustomReportTableRow,
  columns: CustomReportTableColumn[],
) {
  const values = columns.map((column) => getTableCellValue(row, column.key));

  if (values.length < 2) {
    return null;
  }

  const max = Math.max(...values);
  const min = Math.min(...values);

  if (max === min) {
    return null;
  }

  return { max, min };
}

function getExtremeCellStyle(params: { isMax: boolean; isMin: boolean }): CSSProperties {
  if (params.isMax) {
    return {
      background: "rgba(14, 116, 144, 0.12)",
      boxShadow: "inset 0 0 0 1px rgba(14, 116, 144, 0.22)",
      fontWeight: 700,
    };
  }

  if (params.isMin) {
    return {
      background: "rgba(217, 119, 6, 0.11)",
      boxShadow: "inset 0 0 0 1px rgba(217, 119, 6, 0.22)",
      fontWeight: 700,
    };
  }

  return {};
}

function getExtremeBadgeStyle(type: "max" | "min"): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginTop: 4,
    padding: "2px 6px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    background:
      type === "max" ? "rgba(14, 116, 144, 0.14)" : "rgba(217, 119, 6, 0.14)",
    color: type === "max" ? "#0e7490" : "#a16207",
  };
}

type AlarmBreakdown = {
  oh: number;
  partner: number;
};

const breakdownMetricKeys = new Set([
  "totalAlarms",
  "falseTotal",
  "combatTotal",
  "additionalTotal",
  "detained",
  "transferred",
]);

function normalizeReportKey(value: string) {
  return value.trim().toLowerCase();
}

function isAdditionalReasonRow(row: CustomReportTableRow) {
  const key = normalizeReportKey(String(row.key));
  return (
    row.level >= 2 ||
    key.startsWith("additionalreason") ||
    key.startsWith("additional_reason") ||
    key.startsWith("additionalReason") ||
    key.startsWith("additional_alarm_reason")
  );
}

function shouldShowBreakdown(row: CustomReportTableRow) {
  return breakdownMetricKeys.has(String(row.key)) || isAdditionalReasonRow(row);
}

function toOptionalNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function getNestedBreakdownValue(source: unknown, columnKey: string): AlarmBreakdown | null {
  if (!source || typeof source !== "object") {
    return null;
  }

  const value = source as Record<string, any>;

  const directCandidates = [
    value[columnKey],
    value.groups?.[columnKey],
    value.groupBreakdowns?.[columnKey],
    value.breakdowns?.[columnKey],
    value.breakdown?.[columnKey],
  ];

  for (const candidate of directCandidates) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }

    const oh = toOptionalNumber(candidate.oh ?? candidate.totalOh ?? candidate.ohCount);
    const partner = toOptionalNumber(
      candidate.partner ?? candidate.totalPartner ?? candidate.partnerCount,
    );

    if (oh !== null || partner !== null) {
      return {
        oh: oh ?? 0,
        partner: partner ?? 0,
      };
    }
  }

  const directOh =
    columnKey === "total"
      ? toOptionalNumber(value.oh ?? value.totalOh ?? value.ohCount)
      : toOptionalNumber(
          value[`${columnKey}Oh`] ??
            value[`${columnKey}_oh`] ??
            value[`${columnKey}TotalOh`],
        );

  const directPartner =
    columnKey === "total"
      ? toOptionalNumber(value.partner ?? value.totalPartner ?? value.partnerCount)
      : toOptionalNumber(
          value[`${columnKey}Partner`] ??
            value[`${columnKey}_partner`] ??
            value[`${columnKey}TotalPartner`],
        );

  if (directOh !== null || directPartner !== null) {
    return {
      oh: directOh ?? 0,
      partner: directPartner ?? 0,
    };
  }

  return null;
}

function findSiblingRowValue(
  table: CustomReportTable,
  rowKey: string,
  columnKey: string,
) {
  const sibling = table.rows.find((row) => row.key === rowKey);

  if (!sibling) {
    return null;
  }

  return getTableCellValue(sibling, columnKey);
}

function getSyntheticBreakdownFromRows(
  row: CustomReportTableRow,
  columnKey: string,
  table: CustomReportTable,
): AlarmBreakdown | null {
  const key = String(row.key);

  const keyPairs: Record<string, [string, string]> = {
    totalAlarms: ["totalOh", "totalPartner"],
    falseTotal: ["falseOh", "falsePartner"],
    combatTotal: ["combatOh", "combatPartner"],
    additionalTotal: ["additionalOh", "additionalPartner"],
    detained: ["detainedOh", "detainedPartner"],
    transferred: ["transferredOh", "transferredPartner"],
  };

  const pair = keyPairs[key];

  if (!pair) {
    return null;
  }

  const oh = findSiblingRowValue(table, pair[0], columnKey);
  const partner = findSiblingRowValue(table, pair[1], columnKey);

  if (oh === null && partner === null) {
    return null;
  }

  return {
    oh: oh ?? 0,
    partner: partner ?? 0,
  };
}

function getCellBreakdown(params: {
  row: CustomReportTableRow;
  columnKey: string;
  table: CustomReportTable;
}) {
  if (!shouldShowBreakdown(params.row)) {
    return null;
  }

  return (
    getNestedBreakdownValue(params.row, params.columnKey) ??
    getSyntheticBreakdownFromRows(params.row, params.columnKey, params.table)
  );
}

function formatBreakdownLabel(breakdown: AlarmBreakdown | null) {
  if (!breakdown) {
    return null;
  }

  return `(${formatNumber(breakdown.oh)}/${formatNumber(breakdown.partner)})`;
}

const distanceMetricKey = "totalDistanceKm";

function getDistanceFromCandidate(
  candidate: unknown,
  allowPlainNumber = false,
): number | null {
  if (candidate === null || candidate === undefined) {
    return null;
  }

  if (typeof candidate === "number" || typeof candidate === "string") {
    return allowPlainNumber ? toOptionalNumber(candidate) : null;
  }

  if (typeof candidate !== "object") {
    return null;
  }

  const value = candidate as Record<string, any>;

  return toOptionalNumber(
    value.distanceKm ??
      value.distanceKms ??
      value.totalDistanceKm ??
      value.totalKm ??
      value.distance ??
      value.km,
  );
}

function getDistanceFromContainer(container: unknown, columnKey: string): number | null {
  if (container === null || container === undefined) {
    return null;
  }

  if (typeof container === "number" || typeof container === "string") {
    return columnKey === "total" ? toOptionalNumber(container) : null;
  }

  if (typeof container !== "object") {
    return null;
  }

  const value = container as Record<string, any>;

  return (
    getDistanceFromCandidate(value[columnKey], true) ??
    getDistanceFromCandidate(value.groups?.[columnKey], true) ??
    getDistanceFromCandidate(value.groupValues?.[columnKey], true) ??
    getDistanceFromCandidate(value.byGroup?.[columnKey], true) ??
    (columnKey === "total" ? getDistanceFromCandidate(value.total, true) : null)
  );
}

function getNestedDistanceValue(source: unknown, columnKey: string): number | null {
  if (!source || typeof source !== "object") {
    return null;
  }

  const value = source as Record<string, any>;

  const directCandidates = [
    value[columnKey],
    value.groups?.[columnKey],
    value.groupMetrics?.[columnKey],
    value.groupBreakdowns?.[columnKey],
    value.breakdowns?.[columnKey],
    value.breakdown?.[columnKey],
  ];

  for (const candidate of directCandidates) {
    const distance = getDistanceFromCandidate(candidate);

    if (distance !== null) {
      return distance;
    }
  }

  const containerCandidates = [
    value.distanceKm,
    value.totalDistanceKm,
    value.distance,
    value.totalKm,
    value.km,
    value.distances,
    value.distanceKms,
    value.distanceByGroup,
    value.groupDistances,
    value.groupDistanceKm,
    value.groupDistanceKms,
    value.kmByGroup,
    value.metricDistances,
    value.distanceBreakdowns,
    value.groupsDistanceKm,
  ];

  for (const candidate of containerCandidates) {
    const distance = getDistanceFromContainer(candidate, columnKey);

    if (distance !== null) {
      return distance;
    }
  }

  return columnKey === "total"
    ? getDistanceFromCandidate(value)
    : getDistanceFromCandidate(
        value[`${columnKey}DistanceKm`] ??
          value[`${columnKey}_distanceKm`] ??
          value[`${columnKey}TotalDistanceKm`] ??
          value[`${columnKey}_totalDistanceKm`] ??
          value[`${columnKey}Km`] ??
          value[`${columnKey}_km`],
        true,
      );
}

function getCellDistanceKm(params: {
  row: CustomReportTableRow;
  columnKey: string;
  table: CustomReportTable;
}) {
  if (String(params.row.key) === distanceMetricKey) {
    return null;
  }

  return getNestedDistanceValue(params.row, params.columnKey);
}

function formatDistanceLabel(distanceKm: number | null) {
  if (distanceKm === null) {
    return null;
  }

  return `(${formatNumber(distanceKm)} км)`;
}

function renderValueWithDistance(value: number, distanceKm: number | null) {
  const distanceLabel = formatDistanceLabel(distanceKm);

  return (
    <span
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
      }}
    >
      <span>{formatNumber(value)}</span>
      {distanceLabel && (
        <span
          style={{
            color: "rgba(15, 118, 110, 0.78)",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {distanceLabel}
        </span>
      )}
    </span>
  );
}

function renderValueWithExtremeBadge(params: {
  value: number;
  row: CustomReportTableRow;
  columnKey: string;
  table: CustomReportTable;
  isMax: boolean;
  isMin: boolean;
}) {
  const breakdown = getCellBreakdown({
    row: params.row,
    columnKey: params.columnKey,
    table: params.table,
  });

  const breakdownLabel = formatBreakdownLabel(breakdown);
  const distanceLabel = formatDistanceLabel(
    getCellDistanceKm({
      row: params.row,
      columnKey: params.columnKey,
      table: params.table,
    }),
  );

  return (
    <span
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 46,
        width: "100%",
        lineHeight: 1.2,
        textAlign: "center",
      }}
    >
      <span style={{ fontWeight: 700 }}>{formatNumber(params.value)}</span>

      {breakdownLabel && (
        <span
          style={{
            marginTop: 2,
            color: "rgba(71, 85, 105, 0.68)",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {breakdownLabel}
        </span>
      )}

      {distanceLabel && (
        <span
          style={{
            marginTop: 2,
            color: "rgba(15, 118, 110, 0.78)",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {distanceLabel}
        </span>
      )}

      {params.isMax && <span style={getExtremeBadgeStyle("max")}>макс</span>}
      {params.isMin && <span style={getExtremeBadgeStyle("min")}>мін</span>}
    </span>
  );
}

function calculatePercentChange(main: number, compare: number) {
  if (compare === 0) {
    return main === 0 ? 0 : 100;
  }

  return ((main - compare) / compare) * 100;
}

function formatSignedNumber(value: number) {
  if (value > 0) {
    return `+${formatNumber(value)}`;
  }

  return formatNumber(value);
}

function formatPercentChange(value: number) {
  return `${value > 0 ? "+" : ""}${formatNumber(value)}%`;
}

function getChangeMeta(diff: number) {
  if (diff > 0) {
    const style: CSSProperties = {
      background: "rgba(14, 116, 144, 0.12)",
      border: "1px solid rgba(14, 116, 144, 0.24)",
      color: "#0e7490",
    };

    return {
      label: "зросло",
      arrow: "↑",
      style,
    };
  }

  if (diff < 0) {
    const style: CSSProperties = {
      background: "rgba(217, 119, 6, 0.12)",
      border: "1px solid rgba(217, 119, 6, 0.24)",
      color: "#a16207",
    };

    return {
      label: "впало",
      arrow: "↓",
      style,
    };
  }

  const style: CSSProperties = {
    background: "rgba(100, 116, 139, 0.10)",
    border: "1px solid rgba(100, 116, 139, 0.20)",
    color: "#475569",
  };

  return {
    label: "без змін",
    arrow: "→",
    style,
  };
}

function buildDynamicComparisonRows(
  mainTable: CustomReportTable,
  compareTable: CustomReportTable,
): DynamicComparisonRow[] {
  const compareRowsByKey = new Map(
    compareTable.rows.map((row) => [row.key, row]),
  );

  return getComparableColumns(mainTable).flatMap((column) =>
    mainTable.rows.map((row) => {
      const compareRow = compareRowsByKey.get(row.key);
      const main = getTableCellValue(row, column.key);
      const compare = compareRow ? getTableCellValue(compareRow, column.key) : 0;
      const diff = main - compare;
      const mainDistanceKm = getCellDistanceKm({
        row,
        columnKey: column.key,
        table: mainTable,
      });
      const compareDistanceKm = compareRow
        ? getCellDistanceKm({
            row: compareRow,
            columnKey: column.key,
            table: compareTable,
          })
        : null;

      return {
        groupKey: column.key,
        groupLabel: column.label,
        metricKey: row.key,
        metricLabel: row.label,
        level: row.level,
        main,
        compare,
        diff,
        percent: calculatePercentChange(main, compare),
        mainDistanceKm,
        compareDistanceKm,
      };
    }),
  );
}

function groupDynamicRows(rows: DynamicComparisonRow[]) {
  return rows.reduce<
    {
      groupKey: string;
      groupLabel: string;
      rows: DynamicComparisonRow[];
    }[]
  >((acc, row) => {
    let group = acc.find((item) => item.groupKey === row.groupKey);

    if (!group) {
      group = {
        groupKey: row.groupKey,
        groupLabel: row.groupLabel,
        rows: [],
      };

      acc.push(group);
    }

    group.rows.push(row);
    return acc;
  }, []);
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
  const comparableColumns = getComparableColumns(table);

  return (
    <div className="panel-card custom-report-table-card">
      <AccordionSection
        title={title}
        subtitle={periodLabel || "Користувацька таблиця за вибраними показниками"}
        open={open}
        onToggle={onToggle}
      >
        <div className="table-wrap">
          <table className="data-table custom-report-table">
            <thead>
              <tr>
                <th>Показник</th>
                {table.columns.map((column) => (
                  <th key={column.key}>{column.label}</th>
                ))}
              </tr>
            </thead>

            <tbody>
              {table.rows.map((row) => {
                const extremes = getRowExtremes(row, comparableColumns);

                return (
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

                    {table.columns.map((column) => {
                      const value = getTableCellValue(row, column.key);
                      const isComparableColumn = column.key !== "total";
                      const isMax = Boolean(
                        extremes && isComparableColumn && value === extremes.max,
                      );
                      const isMin = Boolean(
                        extremes && isComparableColumn && value === extremes.min,
                      );

                      return (
                        <td
                          key={column.key}
                          style={{
                            ...getExtremeCellStyle({ isMax, isMin }),
                            textAlign: "center",
                            verticalAlign: "middle",
                          }}
                        >
                          {renderValueWithExtremeBadge({
                            value,
                            row,
                            columnKey: column.key,
                            table,
                            isMax,
                            isMin,
                          })}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </AccordionSection>
    </div>
  );
}

function CustomReportDynamicsTable({
  title,
  mainTable,
  compareTable,
  periodLabel,
  open,
  onToggle,
}: {
  title: string;
  mainTable: CustomReportTable;
  compareTable: CustomReportTable;
  periodLabel?: string;
  open: boolean;
  onToggle: () => void;
}) {
  const groups = groupDynamicRows(
    buildDynamicComparisonRows(mainTable, compareTable),
  );

  return (
    <div className="panel-card custom-report-table-card">
      <AccordionSection
        title={title}
        subtitle={
          periodLabel ||
          "Порівняння основного періоду з періодом порівняння у значеннях і %"
        }
        open={open}
        onToggle={onToggle}
      >
        <div className="table-wrap">
          <table className="data-table custom-report-table custom-report-dynamics-table">
            <thead>
              <tr>
                <th>Місто / група</th>
                <th>Показник</th>
                <th>Основний період</th>
                <th>Порівняльний період</th>
                <th>Різниця</th>
                <th>Зміна</th>
              </tr>
            </thead>

            <tbody>
              {groups.length === 0 ? (
                <tr>
                  <td colSpan={6}>Немає даних для динаміки</td>
                </tr>
              ) : (
                groups.map((group) => (
                  <Fragment key={group.groupKey}>
                    <tr>
                      <td
                        colSpan={6}
                        style={{
                          background:
                            "linear-gradient(90deg, rgba(14, 116, 144, 0.18), rgba(14, 116, 144, 0.06))",
                          borderTop: "3px solid rgba(14, 116, 144, 0.55)",
                          borderBottom: "1px solid rgba(14, 116, 144, 0.24)",
                          padding: "12px 14px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 12,
                            flexWrap: "wrap",
                          }}
                        >
                          <strong
                            style={{
                              fontSize: 15,
                              letterSpacing: 0.2,
                            }}
                          >
                            {group.groupLabel}
                          </strong>

                          <span
                            style={{
                              padding: "4px 10px",
                              borderRadius: 999,
                              background: "rgba(255, 255, 255, 0.65)",
                              color: "#0f766e",
                              fontSize: 12,
                              fontWeight: 700,
                            }}
                          >
                            Показників: {group.rows.length}
                          </span>
                        </div>
                      </td>
                    </tr>

                    {group.rows.map((row, index) => {
                      const changeMeta = getChangeMeta(row.diff);

                      return (
                        <tr
                          key={`${row.groupKey}_${row.metricKey}`}
                          className={row.level > 0 ? "custom-report-subrow" : ""}
                          style={{
                            borderLeft: "3px solid rgba(14, 116, 144, 0.26)",
                            background:
                              index % 2 === 0
                                ? "rgba(14, 116, 144, 0.025)"
                                : undefined,
                          }}
                        >
                          <td
                            style={{
                              color: "rgba(15, 23, 42, 0.55)",
                              fontWeight: 600,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {index === 0 ? group.groupLabel : ""}
                          </td>

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
                                {row.metricLabel}
                              </span>
                            </div>
                          </td>

                          <td>{renderValueWithDistance(row.main, row.mainDistanceKm)}</td>
                          <td>
                            {renderValueWithDistance(
                              row.compare,
                              row.compareDistanceKm,
                            )}
                          </td>
                          <td>{formatSignedNumber(row.diff)}</td>
                          <td>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                padding: "4px 8px",
                                borderRadius: 999,
                                fontWeight: 700,
                                ...changeMeta.style,
                              }}
                            >
                              <span>{changeMeta.arrow}</span>
                              <span>{formatPercentChange(row.percent)}</span>
                              <small>{changeMeta.label}</small>
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))
              )}
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
          <p>Графік побудовано за сформованою таблицею</p>
        </div>
      </div>

      <div className="custom-bars">
        {rows.length === 0 ? (
          <div className="empty-state">Немає даних для графіка</div>
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
            Усього спрацювань = звичайні + додаткові. Хибні й бойові належать
            лише до звичайних спрацювань.
          </p>
        </div>
      </div>

      <div className="alarm-comparison-list">
        {rows.length === 0 ? (
          <div className="empty-state">Немає даних для графіка</div>
        ) : (
          rows.map((row) => (
            <div className="alarm-comparison-card" key={row.name}>
              <strong>{row.name}</strong>

              <div className="alarm-comparison-metrics">
                <div className="alarm-metric-row">
                  <span>Усього</span>

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
                  <span>Хибні</span>

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
                  <span>Бойові</span>

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
                  <span>Дод.</span>

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
          <h2>Порівняння періодів</h2>
          <p>Основний період порівнюється з вибраним періодом порівняння</p>
        </div>
      </div>

      <div className="period-comparison-list">
        {rows.length === 0 ? (
          <div className="empty-state">Немає даних для порівняння</div>
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
                  <span>Основний</span>

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
                  <span>Порівняння</span>

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
    dynamicsTable: true,
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
        setError("Не вдалося завантажити довідники");
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
      setError("Оберіть хоча б один показник");
      setOpenedSections((prev) => ({
        ...prev,
        settings: true,
        metrics: true,
      }));
      return;
    }

    const { mainPeriod, comparePeriod, filters } = buildCurrentReportRequest();

    setMainPeriodLabel(
      `Основний період: ${formatPeriodLabel(mainPeriod.dateFrom, mainPeriod.dateTo)}`,
    );

    setComparePeriodLabel(
      compareEnabled
        ? `Період порівняння: ${formatPeriodLabel(
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
        dynamicsTable: Boolean(data.data.compare),
        charts: true,
      }));
    } catch (err: any) {
      setError(err.response?.data?.message || "Не вдалося сформувати звіт");
    } finally {
      setLoading(false);
    }
  }

  async function handleDownloadExcel() {
    if (metrics.length === 0) {
      setError("Оберіть хоча б один показник");
      setOpenedSections((prev) => ({
        ...prev,
        settings: true,
        metrics: true,
      }));
      return;
    }

    const { mainPeriod, comparePeriod, filters } = buildCurrentReportRequest();

    setMainPeriodLabel(
      `Основний період: ${formatPeriodLabel(mainPeriod.dateFrom, mainPeriod.dateTo)}`,
    );

    setComparePeriodLabel(
      compareEnabled
        ? `Період порівняння: ${formatPeriodLabel(
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
      setError(err.response?.data?.message || "Не вдалося завантажити Excel");
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
          <h1>Користувацький звіт</h1>
          <p>
            Налаштовувана аналітика за періодами, містами, нарядами та показниками
          </p>
        </div>
      </div>

      <div className="panel-card report-filters">
        <AccordionSection
          title="Налаштування звіту"
          subtitle="Період, місто, деталізація, показники та порівняння"
          open={openedSections.settings}
          onToggle={() => toggleSection("settings")}
        >
          <div className="custom-report-toolbar">
            <div>
              <strong>Параметри формування</strong>
              <span>
                {mainPeriodLabel || "За замовчуванням обрано поточний місяць"}
              </span>
            </div>

            <div className="table-header-actions">
              <button
                className="primary-button"
                onClick={handleBuildReport}
                disabled={loading || referencesLoading}
              >
                {loading ? "Формуємо..." : "Сформувати"}
              </button>

              <button
                type="button"
                className="secondary-button"
                onClick={handleDownloadExcel}
                disabled={excelDownloading || loading || referencesLoading}
              >
                {excelDownloading ? "Завантажуємо..." : "Завантажити Excel"}
              </button>
            </div>
          </div>

          <div className="custom-report-filter-grid">
            <label className="field">
              <span>Період</span>
              <select
                value={periodMode}
                onChange={(event) =>
                  setPeriodMode(event.target.value as PeriodMode)
                }
              >
                <option value="month">Місяць</option>
                <option value="quarter">Квартал</option>
                <option value="year">Рік</option>
                <option value="custom">Довільний період</option>
              </select>
            </label>

            {periodMode !== "custom" && (
              <label className="field">
                <span>Рік</span>
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
                <span>Місяць</span>
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
                  <option value={1}>1-й квартал</option>
                  <option value={2}>2-й квартал</option>
                  <option value={3}>3-й квартал</option>
                  <option value={4}>4-й квартал</option>
                </select>
              </label>
            )}

            {periodMode === "custom" && (
              <>
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
              </>
            )}

            <label className="field">
              <span>Місто</span>
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
                <option value={0}>Усі доступні міста</option>

                {cities.map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Деталізація</span>
              <select
                value={groupMode}
                onChange={(event) =>
                  setGroupMode(event.target.value as CustomReportGroupMode)
                }
                disabled={!cityId}
              >
                <option value="city">За містами</option>
                <option value="crew">За нарядами вибраного міста</option>
              </select>
            </label>
          </div>

          <div className="custom-report-section">
            <AccordionSection
              title="Показники"
              subtitle={`Обрано: ${metrics.length} із ${metricOptions.length}`}
              open={openedSections.metrics}
              onToggle={() => toggleSection("metrics")}
            >
              <div className="custom-report-section-header">
                <div>
                  <strong>Показники таблиці</strong>
                  <span>Оберіть рядки, які потрібно показати у звіті</span>
                </div>

                <div className="table-header-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={selectAllMetrics}
                  >
                    Обрати всі
                  </button>

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={clearMetrics}
                  >
                    Зняти всі
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
              title="Цілі поїздок"
              subtitle={
                tripGoalIds.length
                  ? `Додаткових рядків: ${tripGoalIds.length}`
                  : "Цілі не обрано — додаткові рядки не додаються"
              }
              open={openedSections.tripGoals}
              onToggle={() => toggleSection("tripGoals")}
            >
              <div className="custom-report-section-header">
                <div>
                  <strong>Додаткові рядки за цілями</strong>
                  <span>
                    Обрані цілі додаються вкладеними рядками під “Усього
                    поїздок”
                  </span>
                </div>

                <div className="table-header-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={selectAllTripGoals}
                  >
                    Обрати всі
                  </button>

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={clearTripGoals}
                  >
                    Скинути цілі
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
                      <small>Додати окремий рядок у звіт</small>
                    </span>
                  </label>
                ))}
              </div>
            </AccordionSection>
          </div>

          <div className="custom-report-section">
            <AccordionSection
              title="Порівняльний період"
              subtitle={
                compareEnabled
                  ? comparePeriodLabel || "Порівняння увімкнено"
                  : "Порівняння вимкнено"
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
                <span>Додати порівняльний звіт</span>
              </label>

              {compareEnabled && (
                <div className="custom-report-filter-grid">
                  {periodMode !== "custom" && (
                    <label className="field">
                      <span>Рік порівняння</span>
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
                      <span>Місяць порівняння</span>
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
                      <span>Квартал порівняння</span>
                      <select
                        value={compareQuarter}
                        onChange={(event) =>
                          setCompareQuarter(Number(event.target.value))
                        }
                      >
                        <option value={1}>1-й квартал</option>
                        <option value={2}>2-й квартал</option>
                        <option value={3}>3-й квартал</option>
                        <option value={4}>4-й квартал</option>
                      </select>
                    </label>
                  )}

                  {periodMode === "custom" && (
                    <>
                      <label className="field">
                        <span>Дата порівняння від</span>
                        <input
                          type="date"
                          value={compareDateFrom}
                          onChange={(event) =>
                            setCompareDateFrom(event.target.value)
                          }
                        />
                      </label>

                      <label className="field">
                        <span>Дата порівняння до</span>
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
        <div className="empty-state">Сформуйте звіт</div>
      ) : (
        <>
          <CustomReportTableView
            title="Основний звіт"
            table={report.data.main.table}
            periodLabel={mainPeriodLabel}
            open={openedSections.mainTable}
            onToggle={() => toggleSection("mainTable")}
          />

          {report.data.compare && (
            <CustomReportTableView
              title="Порівняльний звіт"
              table={report.data.compare.table}
              periodLabel={comparePeriodLabel}
              open={openedSections.compareTable}
              onToggle={() => toggleSection("compareTable")}
            />
          )}

          {report.data.compare && (
            <CustomReportDynamicsTable
              title={
                cityId && groupMode === "crew"
                  ? "Динаміка по нарядах"
                  : "Динаміка по містах"
              }
              mainTable={report.data.main.table}
              compareTable={report.data.compare.table}
              periodLabel="Порівняння основного періоду з періодом порівняння у значеннях і %"
              open={openedSections.dynamicsTable}
              onToggle={() => toggleSection("dynamicsTable")}
            />
          )}

          <div className="panel-card custom-report-charts-card">
            <AccordionSection
              title="Графіки"
              subtitle="Візуальна аналітика за сформованою таблицею"
              open={openedSections.charts}
              onToggle={() => toggleSection("charts")}
            >
              <div className="content-grid custom-charts-grid">
                <AlarmGroupComparisonChart
                  title={
                    cityId && groupMode === "crew"
                      ? "Порівняння нарядів за спрацюваннями"
                      : "Порівняння міст за спрацюваннями"
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
                  title="Причини додаткових спрацювань"
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