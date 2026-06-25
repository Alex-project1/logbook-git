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

type AlarmBreakdown = {
  oh: number;
  partner: number;
};

type AdditionalReasonBreakdown = AlarmBreakdown & {
  total: number;
};

type ReportTotals = {
  totalShifts: number;
  totalTrips: number;
  totalDistanceKm: number;

  tripGoalCounts: Record<string, number>;
  tripGoalDistanceKm: Record<string, number>;

  totalAlarms: number;
  totalAlarmsDistanceKm: number;
  falseDistanceKm: number;
  combatDistanceKm: number;
  additionalDistanceKm: number;
  detainedDistanceKm: number;
  transferredDistanceKm: number;
  totalOh: number;
  totalPartner: number;

  falseTotal: number;
  falseOh: number;
  falsePartner: number;

  combatTotal: number;
  combatOh: number;
  combatPartner: number;

  additionalTotal: number;
  additionalOh: number;
  additionalPartner: number;
  additionalByReason: Record<string, number>;
  additionalByReasonBreakdown: Record<string, AdditionalReasonBreakdown>;
  additionalByReasonDistanceKm: Record<string, number>;

  detained: number;
  detainedOh: number;
  detainedPartner: number;

  transferred: number;
  transferredOh: number;
  transferredPartner: number;
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
  totalShifts: "Усього змін",
  totalTrips: "Усього поїздок",
  totalDistanceKm: "Пробіг, км",
  totalAlarms: "Усього спрацювань",
  falseTotal: "Хибні",
  combatTotal: "Бойові",
  additionalTotal: "Додаткові",
  detained: "Затримано",
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
    tripGoalDistanceKm: {},

    totalAlarms: 0,
    totalAlarmsDistanceKm: 0,
    falseDistanceKm: 0,
    combatDistanceKm: 0,
    additionalDistanceKm: 0,
    detainedDistanceKm: 0,
    transferredDistanceKm: 0,
    totalOh: 0,
    totalPartner: 0,

    falseTotal: 0,
    falseOh: 0,
    falsePartner: 0,

    combatTotal: 0,
    combatOh: 0,
    combatPartner: 0,

    additionalTotal: 0,
    additionalOh: 0,
    additionalPartner: 0,
    additionalByReason: {},
    additionalByReasonBreakdown: {},
    additionalByReasonDistanceKm: {},

    detained: 0,
    detainedOh: 0,
    detainedPartner: 0,

    transferred: 0,
    transferredOh: 0,
    transferredPartner: 0,
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

function addToDistanceMap(
  map: Record<string, number>,
  key: string,
  distanceKm: number,
) {
  map[key] = (map[key] ?? 0) + distanceKm;
}

function addToReasonBreakdownMap(
  map: Record<string, AdditionalReasonBreakdown>,
  reasonName: string,
  breakdown: AlarmBreakdown,
) {
  const current = map[reasonName] ?? {
    total: 0,
    oh: 0,
    partner: 0,
  };

  current.oh += breakdown.oh;
  current.partner += breakdown.partner;
  current.total = current.oh + current.partner;

  map[reasonName] = current;
}

function splitByAlarmSource(params: {
  count: number;
  alarmSource?: string | null;
  oh?: number;
  partner?: number;
}): AlarmBreakdown {
  const count = toNumber(params.count);

  if (count <= 0) {
    return { oh: 0, partner: 0 };
  }

  if (params.alarmSource === "OH") {
    return { oh: count, partner: 0 };
  }

  if (params.alarmSource === "PARTNER") {
    return { oh: 0, partner: count };
  }

  const oh = toNumber(params.oh);
  const partner = toNumber(params.partner);
  const total = oh + partner;

  if (total <= 0) {
    return { oh: 0, partner: 0 };
  }

  if (oh > 0 && partner <= 0) {
    return { oh: count, partner: 0 };
  }

  if (partner > 0 && oh <= 0) {
    return { oh: 0, partner: count };
  }

  const ohShare = roundNumber((count * oh) / total);

  return {
    oh: ohShare,
    partner: roundNumber(count - ohShare),
  };
}

function addBreakdownToDetainedAndTransferred(params: {
  totals: ReportTotals;
  detained: number;
  transferred: number;
  distanceKm?: number;
  alarmSource?: string | null;
  oh?: number;
  partner?: number;
}) {
  const detainedBreakdown = splitByAlarmSource({
    count: params.detained,
    alarmSource: params.alarmSource,
    oh: params.oh,
    partner: params.partner,
  });

  const transferredBreakdown = splitByAlarmSource({
    count: params.transferred,
    alarmSource: params.alarmSource,
    oh: params.oh,
    partner: params.partner,
  });

  const detained = toNumber(params.detained);
  const transferred = toNumber(params.transferred);
  const distanceKm = toNumber(params.distanceKm);

  params.totals.detained += detained;
  params.totals.detainedOh += detainedBreakdown.oh;
  params.totals.detainedPartner += detainedBreakdown.partner;

  params.totals.transferred += transferred;
  params.totals.transferredOh += transferredBreakdown.oh;
  params.totals.transferredPartner += transferredBreakdown.partner;

  if (detained > 0) {
    params.totals.detainedDistanceKm += distanceKm;
  }

  if (transferred > 0) {
    params.totals.transferredDistanceKm += distanceKm;
  }
}

function addShiftToTotals(totals: ReportTotals, shift: any) {
  totals.totalShifts += getShiftEquivalent(shift);

  for (const trip of shift.trips ?? []) {
    const tripDistanceKm = toNumber(trip.distanceKm);

    totals.totalTrips += 1;
    totals.totalDistanceKm += tripDistanceKm;

    const goalKey = String(trip.goalId);
    totals.tripGoalCounts[goalKey] = (totals.tripGoalCounts[goalKey] ?? 0) + 1;
    addToDistanceMap(totals.tripGoalDistanceKm, goalKey, tripDistanceKm);

    for (const event of trip.events ?? []) {
      const detained = event.detainedCount ?? 0;
      const transferred = event.transferredCount ?? 0;

      if (event.eventCategory === "REGULAR_ALARM") {
        totals.totalAlarms += 1;
        totals.totalAlarmsDistanceKm += tripDistanceKm;

        if (event.alarmSource === "OH") {
          totals.totalOh += 1;
        }

        if (event.alarmSource === "PARTNER") {
          totals.totalPartner += 1;
        }

        if (event.isCombat) {
          totals.combatTotal += 1;
          totals.combatDistanceKm += tripDistanceKm;

          if (event.alarmSource === "OH") {
            totals.combatOh += 1;
          }

          if (event.alarmSource === "PARTNER") {
            totals.combatPartner += 1;
          }
        } else {
          totals.falseTotal += 1;
          totals.falseDistanceKm += tripDistanceKm;

          if (event.alarmSource === "OH") {
            totals.falseOh += 1;
          }

          if (event.alarmSource === "PARTNER") {
            totals.falsePartner += 1;
          }
        }

        addBreakdownToDetainedAndTransferred({
          totals,
          detained,
          transferred,
          distanceKm: tripDistanceKm,
          alarmSource: event.alarmSource,
        });
      }

      if (event.eventCategory === "ADDITIONAL_ALARM") {
        const oh = event.ohCount ?? 0;
        const partner = event.partnerCount ?? 0;
        const total = oh + partner;

        totals.totalAlarms += total;
        totals.totalAlarmsDistanceKm += total > 0 ? tripDistanceKm : 0;
        totals.totalOh += oh;
        totals.totalPartner += partner;

        totals.additionalTotal += total;
        totals.additionalDistanceKm += total > 0 ? tripDistanceKm : 0;
        totals.additionalOh += oh;
        totals.additionalPartner += partner;

        const reasonName =
          event.reason?.name ?? event.customReasonText ?? "Без причини";

        addToReasonMap(totals.additionalByReason, reasonName, total);
        addToReasonBreakdownMap(totals.additionalByReasonBreakdown, reasonName, {
          oh,
          partner,
        });

        if (total > 0) {
          addToDistanceMap(
            totals.additionalByReasonDistanceKm,
            reasonName,
            tripDistanceKm,
          );
        }

        addBreakdownToDetainedAndTransferred({
          totals,
          detained,
          transferred,
          distanceKm: tripDistanceKm,
          oh,
          partner,
        });
      }
    }
  }
}
function roundBreakdown(value: AlarmBreakdown): AlarmBreakdown {
  return {
    oh: roundNumber(value.oh),
    partner: roundNumber(value.partner),
  };
}

function finalizeTotals(totals: ReportTotals): ReportTotals {
  return {
    ...totals,
    totalShifts: roundNumber(totals.totalShifts),
    totalDistanceKm: roundNumber(totals.totalDistanceKm),
    totalAlarmsDistanceKm: roundNumber(totals.totalAlarmsDistanceKm),
    falseDistanceKm: roundNumber(totals.falseDistanceKm),
    combatDistanceKm: roundNumber(totals.combatDistanceKm),
    additionalDistanceKm: roundNumber(totals.additionalDistanceKm),
    detainedDistanceKm: roundNumber(totals.detainedDistanceKm),
    transferredDistanceKm: roundNumber(totals.transferredDistanceKm),
    tripGoalDistanceKm: Object.fromEntries(
      Object.entries(totals.tripGoalDistanceKm).map(([key, value]) => [
        key,
        roundNumber(value),
      ]),
    ),
    falseOh: roundNumber(totals.falseOh),
    falsePartner: roundNumber(totals.falsePartner),
    combatOh: roundNumber(totals.combatOh),
    combatPartner: roundNumber(totals.combatPartner),
    additionalOh: roundNumber(totals.additionalOh),
    additionalPartner: roundNumber(totals.additionalPartner),
    detainedOh: roundNumber(totals.detainedOh),
    detainedPartner: roundNumber(totals.detainedPartner),
    transferredOh: roundNumber(totals.transferredOh),
    transferredPartner: roundNumber(totals.transferredPartner),
    additionalByReason: Object.fromEntries(
      Object.entries(totals.additionalByReason).map(([key, value]) => [
        key,
        roundNumber(value),
      ]),
    ),
    additionalByReasonBreakdown: Object.fromEntries(
      Object.entries(totals.additionalByReasonBreakdown).map(([key, value]) => [
        key,
        {
          total: roundNumber(value.total),
          ...roundBreakdown(value),
        },
      ]),
    ),
    additionalByReasonDistanceKm: Object.fromEntries(
      Object.entries(totals.additionalByReasonDistanceKm).map(([key, value]) => [
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

function getTableRowBreakdown(
  totals: ReportTotals,
  row: CustomTableRowDefinition,
): AlarmBreakdown | null {
  if (row.kind === "additionalReason" && row.reasonName) {
    const breakdown = totals.additionalByReasonBreakdown[row.reasonName];

    return breakdown ? roundBreakdown(breakdown) : null;
  }

  if (row.kind === "transferred") {
    return {
      oh: roundNumber(totals.transferredOh),
      partner: roundNumber(totals.transferredPartner),
    };
  }

  if (row.metric === "totalAlarms") {
    return {
      oh: roundNumber(totals.totalOh),
      partner: roundNumber(totals.totalPartner),
    };
  }

  if (row.metric === "falseTotal") {
    return {
      oh: roundNumber(totals.falseOh),
      partner: roundNumber(totals.falsePartner),
    };
  }

  if (row.metric === "combatTotal") {
    return {
      oh: roundNumber(totals.combatOh),
      partner: roundNumber(totals.combatPartner),
    };
  }

  if (row.metric === "additionalTotal") {
    return {
      oh: roundNumber(totals.additionalOh),
      partner: roundNumber(totals.additionalPartner),
    };
  }

  if (row.metric === "detained") {
    return {
      oh: roundNumber(totals.detainedOh),
      partner: roundNumber(totals.detainedPartner),
    };
  }

  return null;
}

function getTableRowDistanceKm(
  totals: ReportTotals,
  row: CustomTableRowDefinition,
): number | null {
  if (row.kind === "tripGoal" && row.tripGoalId) {
    return roundNumber(totals.tripGoalDistanceKm[String(row.tripGoalId)] ?? 0);
  }

  if (row.kind === "additionalReason" && row.reasonName) {
    return roundNumber(totals.additionalByReasonDistanceKm[row.reasonName] ?? 0);
  }

  if (row.kind === "transferred") {
    return roundNumber(totals.transferredDistanceKm);
  }

  if (row.metric === "totalTrips") {
    return roundNumber(totals.totalDistanceKm);
  }

  if (row.metric === "totalAlarms") {
    return roundNumber(totals.totalAlarmsDistanceKm);
  }

  if (row.metric === "falseTotal") {
    return roundNumber(totals.falseDistanceKm);
  }

  if (row.metric === "combatTotal") {
    return roundNumber(totals.combatDistanceKm);
  }

  if (row.metric === "additionalTotal") {
    return roundNumber(totals.additionalDistanceKm);
  }

  if (row.metric === "detained") {
    return roundNumber(totals.detainedDistanceKm);
  }

  return null;
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
      key: "totalAlarms",
      label: "Спрацювання",
      level: 0,
      metric: "totalAlarms",
      kind: "metric",
    });

    if (params.metrics.includes("falseTotal")) {
      rows.push({
        key: "falseTotal",
        label: "Хибні",
        level: 1,
        metric: "falseTotal",
        kind: "metric",
      });
    }

    if (params.metrics.includes("combatTotal")) {
      rows.push({
        key: "combatTotal",
        label: "Бойові",
        level: 1,
        metric: "combatTotal",
        kind: "metric",
      });
    }

    if (params.metrics.includes("additionalTotal")) {
      rows.push({
        key: "additionalTotal",
        label: "Додаткові",
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
        label: "Передано до поліції",
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
        label: "Усього",
      },
      ...params.groups.map((group) => ({
        key: String(group.id),
        label: group.name,
      })),
    ],
    rows: params.rowDefinitions.map((row) => {
      const breakdowns = Object.fromEntries(
        [
          ["total", getTableRowBreakdown(params.totals, row)] as const,
          ...params.groups.map((group) => [
            String(group.id),
            getTableRowBreakdown(group.totals, row),
          ] as const),
        ].filter(([, breakdown]) => breakdown !== null),
      );

      const distanceKms = Object.fromEntries(
        [
          ["total", getTableRowDistanceKm(params.totals, row)] as const,
          ...params.groups.map((group) => [
            String(group.id),
            getTableRowDistanceKm(group.totals, row),
          ] as const),
        ].filter(([, distanceKm]) => distanceKm !== null),
      );

      return {
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
        breakdowns,
        distanceKms,
      };
    }),
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
      "Недостатньо прав для обраного міста",
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
            : "Недостатньо прав для обраного міста",
      });
    }

    console.error("getCustomReport error:", error);

    return res.status(500).json({
      message: "Внутрішня помилка сервера",
    });
  }
}
