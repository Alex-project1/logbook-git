import { Request, Response } from "express";
import ExcelJS from "exceljs";
import { prisma } from "../../config/prisma";
import {
  buildCityAccessWhere,
  buildDepartmentAccessWhere,
  getAllowedCityIds,
  getAllowedDepartmentIds,
} from "../../utils/admin-access";

type ExportScope = {
  allowedCityIds: number[] | null;
  allowedDepartmentIds: number[] | null;
};

async function getExportScope(req: Request): Promise<ExportScope> {
  return {
    allowedCityIds: await getAllowedCityIds(req),
    allowedDepartmentIds: await getAllowedDepartmentIds(req),
  };
}

function buildExportAccessWhere(scope: ExportScope) {
  return {
    ...buildCityAccessWhere(scope.allowedCityIds),
    ...buildDepartmentAccessWhere(scope.allowedDepartmentIds),
  };
}

function toNumber(value: unknown) {
  return Number(value ?? 0);
}
function getShiftEquivalent(shift: { shiftDurationHours?: unknown }) {
  const durationHours = Number(shift.shiftDurationHours ?? 24);

  if (!Number.isFinite(durationHours) || durationHours <= 0) {
    return 1;
  }

  return roundNumber(durationHours / 24);
}

function parseDate(value: unknown) {
  if (!value) return undefined;

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date;
}

function roundNumber(value: number) {
  return Math.round(value * 100) / 100;
}

function getDutyTypeExportLabel(value: string | null | undefined) {
  const labels: Record<string, string> = {
    FULL_DAY: "Добовий",
    DAY: "Денний",
    NIGHT: "Нічний",
  };

  return labels[value ?? ""] ?? value ?? "—";
}

function getTransportTypeExportLabel(value: string | null | undefined) {
  const labels: Record<string, string> = {
    AUTO: "Авто",
    MOTO: "Мото",
  };

  return labels[value ?? ""] ?? value ?? "—";
}

async function loadShiftsForExport(params: {
  cityId?: number;
  departmentId?: number;
  dateFrom?: Date;
  dateTo?: Date;
  scope?: ExportScope;
}) {
  return prisma.shift.findMany({
    where: {
      deletedAt: null,
      ...(params.scope ? buildExportAccessWhere(params.scope) : {}),
      ...(params.cityId ? { cityId: params.cityId } : {}),
      ...(params.departmentId ? { departmentId: params.departmentId } : {}),
      ...(params.dateFrom || params.dateTo
        ? {
            shiftDate: {
              ...(params.dateFrom ? { gte: params.dateFrom } : {}),
              ...(params.dateTo ? { lte: params.dateTo } : {}),
            },
          }
        : {}),
    },
    include: {
      city: { select: { id: true, name: true } },
      crew: { select: { id: true, name: true } },
      vehicle: { select: { id: true, title: true, licensePlate: true } },
      driverEmployee: { select: { id: true, fullName: true } },
      seniorEmployee: { select: { id: true, fullName: true } },
      trips: {
        where: { deletedAt: null },
        include: {
          goal: { select: { id: true, name: true, systemCode: true } },
          events: {
            include: {
              reason: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });
}

type ShiftForExport = Awaited<ReturnType<typeof loadShiftsForExport>>[number];

function calculateShiftSummary(shift: ShiftForExport) {
  let totalTrips = 0;
  let totalDistanceKm = toNumber(shift.totalDistanceKm);
  const shiftEquivalent = getShiftEquivalent(shift);

  let regularOh = 0;
  let regularPartner = 0;

  let combatOh = 0;
  let combatPartner = 0;

  let falseOh = 0;
  let falsePartner = 0;

  let additionalOh = 0;
  let additionalPartner = 0;

  let detained = 0;
  let transferred = 0;

  const additionalByReason: Record<
    string,
    { total: number; oh: number; partner: number }
  > = {};
  const distanceByGoal: Record<string, number> = {};

  for (const trip of shift.trips) {
    totalTrips += 1;

    const goalName = trip.goal?.name ?? "Без цілі";
    distanceByGoal[goalName] =
      (distanceByGoal[goalName] ?? 0) + toNumber(trip.distanceKm);

    for (const event of trip.events) {
      detained += event.detainedCount ?? 0;
      transferred += event.transferredCount ?? 0;

      if (event.eventCategory === "REGULAR_ALARM") {
        if (event.alarmSource === "OH") {
          regularOh += 1;
          if (event.isCombat) combatOh += 1;
          else falseOh += 1;
        }

        if (event.alarmSource === "PARTNER") {
          regularPartner += 1;
          if (event.isCombat) combatPartner += 1;
          else falsePartner += 1;
        }
      }

      if (event.eventCategory === "ADDITIONAL_ALARM") {
        const oh = event.ohCount ?? 0;
        const partner = event.partnerCount ?? 0;
        const total = oh + partner;

        additionalOh += oh;
        additionalPartner += partner;

        const reasonName =
          event.reason?.name ?? event.customReasonText ?? "Без причини";

        if (!additionalByReason[reasonName]) {
          additionalByReason[reasonName] = { total: 0, oh: 0, partner: 0 };
        }

        additionalByReason[reasonName].total += total;
        additionalByReason[reasonName].oh += oh;
        additionalByReason[reasonName].partner += partner;
      }
    }
  }

  const totalOh = regularOh + additionalOh;
  const totalPartner = regularPartner + additionalPartner;

  return {
    shiftEquivalent,
    totalTrips,
    totalDistanceKm,

    totalAlarms: totalOh + totalPartner,
    totalOh,
    totalPartner,

    falseTotal: falseOh + falsePartner,
    falseOh,
    falsePartner,

    combatTotal: combatOh + combatPartner,
    combatOh,
    combatPartner,

    additionalTotal: additionalOh + additionalPartner,
    additionalOh,
    additionalPartner,

    detained,
    transferred,

    additionalByReason,
    distanceByGoal,
  };
}

function createEmptyTotals() {
  return {
    totalShifts: 0,
    totalTrips: 0,
    totalDistanceKm: 0,

    totalAlarms: 0,
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

    detained: 0,
    transferred: 0,

    additionalByReason: {} as Record<
      string,
      { total: number; oh: number; partner: number }
    >,
  };
}

function finalizeTotals(totals: ReturnType<typeof createEmptyTotals>) {
  return {
    ...totals,
    totalShifts: roundNumber(totals.totalShifts),
    totalDistanceKm: roundNumber(totals.totalDistanceKm),
    averageAlarmsPerShift:
      totals.totalShifts > 0
        ? roundNumber(totals.totalAlarms / totals.totalShifts)
        : 0,
    averageDistancePerShift:
      totals.totalShifts > 0
        ? roundNumber(totals.totalDistanceKm / totals.totalShifts)
        : 0,
  };
}

function addSummaryToTotals(
  totals: ReturnType<typeof createEmptyTotals>,
  summary: ReturnType<typeof calculateShiftSummary>,
) {
  totals.totalShifts += summary.shiftEquivalent;
  totals.totalTrips += summary.totalTrips;
  totals.totalDistanceKm += summary.totalDistanceKm;

  totals.totalAlarms += summary.totalAlarms;
  totals.totalOh += summary.totalOh;
  totals.totalPartner += summary.totalPartner;

  totals.falseTotal += summary.falseTotal;
  totals.falseOh += summary.falseOh;
  totals.falsePartner += summary.falsePartner;

  totals.combatTotal += summary.combatTotal;
  totals.combatOh += summary.combatOh;
  totals.combatPartner += summary.combatPartner;

  totals.additionalTotal += summary.additionalTotal;
  totals.additionalOh += summary.additionalOh;
  totals.additionalPartner += summary.additionalPartner;

  totals.detained += summary.detained;
  totals.transferred += summary.transferred;

  for (const [reasonName, reasonStats] of Object.entries(
    summary.additionalByReason,
  )) {
    if (!totals.additionalByReason[reasonName]) {
      totals.additionalByReason[reasonName] = {
        total: 0,
        oh: 0,
        partner: 0,
      };
    }

    totals.additionalByReason[reasonName].total += reasonStats.total;
    totals.additionalByReason[reasonName].oh += reasonStats.oh;
    totals.additionalByReason[reasonName].partner += reasonStats.partner;
  }
}
function addPostDutyToEmployeeExportTotal(
  row: any,
  params: {
    postName: string;
    durationHours: number;
    hasWeapon: boolean;
    isDriver: boolean;
  },
) {
  const shiftEquivalent = params.durationHours / 24;

  row.totalShifts += shiftEquivalent;
  row.postDutyShiftEquivalent += shiftEquivalent;
  row.postDutyHours += params.durationHours;
  row.postDutyCount += 1;

  if (params.hasWeapon) {
    row.weaponShifts += shiftEquivalent;
  }

  if (params.isDriver) {
    row.driverShifts += shiftEquivalent;
  }

  if (!row.postDutyByPost[params.postName]) {
    row.postDutyByPost[params.postName] = {
      shiftEquivalent: 0,
      hours: 0,
      count: 0,
    };
  }

  row.postDutyByPost[params.postName].shiftEquivalent += shiftEquivalent;
  row.postDutyByPost[params.postName].hours += params.durationHours;
  row.postDutyByPost[params.postName].count += 1;
}

function buildPostDutyExportText(postDutyByPost: Record<string, any>) {
  const rows = Object.entries(postDutyByPost);

  if (!rows.length) {
    return "";
  }

  return rows
    .map(([postName, stats]) => {
      return `${postName}: ${roundNumber(stats.shiftEquivalent)} змін / ${roundNumber(
        stats.hours,
      )} год / ${stats.count} виходів`;
    })
    .join("; ");
}
function styleSheet(sheet: ExcelJS.Worksheet) {
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };

  headerRow.eachCell((cell) => {
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  });

  sheet.columns.forEach((column) => {
    column.width = Math.max(column.width ?? 12, 14);
  });
}

export async function exportReportsExcel(req: Request, res: Response) {
  try {
    const scope = await getExportScope(req);
    const cityId = parseNumberExportQuery(req.query.cityId);
    const departmentId = parseNumberExportQuery(req.query.departmentId);
    const dateFrom = parseDate(req.query.dateFrom);
    const dateTo = parseDate(req.query.dateTo);

    const shifts = await loadShiftsForExport({
      cityId,
      departmentId,
      dateFrom,
      dateTo,
      scope,
    });

    const totals = createEmptyTotals();
    const byCity = new Map<
      string,
      ReturnType<typeof createEmptyTotals> & {
        cityId: number;
        cityName: string;
      }
    >();

    for (const shift of shifts) {
      const summary = calculateShiftSummary(shift);

      addSummaryToTotals(totals, summary);

      const cityKey = String(shift.city.id);

      if (!byCity.has(cityKey)) {
        byCity.set(cityKey, {
          ...createEmptyTotals(),
          cityId: shift.city.id,
          cityName: shift.city.name,
        });
      }

      addSummaryToTotals(byCity.get(cityKey)!, summary);
    }

    const finalizedTotals = finalizeTotals(totals);
    const byCityRows = Array.from(byCity.values()).map((cityTotals) => ({
      cityId: cityTotals.cityId,
      cityName: cityTotals.cityName,
      ...finalizeTotals(cityTotals),
    }));

    const additionalByReason = Object.entries(
      finalizedTotals.additionalByReason,
    )
      .map(([reasonName, stats]) => ({
        reasonName,
        ...stats,
      }))
      .sort((a, b) => b.total - a.total);

    const workbook = new ExcelJS.Workbook();

    workbook.creator = "Guard Journal";
    workbook.created = new Date();

    const summarySheet = workbook.addWorksheet("Зведення");
    const citiesSheet = workbook.addWorksheet("За містами");
    const reasonsSheet = workbook.addWorksheet("Дод. спрацювання");

    summarySheet.columns = [
      { header: "Показник", key: "label", width: 32 },
      { header: "Значення", key: "value", width: 18 },
    ];

    summarySheet.addRows([
      { label: "Усього змін", value: finalizedTotals.totalShifts },
      { label: "Усього поїздок", value: finalizedTotals.totalTrips },
      { label: "Пробіг", value: finalizedTotals.totalDistanceKm },
      { label: "Усього спрацювань", value: finalizedTotals.totalAlarms },
      { label: "ОХ", value: finalizedTotals.totalOh },
      { label: "Партнери", value: finalizedTotals.totalPartner },
      { label: "Бойові", value: finalizedTotals.combatTotal },
      { label: "Хибні", value: finalizedTotals.falseTotal },
      { label: "Додатково", value: finalizedTotals.additionalTotal },
      { label: "Затримано", value: finalizedTotals.detained },
      { label: "Передано", value: finalizedTotals.transferred },
      {
        label: "Середнє навантаження",
        value: finalizedTotals.averageAlarmsPerShift,
      },
      {
        label: "Середній пробіг",
        value: finalizedTotals.averageDistancePerShift,
      },
    ]);

    citiesSheet.columns = [
      { header: "Місто", key: "cityName", width: 22 },
      { header: "Змін", key: "totalShifts", width: 12 },
      { header: "Поїздок", key: "totalTrips", width: 12 },
      { header: "Пробіг", key: "totalDistanceKm", width: 14 },
      { header: "Спрацювань", key: "totalAlarms", width: 14 },
      { header: "ОХ", key: "totalOh", width: 10 },
      { header: "Партнери", key: "totalPartner", width: 12 },
      { header: "Бойові", key: "combatTotal", width: 12 },
      { header: "Хибні", key: "falseTotal", width: 12 },
      { header: "Дод.", key: "additionalTotal", width: 12 },
      { header: "Затримано", key: "detained", width: 12 },
      { header: "Передано", key: "transferred", width: 12 },
      { header: "Середня", key: "averageAlarmsPerShift", width: 14 },
    ];

    for (const row of byCityRows) {
      citiesSheet.addRow({
        cityName: row.cityName,
        totalShifts: row.totalShifts,
        totalTrips: row.totalTrips,
        totalDistanceKm: row.totalDistanceKm,
        totalAlarms: row.totalAlarms,
        totalOh: row.totalOh,
        totalPartner: row.totalPartner,
        combatTotal: row.combatTotal,
        falseTotal: row.falseTotal,
        additionalTotal: row.additionalTotal,
        detained: row.detained,
        transferred: row.transferred,
        averageAlarmsPerShift: row.averageAlarmsPerShift,
      });
    }

    reasonsSheet.columns = [
      { header: "Причина", key: "reasonName", width: 30 },
      { header: "Усього", key: "total", width: 14 },
      { header: "ОХ", key: "oh", width: 14 },
      { header: "Партнери", key: "partner", width: 14 },
    ];

    reasonsSheet.addRow({
      reasonName: "Додатково",
      total: finalizedTotals.additionalTotal,
      oh: finalizedTotals.additionalOh,
      partner: finalizedTotals.additionalPartner,
    });

    for (const row of additionalByReason) {
      reasonsSheet.addRow({
        reasonName: row.reasonName,
        total: row.total,
        oh: row.oh,
        partner: row.partner,
      });
    }

    [summarySheet, citiesSheet, reasonsSheet].forEach(styleSheet);

    const fileName = `reports-${Date.now()}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("exportReportsExcel error:", error);

    return res.status(500).json({
      message: "Внутрішня помилка сервера",
    });
  }
}

type TripsExportSortBy =
  | "shiftDate"
  | "departureTime"
  | "arrivalTime"
  | "arrivalMinutes"
  | "distanceKm";

function parseNumberExportQuery(value: unknown) {
  if (!value) return undefined;

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return undefined;
  }

  return numberValue;
}

function parseBooleanExportQuery(value: unknown) {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function buildTripExportOrderBy(
  sortBy: TripsExportSortBy,
  sortDir: "asc" | "desc",
) {
  if (sortBy === "shiftDate") {
    return {
      shift: {
        shiftDate: sortDir,
      },
    };
  }

  return {
    [sortBy]: sortDir,
  };
}

function buildTripExportEventSummary(events: any[]) {
  if (!events.length) {
    return "—";
  }

  return events
    .map((event) => {
      if (event.eventCategory === "REGULAR_ALARM") {
        const source = event.alarmSource === "OH" ? "ОХ" : "Партнери";
        const combatText = event.isCombat ? "бойова" : "хибна";
        return `${source}, ${combatText}`;
      }

      const reason =
        event.reason?.name ?? event.customReasonText ?? "Без причини";
      const oh = event.ohCount ?? 0;
      const partner = event.partnerCount ?? 0;

      return `Дод.: ${reason} (${oh}/${partner})`;
    })
    .join("; ");
}

function calculateTripExportTotals(events: any[]) {
  let regularOh = 0;
  let regularPartner = 0;

  let combatTotal = 0;
  let falseTotal = 0;

  let additionalOh = 0;
  let additionalPartner = 0;

  let detained = 0;
  let transferred = 0;

  for (const event of events) {
    detained += event.detainedCount ?? 0;
    transferred += event.transferredCount ?? 0;

    if (event.eventCategory === "REGULAR_ALARM") {
      if (event.alarmSource === "OH") {
        regularOh += 1;
      }

      if (event.alarmSource === "PARTNER") {
        regularPartner += 1;
      }

      if (event.isCombat) {
        combatTotal += 1;
      } else {
        falseTotal += 1;
      }
    }

    if (event.eventCategory === "ADDITIONAL_ALARM") {
      additionalOh += event.ohCount ?? 0;
      additionalPartner += event.partnerCount ?? 0;
    }
  }

  return {
    totalOh: regularOh + additionalOh,
    totalPartner: regularPartner + additionalPartner,
    totalAlarms: regularOh + regularPartner + additionalOh + additionalPartner,
    combatTotal,
    falseTotal,
    additionalOh,
    additionalPartner,
    detained,
    transferred,
  };
}

function getTripExportCombatLabel(totals: {
  combatTotal: number;
  falseTotal: number;
}) {
  if (totals.combatTotal > 0 && totals.falseTotal > 0) {
    return "Є бойові та хибні";
  }

  if (totals.combatTotal > 0) {
    return "Бойова";
  }

  if (totals.falseTotal > 0) {
    return "Хибна";
  }

  return "—";
}

function buildTripExportWhere(
  req: Request,
  scope: ExportScope,
  departmentId?: number,
) {
  const cityId = parseNumberExportQuery(req.query.cityId);
  const crewId = parseNumberExportQuery(req.query.crewId);
  const vehicleId = parseNumberExportQuery(req.query.vehicleId);
  const employeeId = parseNumberExportQuery(req.query.employeeId);
  const goalId = parseNumberExportQuery(req.query.goalId);

  const dateFrom = parseDate(req.query.dateFrom);
  const dateTo = parseDate(req.query.dateTo);

  const alarmSourceRaw = req.query.alarmSource
    ? String(req.query.alarmSource)
    : undefined;

  const alarmSource =
    alarmSourceRaw === "OH" || alarmSourceRaw === "PARTNER"
      ? alarmSourceRaw
      : undefined;

  const isCombat = parseBooleanExportQuery(req.query.isCombat);
  const hasDetained = parseBooleanExportQuery(req.query.hasDetained);
  const hasTransferred = parseBooleanExportQuery(req.query.hasTransferred);

  const search = req.query.search ? String(req.query.search).trim() : "";

  const eventConditions: any[] = [];

  if (alarmSource) {
    eventConditions.push({ alarmSource });
  }

  if (typeof isCombat === "boolean") {
    eventConditions.push({ isCombat });
  }

  if (hasDetained) {
    eventConditions.push({
      detainedCount: {
        gt: 0,
      },
    });
  }

  if (hasTransferred) {
    eventConditions.push({
      transferredCount: {
        gt: 0,
      },
    });
  }

  const where: any = {
    deletedAt: null,
    shift: {
      deletedAt: null,
      ...buildExportAccessWhere(scope),
      ...(departmentId ? { departmentId } : {}),
      ...(dateFrom || dateTo
        ? {
            shiftDate: {
              ...(dateFrom ? { gte: dateFrom } : {}),
              ...(dateTo ? { lte: dateTo } : {}),
            },
          }
        : {}),
      ...(crewId ? { crewId } : {}),
      ...(vehicleId ? { vehicleId } : {}),
      ...(employeeId
        ? {
            OR: [
              { driverEmployeeId: employeeId },
              { seniorEmployeeId: employeeId },
            ],
          }
        : {}),
    },
    ...(cityId ? { cityId } : {}),
    ...(goalId ? { goalId } : {}),
    ...(eventConditions.length
      ? {
          events: {
            some: {
              AND: eventConditions,
            },
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { fromLocation: { contains: search } },
            { toLocation: { contains: search } },
            { note: { contains: search } },
            {
              goal: {
                name: {
                  contains: search,
                },
              },
            },
            {
              shift: {
                crew: {
                  name: {
                    contains: search,
                  },
                },
              },
            },
            {
              shift: {
                vehicle: {
                  title: {
                    contains: search,
                  },
                },
              },
            },
            {
              shift: {
                driverEmployee: {
                  fullName: {
                    contains: search,
                  },
                },
              },
            },
            {
              shift: {
                seniorEmployee: {
                  fullName: {
                    contains: search,
                  },
                },
              },
            },
          ],
        }
      : {}),
  };

  return where;
}

export async function exportTripsTableExcel(req: Request, res: Response) {
  try {
    const scope = await getExportScope(req);
    const departmentId = parseNumberExportQuery(req.query.departmentId);
    const sortByRaw = String(req.query.sortBy ?? "departureTime");

    const sortBy: TripsExportSortBy = [
      "shiftDate",
      "departureTime",
      "arrivalTime",
      "arrivalMinutes",
      "distanceKm",
    ].includes(sortByRaw)
      ? (sortByRaw as TripsExportSortBy)
      : "departureTime";

    const sortDir: "asc" | "desc" =
      req.query.sortDir === "asc" ? "asc" : "desc";

    const where = buildTripExportWhere(req, scope, departmentId);

    const trips = await prisma.trip.findMany({
      where,
      take: 10000,
      orderBy: buildTripExportOrderBy(sortBy, sortDir) as any,
      include: {
        city: {
          select: {
            id: true,
            name: true,
          },
        },
        shift: {
          select: {
            id: true,
            shiftDate: true,
            submittedAt: true,
            odometerStart: true,
            odometerEndCalculated: true,
            totalDistanceKm: true,
            department: {
              select: {
                id: true,
                name: true,
                type: true,
              },
            },
            crew: {
              select: {
                id: true,
                name: true,
              },
            },
            vehicle: {
              select: {
                id: true,
                title: true,
                licensePlate: true,
              },
            },
            driverEmployee: {
              select: {
                id: true,
                fullName: true,
              },
            },
            seniorEmployee: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
        },
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
    });

    const workbook = new ExcelJS.Workbook();

    workbook.creator = "Guard Journal";
    workbook.created = new Date();

    const tripsSheet = workbook.addWorksheet("Усі поїздки");
    const eventsSheet = workbook.addWorksheet("Події поїздок");

    tripsSheet.columns = [
      { header: "Місто", key: "city", width: 18 },
      { header: "Підрозділ", key: "department", width: 20 },
      { header: "Дата", key: "shiftDate", width: 14 },
      { header: "Наряд", key: "crew", width: 18 },
      { header: "Авто", key: "vehicle", width: 24 },
      { header: "Держномер", key: "licensePlate", width: 16 },
      { header: "Старший", key: "senior", width: 28 },
      { header: "Водій", key: "driver", width: 28 },
      { header: "Спідометр початок", key: "odometerStart", width: 18 },
      { header: "Звідки", key: "fromLocation", width: 28 },
      { header: "Час виїзду", key: "departureTime", width: 18 },
      { header: "Куди", key: "toLocation", width: 28 },
      { header: "Час прибуття", key: "arrivalTime", width: 18 },
      { header: "Прибуття, хв", key: "arrivalMinutes", width: 16 },
      { header: "Відстань, км", key: "distanceKm", width: 16 },
      { header: "Ціль поїздки", key: "goal", width: 24 },
      { header: "Спрацювання", key: "eventSummary", width: 40 },
      { header: "Бойова?", key: "combatLabel", width: 18 },
      { header: "Усього спрацювань", key: "totalAlarms", width: 16 },
      { header: "ОХ", key: "totalOh", width: 10 },
      { header: "Партнери", key: "totalPartner", width: 12 },
      { header: "Дод. ОХ", key: "additionalOh", width: 12 },
      { header: "Дод. Партнери", key: "additionalPartner", width: 16 },
      { header: "Затримано", key: "detained", width: 12 },
      { header: "Передано", key: "transferred", width: 12 },
      { header: "Примітка", key: "note", width: 30 },
    ];

    eventsSheet.columns = [
      { header: "ID поїздки", key: "tripId", width: 12 },
      { header: "Місто", key: "city", width: 18 },
      { header: "Дата", key: "shiftDate", width: 14 },
      { header: "Наряд", key: "crew", width: 18 },
      { header: "Маршрут", key: "route", width: 42 },
      { header: "Подія", key: "title", width: 28 },
      { header: "Категорія", key: "eventCategory", width: 22 },
      { header: "ОХ", key: "ohCount", width: 10 },
      { header: "Партнери", key: "partnerCount", width: 12 },
      { header: "Усього", key: "countTotal", width: 10 },
      { header: "Бойова?", key: "combatLabel", width: 14 },
      { header: "Причина", key: "reasonName", width: 26 },
      { header: "Затримано", key: "detained", width: 12 },
      { header: "Передано", key: "transferred", width: 12 },
      { header: "Примітка", key: "note", width: 30 },
    ];

    for (const trip of trips) {
      const totals = calculateTripExportTotals(trip.events);
      const combatLabel = getTripExportCombatLabel(totals);

      tripsSheet.addRow({
        city: trip.city.name,
        department: trip.shift.department?.name ?? "—",
        shiftDate: trip.shift.shiftDate,
        crew: trip.shift.crew.name,
        vehicle: trip.shift.vehicle.title,
        licensePlate: trip.shift.vehicle.licensePlate ?? "",
        senior: trip.shift.seniorEmployee.fullName,
        driver: trip.shift.driverEmployee.fullName,
        odometerStart: trip.shift.odometerStart,
        fromLocation: trip.fromLocation,
        departureTime: trip.departureTime,
        toLocation: trip.toLocation,
        arrivalTime: trip.arrivalTime,
        arrivalMinutes: trip.arrivalMinutes,
        distanceKm: Number(trip.distanceKm),
        goal: trip.goal.name,
        eventSummary: buildTripExportEventSummary(trip.events),
        combatLabel,
        totalAlarms: totals.totalAlarms,
        totalOh: totals.totalOh,
        totalPartner: totals.totalPartner,
        additionalOh: totals.additionalOh,
        additionalPartner: totals.additionalPartner,
        detained: totals.detained,
        transferred: totals.transferred,
        note: trip.note ?? "",
      });

      for (const event of trip.events) {
        const isRegular = event.eventCategory === "REGULAR_ALARM";
        const ohCount = isRegular
          ? event.alarmSource === "OH"
            ? 1
            : 0
          : (event.ohCount ?? 0);

        const partnerCount = isRegular
          ? event.alarmSource === "PARTNER"
            ? 1
            : 0
          : (event.partnerCount ?? 0);

        eventsSheet.addRow({
          tripId: trip.id,
          city: trip.city.name,
          shiftDate: trip.shift.shiftDate,
          crew: trip.shift.crew.name,
          route: `${trip.fromLocation} → ${trip.toLocation}`,
          title: isRegular
            ? event.alarmSource === "OH"
              ? "Спрацювання ОХ"
              : "Спрацювання Партнери"
            : "Додаткові спрацювання",
          eventCategory: event.eventCategory,
          ohCount,
          partnerCount,
          countTotal: isRegular ? 1 : ohCount + partnerCount,
          combatLabel: isRegular ? (event.isCombat ? "Бойова" : "Хибна") : "",
          reasonName: event.reason?.name ?? event.customReasonText ?? "",
          detained: event.detainedCount ?? 0,
          transferred: event.transferredCount ?? 0,
          note: event.note ?? "",
        });
      }
    }

    [tripsSheet, eventsSheet].forEach(styleSheet);

    tripsSheet.getColumn("shiftDate").numFmt = "dd.mm.yyyy";
    tripsSheet.getColumn("departureTime").numFmt = "hh:mm";
    tripsSheet.getColumn("arrivalTime").numFmt = "hh:mm";

    eventsSheet.getColumn("shiftDate").numFmt = "dd.mm.yyyy";

    const fileName = `trips-report-${Date.now()}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("exportTripsTableExcel error:", error);

    return res.status(500).json({
      message: "Внутрішня помилка сервера",
    });
  }
}

type ShiftsExportSortBy =
  | "shiftDate"
  | "submittedAt"
  | "totalDistanceKm"
  | "odometerStart"
  | "odometerEndCalculated";

function buildShiftExportOrderBy(
  sortBy: ShiftsExportSortBy,
  sortDir: "asc" | "desc",
) {
  return {
    [sortBy]: sortDir,
  };
}

function buildShiftExportWhere(
  req: Request,
  scope: ExportScope,
  departmentId?: number,
) {
  const cityId = parseNumberExportQuery(req.query.cityId);
  const crewId = parseNumberExportQuery(req.query.crewId);
  const vehicleId = parseNumberExportQuery(req.query.vehicleId);
  const employeeId = parseNumberExportQuery(req.query.employeeId);

  const dateFrom = parseDate(req.query.dateFrom);
  const dateTo = parseDate(req.query.dateTo);

  const search = req.query.search ? String(req.query.search).trim() : "";

  const where: any = {
    deletedAt: null,
    ...buildExportAccessWhere(scope),
    ...(departmentId ? { departmentId } : {}),
    ...(cityId ? { cityId } : {}),
    ...(crewId ? { crewId } : {}),
    ...(vehicleId ? { vehicleId } : {}),
    ...(employeeId
      ? {
          OR: [
            { driverEmployeeId: employeeId },
            { seniorEmployeeId: employeeId },
          ],
        }
      : {}),
    ...(dateFrom || dateTo
      ? {
          shiftDate: {
            ...(dateFrom ? { gte: dateFrom } : {}),
            ...(dateTo ? { lte: dateTo } : {}),
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            {
              city: {
                name: {
                  contains: search,
                },
              },
            },
            {
              crew: {
                name: {
                  contains: search,
                },
              },
            },
            {
              vehicle: {
                title: {
                  contains: search,
                },
              },
            },
            {
              vehicle: {
                licensePlate: {
                  contains: search,
                },
              },
            },
            {
              driverEmployee: {
                fullName: {
                  contains: search,
                },
              },
            },
            {
              seniorEmployee: {
                fullName: {
                  contains: search,
                },
              },
            },
          ],
        }
      : {}),
  };

  return where;
}

function getWeaponExportLabel(params: {
  driverHasWeapon: boolean;
  seniorHasWeapon: boolean;
}) {
  const parts = [];

  if (params.driverHasWeapon) {
    parts.push("водій");
  }

  if (params.seniorHasWeapon) {
    parts.push("старший");
  }

  return parts.length ? parts.join(", ") : "без зброї";
}

export async function exportShiftsTableExcel(req: Request, res: Response) {
  try {
    const scope = await getExportScope(req);
    const departmentId = parseNumberExportQuery(req.query.departmentId);
    const sortByRaw = String(req.query.sortBy ?? "shiftDate");

    const sortBy: ShiftsExportSortBy = [
      "shiftDate",
      "submittedAt",
      "totalDistanceKm",
      "odometerStart",
      "odometerEndCalculated",
    ].includes(sortByRaw)
      ? (sortByRaw as ShiftsExportSortBy)
      : "shiftDate";

    const sortDir: "asc" | "desc" =
      req.query.sortDir === "asc" ? "asc" : "desc";

    const where = buildShiftExportWhere(req, scope, departmentId);

    const shifts = await prisma.shift.findMany({
      where,
      take: 10000,
      orderBy: buildShiftExportOrderBy(sortBy, sortDir),
      include: {
        city: {
          select: {
            id: true,
            name: true,
          },
        },
        department: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        crew: {
          select: {
            id: true,
            name: true,
          },
        },
        vehicle: {
          select: {
            id: true,
            title: true,
            licensePlate: true,
          },
        },
        driverEmployee: {
          select: {
            id: true,
            fullName: true,
          },
        },
        seniorEmployee: {
          select: {
            id: true,
            fullName: true,
          },
        },
        trips: {
          where: {
            deletedAt: null,
          },
          orderBy: {
            departureTime: "asc",
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

    const workbook = new ExcelJS.Workbook();

    workbook.creator = "Guard Journal";
    workbook.created = new Date();

    const shiftsSheet = workbook.addWorksheet("Підсумки змін");
    const tripsSheet = workbook.addWorksheet("Поїздки змін");
    const eventsSheet = workbook.addWorksheet("Події поїздок");

    shiftsSheet.columns = [
      { header: "Місто", key: "city", width: 18 },
      { header: "Підрозділ", key: "department", width: 20 },
      { header: "Дата", key: "shiftDate", width: 14 },
      { header: "Час надсилання", key: "submittedAt", width: 18 },
      { header: "Наряд", key: "crew", width: 18 },
      { header: "Тип наряду", key: "crewDutyType", width: 16 },
      { header: "Транспорт", key: "crewTransportType", width: 14 },
      { header: "Години", key: "shiftDurationHours", width: 10 },
      { header: "Зміни", key: "shiftEquivalent", width: 10 },
      { header: "Авто", key: "vehicle", width: 24 },
      { header: "Держномер", key: "licensePlate", width: 16 },
      { header: "Водій", key: "driver", width: 28 },
      { header: "Старший", key: "senior", width: 28 },
      { header: "Зброя", key: "weapon", width: 20 },
      { header: "Спідометр початок", key: "odometerStart", width: 18 },
      { header: "Спідометр кінець", key: "odometerEnd", width: 18 },
      { header: "Пробіг", key: "distance", width: 14 },
      { header: "Поїздок", key: "totalTrips", width: 12 },
      { header: "Спрацювань усього", key: "totalAlarms", width: 16 },
      { header: "ОХ", key: "totalOh", width: 10 },
      { header: "Партнери", key: "totalPartner", width: 12 },
      { header: "Бойові", key: "combatTotal", width: 12 },
      { header: "Хибні", key: "falseTotal", width: 12 },
      { header: "Дод. усього", key: "additionalTotal", width: 14 },
      { header: "Дод. ОХ", key: "additionalOh", width: 12 },
      { header: "Дод. Партнери", key: "additionalPartner", width: 16 },
      { header: "Затримано", key: "detained", width: 12 },
      { header: "Передано", key: "transferred", width: 12 },
    ];

    tripsSheet.columns = [
      { header: "ID зміни", key: "shiftId", width: 12 },
      { header: "Місто", key: "city", width: 18 },
      { header: "Дата", key: "shiftDate", width: 14 },
      { header: "Наряд", key: "crew", width: 18 },
      { header: "Авто", key: "vehicle", width: 24 },
      { header: "Водій", key: "driver", width: 28 },
      { header: "Старший", key: "senior", width: 28 },
      { header: "Звідки", key: "fromLocation", width: 28 },
      { header: "Час виїзду", key: "departureTime", width: 18 },
      { header: "Куди", key: "toLocation", width: 28 },
      { header: "Час прибуття", key: "arrivalTime", width: 18 },
      { header: "Прибуття, хв", key: "arrivalMinutes", width: 16 },
      { header: "Відстань, км", key: "distanceKm", width: 16 },
      { header: "Ціль поїздки", key: "goal", width: 24 },
      { header: "Спрацювання", key: "eventSummary", width: 40 },
      { header: "Затримано", key: "detained", width: 12 },
      { header: "Передано", key: "transferred", width: 12 },
      { header: "Примітка", key: "note", width: 30 },
    ];

    eventsSheet.columns = [
      { header: "ID зміни", key: "shiftId", width: 12 },
      { header: "ID поїздки", key: "tripId", width: 12 },
      { header: "Місто", key: "city", width: 18 },
      { header: "Дата", key: "shiftDate", width: 14 },
      { header: "Наряд", key: "crew", width: 18 },
      { header: "Маршрут", key: "route", width: 42 },
      { header: "Подія", key: "title", width: 28 },
      { header: "Категорія", key: "eventCategory", width: 22 },
      { header: "ОХ", key: "ohCount", width: 10 },
      { header: "Партнери", key: "partnerCount", width: 12 },
      { header: "Усього", key: "countTotal", width: 10 },
      { header: "Бойова?", key: "combatLabel", width: 14 },
      { header: "Причина", key: "reasonName", width: 26 },
      { header: "Затримано", key: "detained", width: 12 },
      { header: "Передано", key: "transferred", width: 12 },
      { header: "Примітка", key: "note", width: 30 },
    ];

    for (const shift of shifts) {
      const shiftSummary = calculateShiftSummary(shift);

      shiftsSheet.addRow({
        city: shift.city.name,
        department: shift.department?.name ?? "—",
        shiftDate: shift.shiftDate,
        submittedAt: shift.submittedAt,
        crew: shift.crew.name,
        crewDutyType: getDutyTypeExportLabel(shift.crewDutyType),
        crewTransportType: getTransportTypeExportLabel(shift.crewTransportType),
        shiftDurationHours: Number(shift.shiftDurationHours ?? 24),
        shiftEquivalent: shiftSummary.shiftEquivalent,
        vehicle: shift.vehicle.title,
        licensePlate: shift.vehicle.licensePlate ?? "",
        driver: shift.driverEmployee.fullName,
        senior: shift.seniorEmployee.fullName,
        weapon: getWeaponExportLabel({
          driverHasWeapon: shift.driverHasWeapon,
          seniorHasWeapon: shift.seniorHasWeapon,
        }),
        odometerStart: shift.odometerStart,
        odometerEnd: shift.odometerEndCalculated,
        distance: Number(shift.totalDistanceKm),
        totalTrips: shiftSummary.totalTrips,
        totalAlarms: shiftSummary.totalAlarms,
        totalOh: shiftSummary.totalOh,
        totalPartner: shiftSummary.totalPartner,
        combatTotal: shiftSummary.combatTotal,
        falseTotal: shiftSummary.falseTotal,
        additionalTotal: shiftSummary.additionalTotal,
        additionalOh: shiftSummary.additionalOh,
        additionalPartner: shiftSummary.additionalPartner,
        detained: shiftSummary.detained,
        transferred: shiftSummary.transferred,
      });

      for (const trip of shift.trips) {
        const tripTotals = calculateTripExportTotals(trip.events);

        tripsSheet.addRow({
          shiftId: shift.id,
          city: shift.city.name,
          shiftDate: shift.shiftDate,
          crew: shift.crew.name,
          vehicle: shift.vehicle.title,
          driver: shift.driverEmployee.fullName,
          senior: shift.seniorEmployee.fullName,
          fromLocation: trip.fromLocation,
          departureTime: trip.departureTime,
          toLocation: trip.toLocation,
          arrivalTime: trip.arrivalTime,
          arrivalMinutes: trip.arrivalMinutes,
          distanceKm: Number(trip.distanceKm),
          goal: trip.goal.name,
          eventSummary: buildTripExportEventSummary(trip.events),
          detained: tripTotals.detained,
          transferred: tripTotals.transferred,
          note: trip.note ?? "",
        });

        for (const event of trip.events) {
          const isRegular = event.eventCategory === "REGULAR_ALARM";

          const ohCount = isRegular
            ? event.alarmSource === "OH"
              ? 1
              : 0
            : (event.ohCount ?? 0);

          const partnerCount = isRegular
            ? event.alarmSource === "PARTNER"
              ? 1
              : 0
            : (event.partnerCount ?? 0);

          eventsSheet.addRow({
            shiftId: shift.id,
            tripId: trip.id,
            city: shift.city.name,
            shiftDate: shift.shiftDate,
            crew: shift.crew.name,
            route: `${trip.fromLocation} → ${trip.toLocation}`,
            title: isRegular
              ? event.alarmSource === "OH"
                ? "Спрацювання ОХ"
                : "Спрацювання Партнери"
              : "Додаткові спрацювання",
            eventCategory: event.eventCategory,
            ohCount,
            partnerCount,
            countTotal: isRegular ? 1 : ohCount + partnerCount,
            combatLabel: isRegular
              ? event.isCombat
                ? "Бойова"
                : "Хибна"
              : "",
            reasonName: event.reason?.name ?? event.customReasonText ?? "",
            detained: event.detainedCount ?? 0,
            transferred: event.transferredCount ?? 0,
            note: event.note ?? "",
          });
        }
      }
    }

    [shiftsSheet, tripsSheet, eventsSheet].forEach(styleSheet);

    shiftsSheet.getColumn("shiftDate").numFmt = "dd.mm.yyyy";
    shiftsSheet.getColumn("submittedAt").numFmt = "hh:mm";

    tripsSheet.getColumn("shiftDate").numFmt = "dd.mm.yyyy";
    tripsSheet.getColumn("departureTime").numFmt = "hh:mm";
    tripsSheet.getColumn("arrivalTime").numFmt = "hh:mm";

    eventsSheet.getColumn("shiftDate").numFmt = "dd.mm.yyyy";

    const fileName = `shifts-report-${Date.now()}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("exportShiftsTableExcel error:", error);

    return res.status(500).json({
      message: "Внутрішня помилка сервера",
    });
  }
}

type EmployeesExportSortBy =
  | "fullName"
  | "totalShifts"
  | "driverShifts"
  | "seniorShifts"
  | "weaponShifts"
  | "totalAlarms"
  | "averageAlarmsPerShift"
  | "totalDistanceKm"
  | "detained"
  | "transferred";

type EmployeeExportRow = {
  employeeId: number;
  fullName: string;
  cityId: number;
  cityName: string;

  totalShifts: number;
  driverShifts: number;
  seniorShifts: number;
  weaponShifts: number;

  postDutyShiftEquivalent: number;
  postDutyHours: number;
  postDutyCount: number;

  postDutyByPost: Record<
    string,
    {
      shiftEquivalent: number;
      hours: number;
      count: number;
    }
  >;

  totalTrips: number;
  totalDistanceKm: number;

  totalAlarms: number;
  totalOh: number;
  totalPartner: number;

  combatTotal: number;
  falseTotal: number;

  additionalTotal: number;
  additionalOh: number;
  additionalPartner: number;

  detained: number;
  transferred: number;

  averageAlarmsPerShift: number;

  additionalByReason: Record<
    string,
    {
      total: number;
      oh: number;
      partner: number;
    }
  >;
};

function buildEmployeesExportWhere(
  req: Request,
  scope: ExportScope,
  departmentId?: number,
) {
  const cityId = parseNumberExportQuery(req.query.cityId);
  const crewId = parseNumberExportQuery(req.query.crewId);
  const vehicleId = parseNumberExportQuery(req.query.vehicleId);
  const employeeId = parseNumberExportQuery(req.query.employeeId);

  const dateFrom = parseDate(req.query.dateFrom);
  const dateTo = parseDate(req.query.dateTo);

  const search = req.query.search ? String(req.query.search).trim() : "";

  const where: any = {
    deletedAt: null,
    ...buildExportAccessWhere(scope),
    ...(departmentId ? { departmentId } : {}),
    ...(cityId ? { cityId } : {}),
    ...(crewId ? { crewId } : {}),
    ...(vehicleId ? { vehicleId } : {}),
    ...(employeeId
      ? {
          OR: [
            { driverEmployeeId: employeeId },
            { seniorEmployeeId: employeeId },
          ],
        }
      : {}),
    ...(dateFrom || dateTo
      ? {
          shiftDate: {
            ...(dateFrom ? { gte: dateFrom } : {}),
            ...(dateTo ? { lte: dateTo } : {}),
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            {
              driverEmployee: {
                fullName: {
                  contains: search,
                },
              },
            },
            {
              seniorEmployee: {
                fullName: {
                  contains: search,
                },
              },
            },
            {
              city: {
                name: {
                  contains: search,
                },
              },
            },
            {
              crew: {
                name: {
                  contains: search,
                },
              },
            },
            {
              vehicle: {
                title: {
                  contains: search,
                },
              },
            },
            {
              vehicle: {
                licensePlate: {
                  contains: search,
                },
              },
            },
          ],
        }
      : {}),
  };

  return {
    where,
    employeeId,
  };
}

function createEmployeeExportRow(params: {
  employeeId: number;
  fullName: string;
  cityId: number;
  cityName: string;
}): EmployeeExportRow {
  return {
    employeeId: params.employeeId,
    fullName: params.fullName,
    cityId: params.cityId,
    cityName: params.cityName,

    totalShifts: 0,
    driverShifts: 0,
    seniorShifts: 0,
    weaponShifts: 0,

    postDutyShiftEquivalent: 0,
    postDutyHours: 0,
    postDutyCount: 0,
    postDutyByPost: {},

    totalTrips: 0,
    totalDistanceKm: 0,

    totalAlarms: 0,
    totalOh: 0,
    totalPartner: 0,

    combatTotal: 0,
    falseTotal: 0,

    additionalTotal: 0,
    additionalOh: 0,
    additionalPartner: 0,

    detained: 0,
    transferred: 0,

    averageAlarmsPerShift: 0,

    additionalByReason: {},
  };
}

function addShiftSummaryToEmployeeExportRow(
  row: EmployeeExportRow,
  summary: ReturnType<typeof calculateShiftSummary>,
) {
  row.totalTrips += summary.totalTrips;
  row.totalDistanceKm += Number(summary.totalDistanceKm);

  row.totalAlarms += summary.totalAlarms;
  row.totalOh += summary.totalOh;
  row.totalPartner += summary.totalPartner;

  row.combatTotal += summary.combatTotal;
  row.falseTotal += summary.falseTotal;

  row.additionalTotal += summary.additionalTotal;
  row.additionalOh += summary.additionalOh;
  row.additionalPartner += summary.additionalPartner;

  row.detained += summary.detained;
  row.transferred += summary.transferred;

  for (const [reasonName, reasonStats] of Object.entries(
    summary.additionalByReason,
  )) {
    if (!row.additionalByReason[reasonName]) {
      row.additionalByReason[reasonName] = {
        total: 0,
        oh: 0,
        partner: 0,
      };
    }

    row.additionalByReason[reasonName].total += reasonStats.total;
    row.additionalByReason[reasonName].oh += reasonStats.oh;
    row.additionalByReason[reasonName].partner += reasonStats.partner;
  }
}
function addPostDutyToEmployeeExportRow(
  row: EmployeeExportRow,
  params: {
    postName: string;
    durationHours: number;
    hasWeapon: boolean;
    isDriver: boolean;
  },
) {
  const shiftEquivalent = params.durationHours / 24;

  row.totalShifts += shiftEquivalent;
  row.postDutyShiftEquivalent += shiftEquivalent;
  row.postDutyHours += params.durationHours;
  row.postDutyCount += 1;

  if (params.hasWeapon) {
    row.weaponShifts += shiftEquivalent;
  }

  if (params.isDriver) {
    row.driverShifts += shiftEquivalent;
  }

  if (!row.postDutyByPost[params.postName]) {
    row.postDutyByPost[params.postName] = {
      shiftEquivalent: 0,
      hours: 0,
      count: 0,
    };
  }

  row.postDutyByPost[params.postName].shiftEquivalent += shiftEquivalent;
  row.postDutyByPost[params.postName].hours += params.durationHours;
  row.postDutyByPost[params.postName].count += 1;
}

function buildPostDutyExportSummary(
  postDutyByPost: EmployeeExportRow["postDutyByPost"],
) {
  const rows = Object.entries(postDutyByPost);

  if (!rows.length) {
    return "";
  }

  return rows
    .map(([postName, stats]) => {
      return `${postName}: ${roundNumber(stats.shiftEquivalent)} змін / ${roundNumber(
        stats.hours,
      )} год / ${stats.count} виходів`;
    })
    .join("; ");
}
function sortEmployeeExportRows(
  rows: EmployeeExportRow[],
  sortBy: EmployeesExportSortBy,
  sortDir: "asc" | "desc",
) {
  return [...rows].sort((a, b) => {
    const direction = sortDir === "asc" ? 1 : -1;

    if (sortBy === "fullName") {
      return a.fullName.localeCompare(b.fullName) * direction;
    }

    return ((a[sortBy] as number) - (b[sortBy] as number)) * direction;
  });
}

export async function exportEmployeesTableExcel(req: Request, res: Response) {
  try {
    const scope = await getExportScope(req);
    const departmentId = parseNumberExportQuery(req.query.departmentId);
    const sortByRaw = String(req.query.sortBy ?? "totalAlarms");

    const sortBy: EmployeesExportSortBy = [
      "fullName",
      "totalShifts",
      "driverShifts",
      "seniorShifts",
      "weaponShifts",
      "totalAlarms",
      "averageAlarmsPerShift",
      "totalDistanceKm",
      "detained",
      "transferred",
    ].includes(sortByRaw)
      ? (sortByRaw as EmployeesExportSortBy)
      : "totalAlarms";

    const sortDir: "asc" | "desc" =
      req.query.sortDir === "asc" ? "asc" : "desc";

    const { where, employeeId } = buildEmployeesExportWhere(
      req,
      scope,
      departmentId,
    );
    const cityId = parseNumberExportQuery(req.query.cityId);
    const crewId = parseNumberExportQuery(req.query.crewId);
    const vehicleId = parseNumberExportQuery(req.query.vehicleId);

    const dateFrom = parseDate(req.query.dateFrom);
    const dateTo = parseDate(req.query.dateTo);

    const search = req.query.search ? String(req.query.search).trim() : "";

    const shifts = await prisma.shift.findMany({
      where,
      take: 10000,
      orderBy: {
        shiftDate: "desc",
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
        vehicle: {
          select: {
            id: true,
            title: true,
            licensePlate: true,
          },
        },
        driverEmployee: {
          select: {
            id: true,
            fullName: true,
          },
        },
        seniorEmployee: {
          select: {
            id: true,
            fullName: true,
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
    const postDuties = crewId
      ? []
      : await prisma.postDuty.findMany({
          where: {
            deletedAt: null,
            ...buildExportAccessWhere(scope),

            ...(cityId ? { cityId } : {}),
            ...(vehicleId ? { vehicleId } : {}),

            ...(employeeId
              ? {
                  members: {
                    some: {
                      employeeId,
                    },
                  },
                }
              : {}),

            ...(dateFrom || dateTo
              ? {
                  dutyDate: {
                    ...(dateFrom ? { gte: dateFrom } : {}),
                    ...(dateTo ? { lte: dateTo } : {}),
                  },
                }
              : {}),

            ...(search
              ? {
                  OR: [
                    {
                      note: {
                        contains: search,
                      },
                    },
                    {
                      city: {
                        name: {
                          contains: search,
                        },
                      },
                    },
                    {
                      post: {
                        name: {
                          contains: search,
                        },
                      },
                    },
                    {
                      vehicle: {
                        title: {
                          contains: search,
                        },
                      },
                    },
                    {
                      vehicle: {
                        licensePlate: {
                          contains: search,
                        },
                      },
                    },
                    {
                      members: {
                        some: {
                          employee: {
                            fullName: {
                              contains: search,
                            },
                          },
                        },
                      },
                    },
                  ],
                }
              : {}),
          },
          take: 10000,
          orderBy: {
            dutyDate: "desc",
          },
          include: {
            city: {
              select: {
                id: true,
                name: true,
              },
            },
            post: {
              select: {
                id: true,
                name: true,
              },
            },
            members: {
              include: {
                employee: {
                  select: {
                    id: true,
                    fullName: true,
                  },
                },
              },
            },
          },
        });
    const employeeMap = new Map<string, EmployeeExportRow>();

    for (const shift of shifts) {
      const summary = calculateShiftSummary(shift);

      const driver = shift.driverEmployee;
      const senior = shift.seniorEmployee;

      const driverKey = `${driver.id}_${shift.city.id}`;

      if (!employeeMap.has(driverKey)) {
        employeeMap.set(
          driverKey,
          createEmployeeExportRow({
            employeeId: driver.id,
            fullName: driver.fullName,
            cityId: shift.city.id,
            cityName: shift.city.name,
          }),
        );
      }

      const driverRow = employeeMap.get(driverKey)!;

      driverRow.totalShifts += summary.shiftEquivalent;
      driverRow.driverShifts += summary.shiftEquivalent;

      if (shift.driverHasWeapon) {
        driverRow.weaponShifts += summary.shiftEquivalent;
      }

      addShiftSummaryToEmployeeExportRow(driverRow, summary);

      const seniorKey = `${senior.id}_${shift.city.id}`;

      if (!employeeMap.has(seniorKey)) {
        employeeMap.set(
          seniorKey,
          createEmployeeExportRow({
            employeeId: senior.id,
            fullName: senior.fullName,
            cityId: shift.city.id,
            cityName: shift.city.name,
          }),
        );
      }

      const seniorRow = employeeMap.get(seniorKey)!;

      seniorRow.totalShifts += summary.shiftEquivalent;
      seniorRow.seniorShifts += summary.shiftEquivalent;

      if (shift.seniorHasWeapon) {
        seniorRow.weaponShifts += summary.shiftEquivalent;
      }

      addShiftSummaryToEmployeeExportRow(seniorRow, summary);
    }
    for (const duty of postDuties) {
      const durationHours = Number(duty.durationHours);

      for (const member of duty.members) {
        const employee = member.employee;
        const employeeKey = `${employee.id}_${duty.city.id}`;

        if (!employeeMap.has(employeeKey)) {
          employeeMap.set(
            employeeKey,
            createEmployeeExportRow({
              employeeId: employee.id,
              fullName: employee.fullName,
              cityId: duty.city.id,
              cityName: duty.city.name,
            }),
          );
        }

        const row = employeeMap.get(employeeKey)!;

        addPostDutyToEmployeeExportRow(row, {
          postName: duty.post.name,
          durationHours,
          hasWeapon: member.hasWeapon,
          isDriver: member.isDriver,
        });
      }
    }
    const rows = Array.from(employeeMap.values()).map((row) => {
      const roundedPostDutyByPost = Object.fromEntries(
        Object.entries(row.postDutyByPost).map(([postName, postStats]) => [
          postName,
          {
            shiftEquivalent: roundNumber(postStats.shiftEquivalent),
            hours: roundNumber(postStats.hours),
            count: postStats.count,
          },
        ]),
      );

      return {
        ...row,
        totalShifts: roundNumber(row.totalShifts),
        driverShifts: roundNumber(row.driverShifts),
        seniorShifts: roundNumber(row.seniorShifts),
        weaponShifts: roundNumber(row.weaponShifts),
        postDutyShiftEquivalent: roundNumber(row.postDutyShiftEquivalent),
        postDutyHours: roundNumber(row.postDutyHours),
        postDutyByPost: roundedPostDutyByPost,
        totalDistanceKm: roundNumber(row.totalDistanceKm),
        averageAlarmsPerShift:
          row.totalShifts > 0
            ? roundNumber(row.totalAlarms / row.totalShifts)
            : 0,
      };
    });
    const filteredRows = employeeId
      ? rows.filter((row) => row.employeeId === employeeId)
      : rows;

    const sortedRows = sortEmployeeExportRows(filteredRows, sortBy, sortDir);

    const workbook = new ExcelJS.Workbook();

    workbook.creator = "Guard Journal";
    workbook.created = new Date();

    const employeesSheet = workbook.addWorksheet("За співробітниками");
    const reasonsSheet = workbook.addWorksheet("Дод. спрацювання");
    const postsSheet = workbook.addWorksheet("Чергування на постах");

    employeesSheet.columns = [
      { header: "Місто", key: "cityName", width: 18 },
      { header: "ПІБ", key: "fullName", width: 32 },
      { header: "Усього змін", key: "totalShifts", width: 14 },
      { header: "Водієм", key: "driverShifts", width: 14 },
      { header: "Старшим", key: "seniorShifts", width: 14 },
      { header: "Зі зброєю", key: "weaponShifts", width: 14 },
      { header: "Додатково", key: "postDutyShiftEquivalent", width: 16 },
      { header: "Години на постах", key: "postDutyHours", width: 16 },
      { header: "Виходів на пости", key: "postDutyCount", width: 18 },
      { header: "Пости", key: "postDutySummary", width: 42 },
      { header: "Поїздок", key: "totalTrips", width: 12 },
      { header: "Пробіг", key: "totalDistanceKm", width: 14 },
      { header: "Усього спрацювань", key: "totalAlarms", width: 18 },
      { header: "Середнє навантаження", key: "averageAlarmsPerShift", width: 18 },
      { header: "ОХ", key: "totalOh", width: 10 },
      { header: "Партнери", key: "totalPartner", width: 12 },
      { header: "Бойові", key: "combatTotal", width: 12 },
      { header: "Хибні", key: "falseTotal", width: 12 },
      { header: "Дод. усього", key: "additionalTotal", width: 14 },
      { header: "Дод. ОХ", key: "additionalOh", width: 12 },
      { header: "Дод. Партнери", key: "additionalPartner", width: 16 },
      { header: "Затримано", key: "detained", width: 12 },
      { header: "Передано", key: "transferred", width: 12 },
    ];

    reasonsSheet.columns = [
      { header: "Місто", key: "cityName", width: 18 },
      { header: "ПІБ", key: "fullName", width: 32 },
      { header: "Причина", key: "reasonName", width: 28 },
      { header: "Усього", key: "total", width: 12 },
      { header: "ОХ", key: "oh", width: 12 },
      { header: "Партнери", key: "partner", width: 12 },
    ];

    postsSheet.columns = [
      { header: "Місто", key: "cityName", width: 18 },
      { header: "ПІБ", key: "fullName", width: 32 },
      { header: "Пост", key: "postName", width: 28 },
      { header: "Змін", key: "shiftEquivalent", width: 12 },
      { header: "Години", key: "hours", width: 12 },
      { header: "Виходів", key: "count", width: 12 },
    ];

    for (const row of sortedRows) {
      employeesSheet.addRow({
        cityName: row.cityName,
        fullName: row.fullName,
        totalShifts: row.totalShifts,
        driverShifts: row.driverShifts,
        seniorShifts: row.seniorShifts,
        weaponShifts: row.weaponShifts,
        postDutyShiftEquivalent: row.postDutyShiftEquivalent,
        postDutyHours: row.postDutyHours,
        postDutyCount: row.postDutyCount,
        postDutySummary: buildPostDutyExportSummary(row.postDutyByPost),
        totalTrips: row.totalTrips,
        totalDistanceKm: row.totalDistanceKm,
        totalAlarms: row.totalAlarms,
        averageAlarmsPerShift: row.averageAlarmsPerShift,
        totalOh: row.totalOh,
        totalPartner: row.totalPartner,
        combatTotal: row.combatTotal,
        falseTotal: row.falseTotal,
        additionalTotal: row.additionalTotal,
        additionalOh: row.additionalOh,
        additionalPartner: row.additionalPartner,
        detained: row.detained,
        transferred: row.transferred,
      });

      reasonsSheet.addRow({
        cityName: row.cityName,
        fullName: row.fullName,
        reasonName: "Додатково",
        total: row.additionalTotal,
        oh: row.additionalOh,
        partner: row.additionalPartner,
      });

      for (const [reasonName, stats] of Object.entries(
        row.additionalByReason,
      )) {
        reasonsSheet.addRow({
          cityName: row.cityName,
          fullName: row.fullName,
          reasonName,
          total: stats.total,
          oh: stats.oh,
          partner: stats.partner,
        });
      }
      postsSheet.addRow({
        cityName: row.cityName,
        fullName: row.fullName,
        postName: "Додатково",
        shiftEquivalent: row.postDutyShiftEquivalent,
        hours: row.postDutyHours,
        count: row.postDutyCount,
      });

      for (const [postName, stats] of Object.entries(row.postDutyByPost)) {
        postsSheet.addRow({
          cityName: row.cityName,
          fullName: row.fullName,
          postName,
          shiftEquivalent: stats.shiftEquivalent,
          hours: stats.hours,
          count: stats.count,
        });
      }
    }

    [employeesSheet, reasonsSheet, postsSheet].forEach(styleSheet);

    const fileName = `employees-report-${Date.now()}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("exportEmployeesTableExcel error:", error);

    return res.status(500).json({
      message: "Внутрішня помилка сервера",
    });
  }
}

type CrewsExportSortBy =
  | "crewName"
  | "totalShifts"
  | "totalTrips"
  | "totalAlarms"
  | "averageAlarmsPerShift"
  | "averageDistancePerShift"
  | "totalDistanceKm"
  | "detained"
  | "transferred";

type CrewExportRow = {
  crewId: number;
  crewName: string;
  cityId: number;
  cityName: string;

  totalShifts: number;
  totalTrips: number;
  totalDistanceKm: number;

  totalAlarms: number;
  totalOh: number;
  totalPartner: number;

  combatTotal: number;
  falseTotal: number;

  additionalTotal: number;
  additionalOh: number;
  additionalPartner: number;

  detained: number;
  transferred: number;

  averageAlarmsPerShift: number;
  averageDistancePerShift: number;

  additionalByReason: Record<
    string,
    {
      total: number;
      oh: number;
      partner: number;
    }
  >;

  distanceByGoal: Record<string, number>;
};

function buildCrewsExportWhere(
  req: Request,
  scope: ExportScope,
  departmentId?: number,
) {
  const cityId = parseNumberExportQuery(req.query.cityId);
  const crewId = parseNumberExportQuery(req.query.crewId);
  const vehicleId = parseNumberExportQuery(req.query.vehicleId);
  const employeeId = parseNumberExportQuery(req.query.employeeId);

  const dateFrom = parseDate(req.query.dateFrom);
  const dateTo = parseDate(req.query.dateTo);

  const search = req.query.search ? String(req.query.search).trim() : "";

  const where: any = {
    deletedAt: null,
    ...buildExportAccessWhere(scope),
    ...(departmentId ? { departmentId } : {}),
    ...(cityId ? { cityId } : {}),
    ...(crewId ? { crewId } : {}),
    ...(vehicleId ? { vehicleId } : {}),
    ...(employeeId
      ? {
          OR: [
            { driverEmployeeId: employeeId },
            { seniorEmployeeId: employeeId },
          ],
        }
      : {}),
    ...(dateFrom || dateTo
      ? {
          shiftDate: {
            ...(dateFrom ? { gte: dateFrom } : {}),
            ...(dateTo ? { lte: dateTo } : {}),
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            {
              city: {
                name: {
                  contains: search,
                },
              },
            },
            {
              crew: {
                name: {
                  contains: search,
                },
              },
            },
            {
              vehicle: {
                title: {
                  contains: search,
                },
              },
            },
            {
              vehicle: {
                licensePlate: {
                  contains: search,
                },
              },
            },
            {
              driverEmployee: {
                fullName: {
                  contains: search,
                },
              },
            },
            {
              seniorEmployee: {
                fullName: {
                  contains: search,
                },
              },
            },
          ],
        }
      : {}),
  };

  return where;
}

function createCrewExportRow(params: {
  crewId: number;
  crewName: string;
  cityId: number;
  cityName: string;
}): CrewExportRow {
  return {
    crewId: params.crewId,
    crewName: params.crewName,
    cityId: params.cityId,
    cityName: params.cityName,

    totalShifts: 0,
    totalTrips: 0,
    totalDistanceKm: 0,

    totalAlarms: 0,
    totalOh: 0,
    totalPartner: 0,

    combatTotal: 0,
    falseTotal: 0,

    additionalTotal: 0,
    additionalOh: 0,
    additionalPartner: 0,

    detained: 0,
    transferred: 0,

    averageAlarmsPerShift: 0,
    averageDistancePerShift: 0,

    additionalByReason: {},
    distanceByGoal: {},
  };
}

function addShiftSummaryToCrewExportRow(
  row: CrewExportRow,
  summary: ReturnType<typeof calculateShiftSummary>,
) {
  row.totalShifts += summary.shiftEquivalent;
  row.totalTrips += summary.totalTrips;
  row.totalDistanceKm += Number(summary.totalDistanceKm);

  row.totalAlarms += summary.totalAlarms;
  row.totalOh += summary.totalOh;
  row.totalPartner += summary.totalPartner;

  row.combatTotal += summary.combatTotal;
  row.falseTotal += summary.falseTotal;

  row.additionalTotal += summary.additionalTotal;
  row.additionalOh += summary.additionalOh;
  row.additionalPartner += summary.additionalPartner;

  row.detained += summary.detained;
  row.transferred += summary.transferred;

  for (const [reasonName, reasonStats] of Object.entries(
    summary.additionalByReason,
  )) {
    if (!row.additionalByReason[reasonName]) {
      row.additionalByReason[reasonName] = {
        total: 0,
        oh: 0,
        partner: 0,
      };
    }

    row.additionalByReason[reasonName].total += reasonStats.total;
    row.additionalByReason[reasonName].oh += reasonStats.oh;
    row.additionalByReason[reasonName].partner += reasonStats.partner;
  }

  for (const [goalName, distance] of Object.entries(summary.distanceByGoal)) {
    row.distanceByGoal[goalName] =
      (row.distanceByGoal[goalName] ?? 0) + Number(distance);
  }
}

function sortCrewExportRows(
  rows: CrewExportRow[],
  sortBy: CrewsExportSortBy,
  sortDir: "asc" | "desc",
) {
  return [...rows].sort((a, b) => {
    const direction = sortDir === "asc" ? 1 : -1;

    if (sortBy === "crewName") {
      return a.crewName.localeCompare(b.crewName) * direction;
    }

    return ((a[sortBy] as number) - (b[sortBy] as number)) * direction;
  });
}

export async function exportCrewsTableExcel(req: Request, res: Response) {
  try {
    const scope = await getExportScope(req);
    const departmentId = parseNumberExportQuery(req.query.departmentId);
    const sortByRaw = String(req.query.sortBy ?? "totalAlarms");

    const sortBy: CrewsExportSortBy = [
      "crewName",
      "totalShifts",
      "totalTrips",
      "totalAlarms",
      "averageAlarmsPerShift",
      "averageDistancePerShift",
      "totalDistanceKm",
      "detained",
      "transferred",
    ].includes(sortByRaw)
      ? (sortByRaw as CrewsExportSortBy)
      : "totalAlarms";

    const sortDir: "asc" | "desc" =
      req.query.sortDir === "asc" ? "asc" : "desc";

    const where = buildCrewsExportWhere(req, scope, departmentId);

    const shifts = await prisma.shift.findMany({
      where,
      take: 10000,
      orderBy: {
        shiftDate: "desc",
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
        vehicle: {
          select: {
            id: true,
            title: true,
            licensePlate: true,
          },
        },
        driverEmployee: {
          select: {
            id: true,
            fullName: true,
          },
        },
        seniorEmployee: {
          select: {
            id: true,
            fullName: true,
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

    const crewMap = new Map<string, CrewExportRow>();

    for (const shift of shifts) {
      const summary = calculateShiftSummary(shift);
      const crew = shift.crew;
      const crewKey = `${crew.id}_${shift.city.id}`;

      if (!crewMap.has(crewKey)) {
        crewMap.set(
          crewKey,
          createCrewExportRow({
            crewId: crew.id,
            crewName: crew.name,
            cityId: shift.city.id,
            cityName: shift.city.name,
          }),
        );
      }

      const row = crewMap.get(crewKey)!;
      addShiftSummaryToCrewExportRow(row, summary);
    }

    const rows = Array.from(crewMap.values()).map((row) => ({
      ...row,
      totalDistanceKm: roundNumber(row.totalDistanceKm),
      averageAlarmsPerShift:
        row.totalShifts > 0
          ? roundNumber(row.totalAlarms / row.totalShifts)
          : 0,
      averageDistancePerShift:
        row.totalShifts > 0
          ? roundNumber(row.totalDistanceKm / row.totalShifts)
          : 0,
    }));

    const sortedRows = sortCrewExportRows(rows, sortBy, sortDir);

    const workbook = new ExcelJS.Workbook();

    workbook.creator = "Guard Journal";
    workbook.created = new Date();

    const crewsSheet = workbook.addWorksheet("За нарядами");
    const reasonsSheet = workbook.addWorksheet("Дод. спрацювання");
    const distanceSheet = workbook.addWorksheet("Пробіг за цілями");

    crewsSheet.columns = [
      { header: "Місто", key: "cityName", width: 18 },
      { header: "Наряд", key: "crewName", width: 24 },
      { header: "Усього змін", key: "totalShifts", width: 14 },
      { header: "Поїздок", key: "totalTrips", width: 12 },
      { header: "Пробіг", key: "totalDistanceKm", width: 14 },
      { header: "Середній пробіг", key: "averageDistancePerShift", width: 18 },
      { header: "Усього спрацювань", key: "totalAlarms", width: 18 },
      { header: "Середнє навантаження", key: "averageAlarmsPerShift", width: 18 },
      { header: "ОХ", key: "totalOh", width: 10 },
      { header: "Партнери", key: "totalPartner", width: 12 },
      { header: "Бойові", key: "combatTotal", width: 12 },
      { header: "Хибні", key: "falseTotal", width: 12 },
      { header: "Дод. усього", key: "additionalTotal", width: 14 },
      { header: "Дод. ОХ", key: "additionalOh", width: 12 },
      { header: "Дод. Партнери", key: "additionalPartner", width: 16 },
      { header: "Затримано", key: "detained", width: 12 },
      { header: "Передано", key: "transferred", width: 12 },
    ];

    reasonsSheet.columns = [
      { header: "Місто", key: "cityName", width: 18 },
      { header: "Наряд", key: "crewName", width: 24 },
      { header: "Причина", key: "reasonName", width: 28 },
      { header: "Усього", key: "total", width: 12 },
      { header: "ОХ", key: "oh", width: 12 },
      { header: "Партнери", key: "partner", width: 12 },
    ];

    distanceSheet.columns = [
      { header: "Місто", key: "cityName", width: 18 },
      { header: "Наряд", key: "crewName", width: 24 },
      { header: "Ціль поїздки", key: "goalName", width: 30 },
      { header: "Пробіг", key: "distance", width: 14 },
    ];

    for (const row of sortedRows) {
      crewsSheet.addRow({
        cityName: row.cityName,
        crewName: row.crewName,
        totalShifts: row.totalShifts,
        totalTrips: row.totalTrips,
        totalDistanceKm: row.totalDistanceKm,
        averageDistancePerShift: row.averageDistancePerShift,
        totalAlarms: row.totalAlarms,
        averageAlarmsPerShift: row.averageAlarmsPerShift,
        totalOh: row.totalOh,
        totalPartner: row.totalPartner,
        combatTotal: row.combatTotal,
        falseTotal: row.falseTotal,
        additionalTotal: row.additionalTotal,
        additionalOh: row.additionalOh,
        additionalPartner: row.additionalPartner,
        detained: row.detained,
        transferred: row.transferred,
      });

      reasonsSheet.addRow({
        cityName: row.cityName,
        crewName: row.crewName,
        reasonName: "Додатково",
        total: row.additionalTotal,
        oh: row.additionalOh,
        partner: row.additionalPartner,
      });

      for (const [reasonName, stats] of Object.entries(
        row.additionalByReason,
      )) {
        reasonsSheet.addRow({
          cityName: row.cityName,
          crewName: row.crewName,
          reasonName,
          total: stats.total,
          oh: stats.oh,
          partner: stats.partner,
        });
      }

      for (const [goalName, distance] of Object.entries(row.distanceByGoal)) {
        distanceSheet.addRow({
          cityName: row.cityName,
          crewName: row.crewName,
          goalName,
          distance: roundNumber(Number(distance)),
        });
      }
    }

    [crewsSheet, reasonsSheet, distanceSheet].forEach(styleSheet);

    const fileName = `crews-report-${Date.now()}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("exportCrewsTableExcel error:", error);

    return res.status(500).json({
      message: "Внутрішня помилка сервера",
    });
  }
}

type VehiclesExportSortBy =
  | "vehicleTitle"
  | "totalShifts"
  | "totalTrips"
  | "totalAlarms"
  | "averageDistancePerShift"
  | "totalDistanceKm"
  | "detained"
  | "transferred";

type VehicleExportRow = {
  vehicleId: number;
  vehicleTitle: string;
  licensePlate: string | null;
  cityId: number;
  cityName: string;

  totalShifts: number;
  totalTrips: number;
  totalDistanceKm: number;
  averageDistancePerShift: number;

  odometerStartFirstShift: number | null;
  odometerEndLastShift: number | null;
  firstShiftDate: Date | null;
  lastShiftDate: Date | null;

  totalAlarms: number;
  totalOh: number;
  totalPartner: number;

  combatTotal: number;
  falseTotal: number;

  additionalTotal: number;
  additionalOh: number;
  additionalPartner: number;

  detained: number;
  transferred: number;

  additionalByReason: Record<
    string,
    {
      total: number;
      oh: number;
      partner: number;
    }
  >;

  distanceByGoal: Record<string, number>;
};

function buildVehiclesExportWhere(
  req: Request,
  scope: ExportScope,
  departmentId?: number,
) {
  const cityId = parseNumberExportQuery(req.query.cityId);
  const crewId = parseNumberExportQuery(req.query.crewId);
  const vehicleId = parseNumberExportQuery(req.query.vehicleId);
  const employeeId = parseNumberExportQuery(req.query.employeeId);

  const dateFrom = parseDate(req.query.dateFrom);
  const dateTo = parseDate(req.query.dateTo);

  const search = req.query.search ? String(req.query.search).trim() : "";

  const shiftsWhere: any = {
    deletedAt: null,
    ...buildExportAccessWhere(scope),
    ...(departmentId ? { departmentId } : {}),
    ...(cityId ? { cityId } : {}),
    ...(crewId ? { crewId } : {}),
    ...(vehicleId ? { vehicleId } : {}),
    ...(employeeId
      ? {
          OR: [
            { driverEmployeeId: employeeId },
            { seniorEmployeeId: employeeId },
          ],
        }
      : {}),
    ...(dateFrom || dateTo
      ? {
          shiftDate: {
            ...(dateFrom ? { gte: dateFrom } : {}),
            ...(dateTo ? { lte: dateTo } : {}),
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            {
              city: {
                name: {
                  contains: search,
                },
              },
            },
            {
              crew: {
                name: {
                  contains: search,
                },
              },
            },
            {
              vehicle: {
                title: {
                  contains: search,
                },
              },
            },
            {
              vehicle: {
                licensePlate: {
                  contains: search,
                },
              },
            },
            {
              driverEmployee: {
                fullName: {
                  contains: search,
                },
              },
            },
            {
              seniorEmployee: {
                fullName: {
                  contains: search,
                },
              },
            },
          ],
        }
      : {}),
  };

  const vehiclesWhere: any = {
    deletedAt: null,
    isActive: true,
    ...buildExportAccessWhere(scope),
    ...(cityId ? { cityId } : {}),
    ...(vehicleId ? { id: vehicleId } : {}),
    ...(search
      ? {
          OR: [
            {
              title: {
                contains: search,
              },
            },
            {
              licensePlate: {
                contains: search,
              },
            },
            {
              city: {
                name: {
                  contains: search,
                },
              },
            },
          ],
        }
      : {}),
  };

  return {
    shiftsWhere,
    vehiclesWhere,
    cityId,
    crewId,
    vehicleId,
    employeeId,
  };
}

function createVehicleExportRow(params: {
  vehicleId: number;
  vehicleTitle: string;
  licensePlate: string | null;
  cityId: number;
  cityName: string;
}): VehicleExportRow {
  return {
    vehicleId: params.vehicleId,
    vehicleTitle: params.vehicleTitle,
    licensePlate: params.licensePlate,
    cityId: params.cityId,
    cityName: params.cityName,

    totalShifts: 0,
    totalTrips: 0,
    totalDistanceKm: 0,
    averageDistancePerShift: 0,

    odometerStartFirstShift: null,
    odometerEndLastShift: null,
    firstShiftDate: null,
    lastShiftDate: null,

    totalAlarms: 0,
    totalOh: 0,
    totalPartner: 0,

    combatTotal: 0,
    falseTotal: 0,

    additionalTotal: 0,
    additionalOh: 0,
    additionalPartner: 0,

    detained: 0,
    transferred: 0,

    additionalByReason: {},
    distanceByGoal: {},
  };
}

function addShiftSummaryToVehicleExportRow(
  row: VehicleExportRow,
  shift: any,
  summary: ReturnType<typeof calculateShiftSummary>,
) {
  row.totalShifts += summary.shiftEquivalent;
  row.totalTrips += summary.totalTrips;
  row.totalDistanceKm += Number(summary.totalDistanceKm);

  if (!row.firstShiftDate || shift.shiftDate < row.firstShiftDate) {
    row.firstShiftDate = shift.shiftDate;
    row.odometerStartFirstShift = shift.odometerStart;
  }

  if (!row.lastShiftDate || shift.shiftDate > row.lastShiftDate) {
    row.lastShiftDate = shift.shiftDate;
    row.odometerEndLastShift = shift.odometerEndCalculated;
  }

  row.totalAlarms += summary.totalAlarms;
  row.totalOh += summary.totalOh;
  row.totalPartner += summary.totalPartner;

  row.combatTotal += summary.combatTotal;
  row.falseTotal += summary.falseTotal;

  row.additionalTotal += summary.additionalTotal;
  row.additionalOh += summary.additionalOh;
  row.additionalPartner += summary.additionalPartner;

  row.detained += summary.detained;
  row.transferred += summary.transferred;

  for (const [reasonName, reasonStats] of Object.entries(
    summary.additionalByReason,
  )) {
    if (!row.additionalByReason[reasonName]) {
      row.additionalByReason[reasonName] = {
        total: 0,
        oh: 0,
        partner: 0,
      };
    }

    row.additionalByReason[reasonName].total += reasonStats.total;
    row.additionalByReason[reasonName].oh += reasonStats.oh;
    row.additionalByReason[reasonName].partner += reasonStats.partner;
  }

  for (const [goalName, distance] of Object.entries(summary.distanceByGoal)) {
    row.distanceByGoal[goalName] =
      (row.distanceByGoal[goalName] ?? 0) + Number(distance);
  }
}

function sortVehicleExportRows(
  rows: VehicleExportRow[],
  sortBy: VehiclesExportSortBy,
  sortDir: "asc" | "desc",
) {
  return [...rows].sort((a, b) => {
    const direction = sortDir === "asc" ? 1 : -1;

    if (sortBy === "vehicleTitle") {
      return a.vehicleTitle.localeCompare(b.vehicleTitle) * direction;
    }

    return ((a[sortBy] as number) - (b[sortBy] as number)) * direction;
  });
}

export async function exportVehiclesTableExcel(req: Request, res: Response) {
  try {
    const scope = await getExportScope(req);
    const departmentId = parseNumberExportQuery(req.query.departmentId);
    const sortByRaw = String(req.query.sortBy ?? "totalDistanceKm");

    const sortBy: VehiclesExportSortBy = [
      "vehicleTitle",
      "totalShifts",
      "totalTrips",
      "totalAlarms",
      "averageDistancePerShift",
      "totalDistanceKm",
      "detained",
      "transferred",
    ].includes(sortByRaw)
      ? (sortByRaw as VehiclesExportSortBy)
      : "totalDistanceKm";

    const sortDir: "asc" | "desc" =
      req.query.sortDir === "asc" ? "asc" : "desc";

    const { shiftsWhere, vehiclesWhere, crewId, employeeId } =
      buildVehiclesExportWhere(req, scope, departmentId);

    const shouldShowEmptyVehicles = !crewId && !employeeId;

    const vehiclesFromDirectory = shouldShowEmptyVehicles
      ? await prisma.vehicle.findMany({
          where: vehiclesWhere,
          orderBy: {
            title: "asc",
          },
          include: {
            city: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        })
      : [];

    const shifts = await prisma.shift.findMany({
      where: shiftsWhere,
      take: 10000,
      orderBy: {
        shiftDate: "desc",
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
        vehicle: {
          select: {
            id: true,
            title: true,
            licensePlate: true,
          },
        },
        driverEmployee: {
          select: {
            id: true,
            fullName: true,
          },
        },
        seniorEmployee: {
          select: {
            id: true,
            fullName: true,
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

    const vehicleMap = new Map<string, VehicleExportRow>();

    for (const vehicle of vehiclesFromDirectory) {
      const vehicleKey = `${vehicle.id}_${vehicle.city.id}`;

      vehicleMap.set(
        vehicleKey,
        createVehicleExportRow({
          vehicleId: vehicle.id,
          vehicleTitle: vehicle.title,
          licensePlate: vehicle.licensePlate,
          cityId: vehicle.city.id,
          cityName: vehicle.city.name,
        }),
      );
    }

    for (const shift of shifts) {
      const summary = calculateShiftSummary(shift);
      const vehicle = shift.vehicle;
      const vehicleKey = `${vehicle.id}_${shift.city.id}`;

      if (!vehicleMap.has(vehicleKey)) {
        vehicleMap.set(
          vehicleKey,
          createVehicleExportRow({
            vehicleId: vehicle.id,
            vehicleTitle: vehicle.title,
            licensePlate: vehicle.licensePlate,
            cityId: shift.city.id,
            cityName: shift.city.name,
          }),
        );
      }

      const row = vehicleMap.get(vehicleKey)!;
      addShiftSummaryToVehicleExportRow(row, shift, summary);
    }

    const rows = Array.from(vehicleMap.values()).map((row) => ({
      ...row,
      totalDistanceKm: roundNumber(row.totalDistanceKm),
      averageDistancePerShift:
        row.totalShifts > 0
          ? roundNumber(row.totalDistanceKm / row.totalShifts)
          : 0,
    }));

    const sortedRows = sortVehicleExportRows(rows, sortBy, sortDir);

    const workbook = new ExcelJS.Workbook();

    workbook.creator = "Guard Journal";
    workbook.created = new Date();

    const vehiclesSheet = workbook.addWorksheet("За автомобілями");
    const reasonsSheet = workbook.addWorksheet("Дод. спрацювання");
    const distanceSheet = workbook.addWorksheet("Пробіг за цілями");

    vehiclesSheet.columns = [
      { header: "Місто", key: "cityName", width: 18 },
      { header: "Автомобіль", key: "vehicleTitle", width: 24 },
      { header: "Держномер", key: "licensePlate", width: 16 },
      { header: "Усього змін", key: "totalShifts", width: 14 },
      { header: "Поїздок", key: "totalTrips", width: 12 },
      { header: "Пробіг", key: "totalDistanceKm", width: 14 },
      { header: "Середній пробіг", key: "averageDistancePerShift", width: 18 },
      { header: "Перша зміна", key: "firstShiftDate", width: 14 },
      { header: "Перший спідометр", key: "odometerStartFirstShift", width: 18 },
      { header: "Остання зміна", key: "lastShiftDate", width: 16 },
      { header: "Останній спідометр", key: "odometerEndLastShift", width: 20 },
      { header: "Усього спрацювань", key: "totalAlarms", width: 18 },
      { header: "ОХ", key: "totalOh", width: 10 },
      { header: "Партнери", key: "totalPartner", width: 12 },
      { header: "Бойові", key: "combatTotal", width: 12 },
      { header: "Хибні", key: "falseTotal", width: 12 },
      { header: "Дод. усього", key: "additionalTotal", width: 14 },
      { header: "Дод. ОХ", key: "additionalOh", width: 12 },
      { header: "Дод. Партнери", key: "additionalPartner", width: 16 },
      { header: "Затримано", key: "detained", width: 12 },
      { header: "Передано", key: "transferred", width: 12 },
    ];

    reasonsSheet.columns = [
      { header: "Місто", key: "cityName", width: 18 },
      { header: "Автомобіль", key: "vehicleTitle", width: 24 },
      { header: "Держномер", key: "licensePlate", width: 16 },
      { header: "Причина", key: "reasonName", width: 28 },
      { header: "Усього", key: "total", width: 12 },
      { header: "ОХ", key: "oh", width: 12 },
      { header: "Партнери", key: "partner", width: 12 },
    ];

    distanceSheet.columns = [
      { header: "Місто", key: "cityName", width: 18 },
      { header: "Автомобіль", key: "vehicleTitle", width: 24 },
      { header: "Держномер", key: "licensePlate", width: 16 },
      { header: "Ціль поїздки", key: "goalName", width: 30 },
      { header: "Пробіг", key: "distance", width: 14 },
    ];

    for (const row of sortedRows) {
      vehiclesSheet.addRow({
        cityName: row.cityName,
        vehicleTitle: row.vehicleTitle,
        licensePlate: row.licensePlate ?? "",
        totalShifts: row.totalShifts,
        totalTrips: row.totalTrips,
        totalDistanceKm: row.totalDistanceKm,
        averageDistancePerShift: row.averageDistancePerShift,
        firstShiftDate: row.firstShiftDate,
        odometerStartFirstShift: row.odometerStartFirstShift ?? "",
        lastShiftDate: row.lastShiftDate,
        odometerEndLastShift: row.odometerEndLastShift ?? "",
        totalAlarms: row.totalAlarms,
        totalOh: row.totalOh,
        totalPartner: row.totalPartner,
        combatTotal: row.combatTotal,
        falseTotal: row.falseTotal,
        additionalTotal: row.additionalTotal,
        additionalOh: row.additionalOh,
        additionalPartner: row.additionalPartner,
        detained: row.detained,
        transferred: row.transferred,
      });

      reasonsSheet.addRow({
        cityName: row.cityName,
        vehicleTitle: row.vehicleTitle,
        licensePlate: row.licensePlate ?? "",
        reasonName: "Додатково",
        total: row.additionalTotal,
        oh: row.additionalOh,
        partner: row.additionalPartner,
      });

      for (const [reasonName, stats] of Object.entries(
        row.additionalByReason,
      )) {
        reasonsSheet.addRow({
          cityName: row.cityName,
          vehicleTitle: row.vehicleTitle,
          licensePlate: row.licensePlate ?? "",
          reasonName,
          total: stats.total,
          oh: stats.oh,
          partner: stats.partner,
        });
      }

      for (const [goalName, distance] of Object.entries(row.distanceByGoal)) {
        distanceSheet.addRow({
          cityName: row.cityName,
          vehicleTitle: row.vehicleTitle,
          licensePlate: row.licensePlate ?? "",
          goalName,
          distance: roundNumber(Number(distance)),
        });
      }
    }

    [vehiclesSheet, reasonsSheet, distanceSheet].forEach(styleSheet);

    vehiclesSheet.getColumn("firstShiftDate").numFmt = "dd.mm.yyyy";
    vehiclesSheet.getColumn("lastShiftDate").numFmt = "dd.mm.yyyy";

    const fileName = `vehicles-report-${Date.now()}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("exportVehiclesTableExcel error:", error);

    return res.status(500).json({
      message: "Внутрішня помилка сервера",
    });
  }
}

type AlarmsExportTotals = {
  totalAlarms: number;
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

  detained: number;
  transferred: number;

  totalShifts: number;
  totalTrips: number;
  totalDistanceKm: number;
};

type AlarmsExportReasonStats = {
  total: number;
  oh: number;
  partner: number;
};

type AlarmsExportGroupRow = AlarmsExportTotals & {
  key: string;
  name: string;
};

function createAlarmsExportTotals(): AlarmsExportTotals {
  return {
    totalAlarms: 0,
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

    detained: 0,
    transferred: 0,

    totalShifts: 0,
    totalTrips: 0,
    totalDistanceKm: 0,
  };
}

function createAlarmsExportGroupRow(params: {
  key: string;
  name: string;
}): AlarmsExportGroupRow {
  return {
    key: params.key,
    name: params.name,
    ...createAlarmsExportTotals(),
  };
}

function addShiftSummaryToAlarmsExportTotals(
  totals: AlarmsExportTotals,
  summary: ReturnType<typeof calculateShiftSummary>,
) {
  totals.totalShifts += summary.shiftEquivalent;
  totals.totalTrips += summary.totalTrips;
  totals.totalDistanceKm += Number(summary.totalDistanceKm);

  totals.totalAlarms += summary.totalAlarms;
  totals.totalOh += summary.totalOh;
  totals.totalPartner += summary.totalPartner;

  totals.falseTotal += summary.falseTotal;
  totals.falseOh += summary.falseOh;
  totals.falsePartner += summary.falsePartner;

  totals.combatTotal += summary.combatTotal;
  totals.combatOh += summary.combatOh;
  totals.combatPartner += summary.combatPartner;

  totals.additionalTotal += summary.additionalTotal;
  totals.additionalOh += summary.additionalOh;
  totals.additionalPartner += summary.additionalPartner;

  totals.detained += summary.detained;
  totals.transferred += summary.transferred;
}

function addAlarmsExportReasonsToMap(
  map: Map<string, AlarmsExportReasonStats>,
  summary: ReturnType<typeof calculateShiftSummary>,
) {
  for (const [reasonName, reasonStats] of Object.entries(
    summary.additionalByReason,
  )) {
    if (!map.has(reasonName)) {
      map.set(reasonName, {
        total: 0,
        oh: 0,
        partner: 0,
      });
    }

    const row = map.get(reasonName)!;

    row.total += reasonStats.total;
    row.oh += reasonStats.oh;
    row.partner += reasonStats.partner;
  }
}

function getAlarmsExportMonthKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

function getAlarmsExportMonthName(date: Date) {
  return date.toLocaleDateString("uk-UA", {
    month: "long",
    year: "numeric",
  });
}

function buildAlarmsExportWhere(
  req: Request,
  scope: ExportScope,
  departmentId?: number,
) {
  const cityId = parseNumberExportQuery(req.query.cityId);
  const crewId = parseNumberExportQuery(req.query.crewId);
  const vehicleId = parseNumberExportQuery(req.query.vehicleId);
  const employeeId = parseNumberExportQuery(req.query.employeeId);

  const dateFrom = parseDate(req.query.dateFrom);
  const dateTo = parseDate(req.query.dateTo);

  const search = req.query.search ? String(req.query.search).trim() : "";

  const where: any = {
    deletedAt: null,
    ...buildExportAccessWhere(scope),
    ...(departmentId ? { departmentId } : {}),
    ...(cityId ? { cityId } : {}),
    ...(crewId ? { crewId } : {}),
    ...(vehicleId ? { vehicleId } : {}),
    ...(employeeId
      ? {
          OR: [
            { driverEmployeeId: employeeId },
            { seniorEmployeeId: employeeId },
          ],
        }
      : {}),
    ...(dateFrom || dateTo
      ? {
          shiftDate: {
            ...(dateFrom ? { gte: dateFrom } : {}),
            ...(dateTo ? { lte: dateTo } : {}),
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            {
              city: {
                name: {
                  contains: search,
                },
              },
            },
            {
              crew: {
                name: {
                  contains: search,
                },
              },
            },
            {
              vehicle: {
                title: {
                  contains: search,
                },
              },
            },
            {
              vehicle: {
                licensePlate: {
                  contains: search,
                },
              },
            },
            {
              driverEmployee: {
                fullName: {
                  contains: search,
                },
              },
            },
            {
              seniorEmployee: {
                fullName: {
                  contains: search,
                },
              },
            },
          ],
        }
      : {}),
  };

  return where;
}

function addAlarmsSummaryRows(
  sheet: ExcelJS.Worksheet,
  totals: AlarmsExportTotals,
) {
  sheet.addRow({
    title: "Усього спрацювань",
    total: totals.totalAlarms,
    oh: totals.totalOh,
    partner: totals.totalPartner,
  });

  sheet.addRow({
    title: "Хибні",
    total: totals.falseTotal,
    oh: totals.falseOh,
    partner: totals.falsePartner,
  });

  sheet.addRow({
    title: "Бойові",
    total: totals.combatTotal,
    oh: totals.combatOh,
    partner: totals.combatPartner,
  });

  sheet.addRow({
    title: "Додатково",
    total: totals.additionalTotal,
    oh: totals.additionalOh,
    partner: totals.additionalPartner,
  });

  sheet.addRow({
    title: "Затримано",
    total: totals.detained,
    oh: "",
    partner: "",
  });

  sheet.addRow({
    title: "Передано",
    total: totals.transferred,
    oh: "",
    partner: "",
  });

  sheet.addRow({
    title: "Змін",
    total: totals.totalShifts,
    oh: "",
    partner: "",
  });

  sheet.addRow({
    title: "Поїздок",
    total: totals.totalTrips,
    oh: "",
    partner: "",
  });

  sheet.addRow({
    title: "Пробіг",
    total: roundNumber(totals.totalDistanceKm),
    oh: "",
    partner: "",
  });
}

function addAlarmsGroupRows(
  sheet: ExcelJS.Worksheet,
  rows: AlarmsExportGroupRow[],
) {
  for (const row of rows) {
    sheet.addRow({
      name: row.name,
      totalAlarms: row.totalAlarms,
      totalOh: row.totalOh,
      totalPartner: row.totalPartner,
      combatTotal: row.combatTotal,
      falseTotal: row.falseTotal,
      additionalTotal: row.additionalTotal,
      additionalOh: row.additionalOh,
      additionalPartner: row.additionalPartner,
      detained: row.detained,
      transferred: row.transferred,
      totalShifts: row.totalShifts,
      totalTrips: row.totalTrips,
      totalDistanceKm: roundNumber(row.totalDistanceKm),
    });
  }
}

export async function exportAlarmsReportExcel(req: Request, res: Response) {
  try {
    const scope = await getExportScope(req);
    const departmentId = parseNumberExportQuery(req.query.departmentId);
    const where = buildAlarmsExportWhere(req, scope, departmentId);

    const shifts = await prisma.shift.findMany({
      where,
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
        vehicle: {
          select: {
            id: true,
            title: true,
            licensePlate: true,
          },
        },
        driverEmployee: {
          select: {
            id: true,
            fullName: true,
          },
        },
        seniorEmployee: {
          select: {
            id: true,
            fullName: true,
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

    const totals = createAlarmsExportTotals();

    const byCityMap = new Map<string, AlarmsExportGroupRow>();
    const byMonthMap = new Map<string, AlarmsExportGroupRow>();
    const additionalByReasonMap = new Map<string, AlarmsExportReasonStats>();

    for (const shift of shifts) {
      const summary = calculateShiftSummary(shift);

      addShiftSummaryToAlarmsExportTotals(totals, summary);
      addAlarmsExportReasonsToMap(additionalByReasonMap, summary);

      const cityKey = String(shift.city.id);

      if (!byCityMap.has(cityKey)) {
        byCityMap.set(
          cityKey,
          createAlarmsExportGroupRow({
            key: cityKey,
            name: shift.city.name,
          }),
        );
      }

      addShiftSummaryToAlarmsExportTotals(byCityMap.get(cityKey)!, summary);

      const monthKey = getAlarmsExportMonthKey(shift.shiftDate);

      if (!byMonthMap.has(monthKey)) {
        byMonthMap.set(
          monthKey,
          createAlarmsExportGroupRow({
            key: monthKey,
            name: getAlarmsExportMonthName(shift.shiftDate),
          }),
        );
      }

      addShiftSummaryToAlarmsExportTotals(byMonthMap.get(monthKey)!, summary);
    }

    const additionalByReason = Array.from(additionalByReasonMap.entries())
      .map(([reasonName, stats]) => ({
        reasonName,
        ...stats,
      }))
      .sort((a, b) => b.total - a.total);

    const byCity = Array.from(byCityMap.values()).sort(
      (a, b) => b.totalAlarms - a.totalAlarms,
    );

    const byMonth = Array.from(byMonthMap.values()).sort((a, b) =>
      a.key.localeCompare(b.key),
    );

    const workbook = new ExcelJS.Workbook();

    workbook.creator = "Guard Journal";
    workbook.created = new Date();

    const summarySheet = workbook.addWorksheet("Зведення");
    const reasonsSheet = workbook.addWorksheet("Дод. спрацювання");
    const citiesSheet = workbook.addWorksheet("За містами");
    const monthsSheet = workbook.addWorksheet("За місяцями");

    summarySheet.columns = [
      { header: "Показник", key: "title", width: 28 },
      { header: "Усього", key: "total", width: 14 },
      { header: "ОХ", key: "oh", width: 14 },
      { header: "Партнери", key: "partner", width: 14 },
    ];

    reasonsSheet.columns = [
      { header: "Причина", key: "reasonName", width: 30 },
      { header: "Усього", key: "total", width: 14 },
      { header: "ОХ", key: "oh", width: 14 },
      { header: "Партнери", key: "partner", width: 14 },
    ];

    citiesSheet.columns = [
      { header: "Місто", key: "name", width: 22 },
      { header: "Усього спрацювань", key: "totalAlarms", width: 18 },
      { header: "ОХ", key: "totalOh", width: 10 },
      { header: "Партнери", key: "totalPartner", width: 12 },
      { header: "Бойові", key: "combatTotal", width: 12 },
      { header: "Хибні", key: "falseTotal", width: 12 },
      { header: "Дод. усього", key: "additionalTotal", width: 14 },
      { header: "Дод. ОХ", key: "additionalOh", width: 12 },
      { header: "Дод. Партнери", key: "additionalPartner", width: 16 },
      { header: "Затримано", key: "detained", width: 12 },
      { header: "Передано", key: "transferred", width: 12 },
      { header: "Змін", key: "totalShifts", width: 10 },
      { header: "Поїздок", key: "totalTrips", width: 10 },
      { header: "Пробіг", key: "totalDistanceKm", width: 12 },
    ];

    monthsSheet.columns = [
      { header: "Місяць", key: "name", width: 22 },
      { header: "Усього спрацювань", key: "totalAlarms", width: 18 },
      { header: "ОХ", key: "totalOh", width: 10 },
      { header: "Партнери", key: "totalPartner", width: 12 },
      { header: "Бойові", key: "combatTotal", width: 12 },
      { header: "Хибні", key: "falseTotal", width: 12 },
      { header: "Дод. усього", key: "additionalTotal", width: 14 },
      { header: "Дод. ОХ", key: "additionalOh", width: 12 },
      { header: "Дод. Партнери", key: "additionalPartner", width: 16 },
      { header: "Затримано", key: "detained", width: 12 },
      { header: "Передано", key: "transferred", width: 12 },
      { header: "Змін", key: "totalShifts", width: 10 },
      { header: "Поїздок", key: "totalTrips", width: 10 },
      { header: "Пробіг", key: "totalDistanceKm", width: 12 },
    ];

    addAlarmsSummaryRows(summarySheet, totals);

    reasonsSheet.addRow({
      reasonName: "Додатково",
      total: totals.additionalTotal,
      oh: totals.additionalOh,
      partner: totals.additionalPartner,
    });

    for (const row of additionalByReason) {
      reasonsSheet.addRow({
        reasonName: row.reasonName,
        total: row.total,
        oh: row.oh,
        partner: row.partner,
      });
    }

    addAlarmsGroupRows(citiesSheet, byCity);
    addAlarmsGroupRows(monthsSheet, byMonth);

    [summarySheet, reasonsSheet, citiesSheet, monthsSheet].forEach(styleSheet);

    const fileName = `alarms-report-${Date.now()}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("exportAlarmsReportExcel error:", error);

    return res.status(500).json({
      message: "Внутрішня помилка сервера",
    });
  }
}
