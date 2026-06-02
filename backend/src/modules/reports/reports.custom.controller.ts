import type { Request, Response } from "express";
import { prisma } from "../../config/prisma";
import {
  buildCityAccessWhere,
  getAllowedCityIds,
} from "../../utils/admin-access";

type CustomReportMetric =
  | "totalShifts"
  | "totalTrips"
  | "totalDistanceKm"
  | "totalAlarms"
  | "falseTotal"
  | "combatTotal"
  | "additionalTotal"
  | "detained";

type CustomReportGroupMode = "city" | "crew";

type ReportTotals = {
  totalShifts: number;
  totalTrips: number;
  totalDistanceKm: number;

  tripGoalCounts: Record<string, number>;

  totalAlarms: number;
  totalOh: number;
  totalPartner: number;

  falseTotal: number;
  combatTotal: number;

  additionalTotal: number;
  additionalByReason: Record<string, number>;

  detained: number;
  transferred: number;
};

const allowedMetrics: CustomReportMetric[] = [
  "totalShifts",
  "totalTrips",
  "totalDistanceKm",
  "totalAlarms",
  "falseTotal",
  "combatTotal",
  "additionalTotal",
  "detained",
];

const metricLabels: Record<CustomReportMetric, string> = {
  totalShifts: "Всего смен",
  totalTrips: "Всего поездок",
  totalDistanceKm: "Пробег, км",
  totalAlarms: "Всего сработок",
  falseTotal: "Ложные",
  combatTotal: "Боевые",
  additionalTotal: "Дополнительные",
  detained: "Задержано",
};

function toNumber(value: unknown) {
  return Number(value ?? 0);
}

function roundNumber(value: number) {
  return Math.round(value * 100) / 100;
}

function parseDate(value: unknown) {
  if (!value) return undefined;

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date;
}

function parseNumber(value: unknown) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    return undefined;
  }

  return numberValue;
}

function parseStringList(value: unknown) {
  if (!value) return [];

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseNumberList(value: unknown) {
  return parseStringList(value)
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0);
}

function parseMetrics(value: unknown): CustomReportMetric[] {
  const requested = parseStringList(value).filter((metric) =>
    allowedMetrics.includes(metric as CustomReportMetric),
  ) as CustomReportMetric[];

  return requested.length
    ? requested
    : [
        "totalShifts",
        "totalTrips",
        "totalDistanceKm",
        "totalAlarms",
        "falseTotal",
        "combatTotal",
        "additionalTotal",
        "detained",
      ];
}

function parseGroupMode(
  value: unknown,
  cityId?: number,
): CustomReportGroupMode {
  if (value === "crew" && cityId) {
    return "crew";
  }

  return "city";
}

function createEmptyTotals(): ReportTotals {
  return {
    totalShifts: 0,
    totalTrips: 0,
    totalDistanceKm: 0,

    tripGoalCounts: {},

    totalAlarms: 0,
    totalOh: 0,
    totalPartner: 0,

    falseTotal: 0,
    combatTotal: 0,

    additionalTotal: 0,
    additionalByReason: {},

    detained: 0,
    transferred: 0,
  };
}

function getShiftEquivalent(shift: { shiftDurationHours?: unknown }) {
  const durationHours = Number(shift.shiftDurationHours ?? 24);

  if (!Number.isFinite(durationHours) || durationHours <= 0) {
    return 1;
  }

  return roundNumber(durationHours / 24);
}

function addToReasonMap(
  map: Record<string, number>,
  reasonName: string,
  value: number,
) {
  map[reasonName] = (map[reasonName] ?? 0) + value;
}

function addShiftToTotals(totals: ReportTotals, shift: any) {
  totals.totalShifts += getShiftEquivalent(shift);

  for (const trip of shift.trips ?? []) {
    totals.totalTrips += 1;
    totals.totalDistanceKm += toNumber(trip.distanceKm);

    const goalKey = String(trip.goalId);
    totals.tripGoalCounts[goalKey] = (totals.tripGoalCounts[goalKey] ?? 0) + 1;

    for (const event of trip.events ?? []) {
      totals.detained += event.detainedCount ?? 0;
      totals.transferred += event.transferredCount ?? 0;

      if (event.eventCategory === "REGULAR_ALARM") {
        totals.totalAlarms += 1;

        if (event.alarmSource === "OH") {
          totals.totalOh += 1;
        }

        if (event.alarmSource === "PARTNER") {
          totals.totalPartner += 1;
        }

        if (event.isCombat) {
          totals.combatTotal += 1;
        } else {
          totals.falseTotal += 1;
        }
      }

      if (event.eventCategory === "ADDITIONAL_ALARM") {
        const oh = event.ohCount ?? 0;
        const partner = event.partnerCount ?? 0;
        const total = oh + partner;

        totals.totalAlarms += total;
        totals.totalOh += oh;
        totals.totalPartner += partner;
        totals.additionalTotal += total;

        const reasonName =
          event.reason?.name ?? event.customReasonText ?? "Без причины";

        addToReasonMap(totals.additionalByReason, reasonName, total);
      }
    }
  }
}
function finalizeTotals(totals: ReportTotals): ReportTotals {
  return {
    ...totals,
    totalShifts: roundNumber(totals.totalShifts),
    totalDistanceKm: roundNumber(totals.totalDistanceKm),
    additionalByReason: Object.fromEntries(
      Object.entries(totals.additionalByReason).map(([key, value]) => [
        key,
        roundNumber(value),
      ]),
    ),
  };
}

function getMetricValue(totals: ReportTotals, metric: CustomReportMetric) {
  return roundNumber(Number(totals[metric] ?? 0));
}
type CustomTableRowDefinition = {
  key: string;
  label: string;
  level: number;
  metric?: CustomReportMetric;
  kind?: "metric" | "tripGoal" | "additionalReason" | "transferred";
  tripGoalId?: number;
  reasonName?: string;
};

function getTableRowValue(totals: ReportTotals, row: CustomTableRowDefinition) {
  if (row.kind === "tripGoal" && row.tripGoalId) {
    return roundNumber(totals.tripGoalCounts[String(row.tripGoalId)] ?? 0);
  }

  if (row.kind === "additionalReason" && row.reasonName) {
    return roundNumber(totals.additionalByReason[row.reasonName] ?? 0);
  }

  if (row.kind === "transferred") {
    return roundNumber(totals.transferred);
  }

  if (row.metric) {
    return getMetricValue(totals, row.metric);
  }

  return 0;
}

function collectAdditionalReasonNames(params: {
  totals: ReportTotals;
  groups: {
    id: number;
    name: string;
    totals: ReportTotals;
  }[];
}) {
  const reasonNames = new Set<string>();

  Object.keys(params.totals.additionalByReason).forEach((reasonName) =>
    reasonNames.add(reasonName),
  );

  for (const group of params.groups) {
    Object.keys(group.totals.additionalByReason).forEach((reasonName) =>
      reasonNames.add(reasonName),
    );
  }

  return Array.from(reasonNames).sort((a, b) => a.localeCompare(b));
}

function buildTableRowDefinitions(params: {
  metrics: CustomReportMetric[];
  selectedTripGoals: {
    id: number;
    name: string;
  }[];
  additionalReasonNames: string[];
}) {
  const rows: CustomTableRowDefinition[] = [];

  const alarmMetrics = new Set<CustomReportMetric>([
    "totalAlarms",
    "falseTotal",
    "combatTotal",
    "additionalTotal",
  ]);

  let alarmGroupAdded = false;

  function addAlarmGroup() {
    if (alarmGroupAdded) return;

    alarmGroupAdded = true;

    rows.push({
      key: "alarmsGroup",
      label: "Сработки",
      level: 0,
      metric: "totalAlarms",
      kind: "metric",
    });

    if (params.metrics.includes("falseTotal")) {
      rows.push({
        key: "falseTotal",
        label: "Ложные",
        level: 1,
        metric: "falseTotal",
        kind: "metric",
      });
    }

    if (params.metrics.includes("combatTotal")) {
      rows.push({
        key: "combatTotal",
        label: "Боевые",
        level: 1,
        metric: "combatTotal",
        kind: "metric",
      });
    }

    if (params.metrics.includes("additionalTotal")) {
      rows.push({
        key: "additionalTotal",
        label: "Дополнительные",
        level: 1,
        metric: "additionalTotal",
        kind: "metric",
      });

      for (const reasonName of params.additionalReasonNames) {
        rows.push({
          key: `additionalReason:${reasonName}`,
          label: reasonName,
          level: 2,
          kind: "additionalReason",
          reasonName,
        });
      }
    }
  }

  for (const metric of params.metrics) {
    if (alarmMetrics.has(metric)) {
      addAlarmGroup();
      continue;
    }

    if (metric === "totalTrips") {
      rows.push({
        key: "totalTrips",
        label: metricLabels.totalTrips,
        level: 0,
        metric: "totalTrips",
        kind: "metric",
      });

      for (const goal of params.selectedTripGoals) {
        rows.push({
          key: `tripGoal:${goal.id}`,
          label: goal.name,
          level: 1,
          kind: "tripGoal",
          tripGoalId: goal.id,
        });
      }

      continue;
    }

    if (metric === "detained") {
      rows.push({
        key: "detained",
        label: metricLabels.detained,
        level: 0,
        metric: "detained",
        kind: "metric",
      });

      rows.push({
        key: "transferred",
        label: "Передано в полицию",
        level: 1,
        kind: "transferred",
      });

      continue;
    }

    rows.push({
      key: metric,
      label: metricLabels[metric],
      level: 0,
      metric,
      kind: "metric",
    });
  }

  return rows;
}
function buildGroupKey(shift: any, groupMode: CustomReportGroupMode) {
  if (groupMode === "crew") {
    return {
      id: shift.crew.id,
      name: shift.crew.name,
    };
  }

  return {
    id: shift.city.id,
    name: shift.city.name,
  };
}
async function loadReportGroups(params: {
  cityId?: number;
  groupMode: CustomReportGroupMode;
  allowedCityIds: number[] | null;
}) {
  if (params.groupMode === "crew" && params.cityId) {
    const crews = await prisma.crew.findMany({
      where: {
        cityId: params.cityId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    return crews.map((crew) => ({
      id: crew.id,
      name: crew.name,
    }));
  }

  const cities = await prisma.city.findMany({
    where: {
      deletedAt: null,
      ...(params.cityId
        ? { id: params.cityId }
        : params.allowedCityIds === null
          ? {}
          : {
              id: {
                in: params.allowedCityIds,
              },
            }),
    },
    select: {
      id: true,
      name: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  return cities.map((city) => ({
    id: city.id,
    name: city.name,
  }));
}
async function loadCustomReportData(params: {
  cityId?: number;
  dateFrom?: Date;
  dateTo?: Date;
  groupMode: CustomReportGroupMode;
  tripGoalIds: number[];
  allowedCityIds: number[] | null;
  baseGroups: {
    id: number;
    name: string;
  }[];
}) {
  const shifts = await prisma.shift.findMany({
    where: {
      deletedAt: null,
      ...(params.cityId
        ? { cityId: params.cityId }
        : buildCityAccessWhere(params.allowedCityIds)),
      ...(params.dateFrom || params.dateTo
        ? {
            shiftDate: {
              ...(params.dateFrom ? { gte: params.dateFrom } : {}),
              ...(params.dateTo ? { lte: params.dateTo } : {}),
            },
          }
        : {}),
    },
    take: 10000,
    orderBy: {
      shiftDate: "asc",
    },
    include: {
      city: {
        select: {
          id: true,
          name: true,
        },
      },
      crew: {
        select: {
          id: true,
          name: true,
        },
      },
      trips: {
        where: {
          deletedAt: null,
        },
        include: {
          goal: {
            select: {
              id: true,
              name: true,
              systemCode: true,
            },
          },
          events: {
            include: {
              reason: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const totals = createEmptyTotals();
  const groups = new Map<
    string,
    {
      id: number;
      name: string;
      totals: ReportTotals;
    }
  >();
  for (const group of params.baseGroups) {
    groups.set(String(group.id), {
      id: group.id,
      name: group.name,
      totals: createEmptyTotals(),
    });
  }
  for (const shift of shifts) {
    addShiftToTotals(totals, shift);

    const group = buildGroupKey(shift, params.groupMode);
    const groupKey = String(group.id);

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        id: group.id,
        name: group.name,
        totals: createEmptyTotals(),
      });
    }

    addShiftToTotals(groups.get(groupKey)!.totals, shift);
  }

  return {
    totals: finalizeTotals(totals),
    groups: Array.from(groups.values())
      .map((group) => ({
        ...group,
        totals: finalizeTotals(group.totals),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function buildTable(params: {
  rowDefinitions: CustomTableRowDefinition[];
  totals: ReportTotals;
  groups: {
    id: number;
    name: string;
    totals: ReportTotals;
  }[];
}) {
  return {
    columns: [
      {
        key: "total",
        label: "Всего",
      },
      ...params.groups.map((group) => ({
        key: String(group.id),
        label: group.name,
      })),
    ],
    rows: params.rowDefinitions.map((row) => ({
      key: row.key,
      label: row.label,
      level: row.level,
      total: getTableRowValue(params.totals, row),
      groups: Object.fromEntries(
        params.groups.map((group) => [
          String(group.id),
          getTableRowValue(group.totals, row),
        ]),
      ),
    })),
  };
}

function buildCharts(params: {
  metrics: CustomReportMetric[];
  mainTotals: ReportTotals;
  compareTotals: ReportTotals | null;
  groups: {
    id: number;
    name: string;
    totals: ReportTotals;
  }[];
}) {
  return {
    byGroups: params.groups.map((group) => ({
      name: group.name,
      totalAlarms: group.totals.totalAlarms,
      combatTotal: group.totals.combatTotal,
      falseTotal: group.totals.falseTotal,
      additionalTotal: group.totals.additionalTotal,
      totalShifts: group.totals.totalShifts,
    })),

    periodComparison: params.metrics.map((metric) => ({
      metric,
      label: metricLabels[metric],
      main: getMetricValue(params.mainTotals, metric),
      compare: params.compareTotals
        ? getMetricValue(params.compareTotals, metric)
        : null,
    })),

    additionalReasons: Object.entries(params.mainTotals.additionalByReason)
      .map(([reasonName, total]) => ({
        reasonName,
        total,
      }))
      .sort((a, b) => b.total - a.total),
  };
}

type CustomReportAccessError = Error & {
  statusCode?: number;
};

function createCustomReportAccessError(message: string) {
  const error = new Error(message) as CustomReportAccessError;
  error.statusCode = 403;
  return error;
}

export async function buildCustomReportPayload(req: Request) {
  const cityId = parseNumber(req.query.cityId);

  const allowedCityIds = await getAllowedCityIds(req);

  if (allowedCityIds !== null && cityId && !allowedCityIds.includes(cityId)) {
    throw createCustomReportAccessError(
      "Недостаточно прав для выбранного города",
    );
  }

  const dateFrom = parseDate(req.query.dateFrom);
  const dateTo = parseDate(req.query.dateTo);

  const compareDateFrom = parseDate(req.query.compareDateFrom);
  const compareDateTo = parseDate(req.query.compareDateTo);

  const metrics = parseMetrics(req.query.metrics);
  const tripGoalIds = parseNumberList(req.query.tripGoalIds);

  const selectedTripGoals = tripGoalIds.length
    ? await prisma.tripGoal.findMany({
        where: {
          id: {
            in: tripGoalIds,
          },
        },
        select: {
          id: true,
          name: true,
        },
        orderBy: {
          sortOrder: "asc",
        },
      })
    : [];

  const groupMode = parseGroupMode(req.query.groupMode, cityId);

  const baseGroups = await loadReportGroups({
    cityId,
    groupMode,
    allowedCityIds,
  });

  const mainData = await loadCustomReportData({
    cityId,
    dateFrom,
    dateTo,
    groupMode,
    tripGoalIds,
    allowedCityIds,
    baseGroups,
  });
  const mainAdditionalReasonNames = collectAdditionalReasonNames({
    totals: mainData.totals,
    groups: mainData.groups,
  });

  const tableRowDefinitions = buildTableRowDefinitions({
    metrics,
    selectedTripGoals,
    additionalReasonNames: mainAdditionalReasonNames,
  });
  const compareEnabled = Boolean(compareDateFrom || compareDateTo);

  const compareData = compareEnabled
    ? await loadCustomReportData({
        cityId,
        dateFrom: compareDateFrom,
        dateTo: compareDateTo,
        groupMode,
        tripGoalIds,
        allowedCityIds,
        baseGroups,
      })
    : null;

  return {
    filters: {
      cityId: cityId ?? null,
      dateFrom: dateFrom ?? null,
      dateTo: dateTo ?? null,
      compareDateFrom: compareDateFrom ?? null,
      compareDateTo: compareDateTo ?? null,
      metrics,
      tripGoalIds,
      groupMode,
    },
    data: {
      main: {
        totals: mainData.totals,
        groups: mainData.groups,
        table: buildTable({
          rowDefinitions: tableRowDefinitions,
          totals: mainData.totals,
          groups: mainData.groups,
        }),
      },
      compare: compareData
        ? {
            totals: compareData.totals,
            groups: compareData.groups,
          table: buildTable({
  rowDefinitions: tableRowDefinitions,
  totals: compareData.totals,
  groups: compareData.groups,
}),
          }
        : null,
      charts: buildCharts({
        metrics,
        mainTotals: mainData.totals,
        compareTotals: compareData?.totals ?? null,
        groups: mainData.groups,
      }),
    },
  };
}

export async function getCustomReport(req: Request, res: Response) {
  try {
    const payload = await buildCustomReportPayload(req);

    return res.json(payload);
  } catch (error) {
    const statusCode =
      error instanceof Error && "statusCode" in error
        ? Number((error as CustomReportAccessError).statusCode)
        : 500;

    if (statusCode === 403) {
      return res.status(403).json({
        message:
          error instanceof Error
            ? error.message
            : "Недостаточно прав для выбранного города",
      });
    }

    console.error("getCustomReport error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}
