import { Request, Response } from "express";
import ExcelJS from "exceljs";
import { prisma } from "../../config/prisma";

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
    FULL_DAY: "Суточный",
    DAY: "Дневной",
    NIGHT: "Ночной",
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
  dateFrom?: Date;
  dateTo?: Date;
}) {
  return prisma.shift.findMany({
    where: {
      deletedAt: null,
      ...(params.cityId ? { cityId: params.cityId } : {}),
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

    const goalName = trip.goal?.name ?? "Без цели";
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
          event.reason?.name ?? event.customReasonText ?? "Без причины";

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
      return `${postName}: ${roundNumber(stats.shiftEquivalent)} смен / ${roundNumber(
        stats.hours,
      )} ч / ${stats.count} выходов`;
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
    const cityId = req.query.cityId ? Number(req.query.cityId) : undefined;
    const dateFrom = parseDate(req.query.dateFrom);
    const dateTo = parseDate(req.query.dateTo);

    const shifts = await loadShiftsForExport({ cityId, dateFrom, dateTo });
    const postDuties = await prisma.postDuty.findMany({
      where: {
        deletedAt: null,
        ...(cityId ? { cityId } : {}),
        ...(dateFrom || dateTo
          ? {
              dutyDate: {
                ...(dateFrom ? { gte: dateFrom } : {}),
                ...(dateTo ? { lte: dateTo } : {}),
              },
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
    const workbook = new ExcelJS.Workbook();

    workbook.creator = "Guard Journal";
    workbook.created = new Date();

    const generalSheet = workbook.addWorksheet("Общая статистика");
    const employeesSheet = workbook.addWorksheet("Сотрудники");
    const employeePostsSheet = workbook.addWorksheet("Постовые дежурства");
    const crewsSheet = workbook.addWorksheet("Наряды");
    const vehiclesSheet = workbook.addWorksheet("Автомобили");

    const totals = createEmptyTotals();

    const employeeMap = new Map<string, any>();
    const crewMap = new Map<string, any>();
    const vehicleMap = new Map<string, any>();

    for (const shift of shifts) {
      const summary = calculateShiftSummary(shift);

      addSummaryToTotals(totals, summary);

      const driver = shift.driverEmployee;
      const senior = shift.seniorEmployee;

      const driverKey = `${driver.id}_${shift.city.id}`;

      if (!employeeMap.has(driverKey)) {
        employeeMap.set(driverKey, {
          ...createEmptyTotals(),
          employeeId: driver.id,
          cityId: shift.city.id,
          cityName: shift.city.name,
          name: driver.fullName,
          driverShifts: 0,
          seniorShifts: 0,
          weaponShifts: 0,
          postDutyShiftEquivalent: 0,
          postDutyHours: 0,
          postDutyCount: 0,
          postDutyByPost: {},
        });
      }

      const driverRow = employeeMap.get(driverKey);
      driverRow.driverShifts += summary.shiftEquivalent;
      if (shift.driverHasWeapon) {
        driverRow.weaponShifts += summary.shiftEquivalent;
      }
      addSummaryToTotals(driverRow, summary);

      const seniorKey = `${senior.id}_${shift.city.id}`;

      if (!employeeMap.has(seniorKey)) {
        employeeMap.set(seniorKey, {
          ...createEmptyTotals(),
          employeeId: senior.id,
          cityId: shift.city.id,
          cityName: shift.city.name,
          name: senior.fullName,
          driverShifts: 0,
          seniorShifts: 0,
          weaponShifts: 0,
          postDutyShiftEquivalent: 0,
          postDutyHours: 0,
          postDutyCount: 0,
          postDutyByPost: {},
        });
      }

      const seniorRow = employeeMap.get(seniorKey);
      seniorRow.seniorShifts += summary.shiftEquivalent;
      if (shift.seniorHasWeapon) {
        seniorRow.weaponShifts += summary.shiftEquivalent;
      }
      addSummaryToTotals(seniorRow, summary);

      const crewKey = `${shift.crew.id}_${shift.city.id}`;

      if (!crewMap.has(crewKey)) {
        crewMap.set(crewKey, {
          crewId: shift.crew.id,
          cityId: shift.city.id,
          cityName: shift.city.name,
          name: shift.crew.name,
          ...createEmptyTotals(),
        });
      }

      addSummaryToTotals(crewMap.get(crewKey), summary);
      const vehicleKey = `${shift.vehicle.id}_${shift.city.id}`;

      if (!vehicleMap.has(vehicleKey)) {
        vehicleMap.set(vehicleKey, {
          vehicleId: shift.vehicle.id,
          cityId: shift.city.id,
          cityName: shift.city.name,
          title: shift.vehicle.title,
          licensePlate: shift.vehicle.licensePlate,
          odometerStartFirstShift: null,
          odometerEndLastShift: null,
          firstShiftDate: null,
          lastShiftDate: null,
          ...createEmptyTotals(),
        });
      }

      const vehicleRow = vehicleMap.get(vehicleKey);

      if (
        !vehicleRow.firstShiftDate ||
        shift.shiftDate < vehicleRow.firstShiftDate
      ) {
        vehicleRow.firstShiftDate = shift.shiftDate;
        vehicleRow.odometerStartFirstShift = shift.odometerStart;
      }

      if (
        !vehicleRow.lastShiftDate ||
        shift.shiftDate > vehicleRow.lastShiftDate
      ) {
        vehicleRow.lastShiftDate = shift.shiftDate;
        vehicleRow.odometerEndLastShift = shift.odometerEndCalculated;
      }

      addSummaryToTotals(vehicleRow, summary);
    }
    for (const duty of postDuties) {
      const durationHours = Number(duty.durationHours);

      for (const member of duty.members) {
        const employee = member.employee;
        const employeeKey = `${employee.id}_${duty.city.id}`;

        if (!employeeMap.has(employeeKey)) {
          employeeMap.set(employeeKey, {
            ...createEmptyTotals(),
            employeeId: employee.id,
            cityId: duty.city.id,
            cityName: duty.city.name,
            name: employee.fullName,
            driverShifts: 0,
            seniorShifts: 0,
            weaponShifts: 0,
            postDutyShiftEquivalent: 0,
            postDutyHours: 0,
            postDutyCount: 0,
            postDutyByPost: {},
          });
        }

        const row = employeeMap.get(employeeKey);

        addPostDutyToEmployeeExportTotal(row, {
          postName: duty.post.name,
          durationHours,
          hasWeapon: member.hasWeapon,
          isDriver: member.isDriver,
        });
      }
    }
    generalSheet.columns = [
      { header: "Показатель", key: "label", width: 32 },
      { header: "Значение", key: "value", width: 18 },
    ];

    generalSheet.addRows([
      { label: "Всего смен", value: roundNumber(totals.totalShifts) },
      { label: "Всего поездок", value: totals.totalTrips },
      { label: "Пробег", value: roundNumber(totals.totalDistanceKm) },
      { label: "Всего сработок", value: totals.totalAlarms },
      { label: "ОХ", value: totals.totalOh },
      { label: "Партнеры", value: totals.totalPartner },
      { label: "Ложные", value: totals.falseTotal },
      { label: "Боевые", value: totals.combatTotal },
      { label: "Дополнительно", value: totals.additionalTotal },
      { label: "Задержано", value: totals.detained },
      { label: "Передано", value: totals.transferred },
    ]);

    employeesSheet.columns = [
      { header: "Город", key: "cityName", width: 18 },
      { header: "Сотрудник", key: "name", width: 28 },
      { header: "Смен", key: "totalShifts", width: 12 },
      { header: "Водителем", key: "driverShifts", width: 12 },
      { header: "Старшим", key: "seniorShifts", width: 12 },
      { header: "С оружием", key: "weaponShifts", width: 12 },
      { header: "Дополнительно", key: "postDutyShiftEquivalent", width: 16 },
      { header: "Постовые часы", key: "postDutyHours", width: 16 },
      { header: "Выходов на посты", key: "postDutyCount", width: 18 },
      { header: "Посты", key: "postDutySummary", width: 42 },
      { header: "Сработок", key: "totalAlarms", width: 12 },
      { header: "ОХ", key: "totalOh", width: 10 },
      { header: "Партнеры", key: "totalPartner", width: 12 },
      { header: "Ложные", key: "falseTotal", width: 12 },
      { header: "Боевые", key: "combatTotal", width: 12 },
      { header: "Доп. сработки", key: "additionalTotal", width: 14 },
      { header: "Пробег", key: "totalDistanceKm", width: 12 },
      { header: "Задержано", key: "detained", width: 12 },
      { header: "Передано", key: "transferred", width: 12 },
    ];
    employeePostsSheet.columns = [
      { header: "Город", key: "cityName", width: 18 },
      { header: "Сотрудник", key: "name", width: 28 },
      { header: "Пост", key: "postName", width: 28 },
      { header: "Смен", key: "shiftEquivalent", width: 12 },
      { header: "Часы", key: "hours", width: 12 },
      { header: "Выходов", key: "count", width: 12 },
    ];

    const employeeRows = Array.from(employeeMap.values()).map((row) => ({
      ...row,
      totalShifts: roundNumber(row.totalShifts),
      driverShifts: roundNumber(row.driverShifts),
      seniorShifts: roundNumber(row.seniorShifts),
      weaponShifts: roundNumber(row.weaponShifts),
      postDutyShiftEquivalent: roundNumber(row.postDutyShiftEquivalent),
      postDutyHours: roundNumber(row.postDutyHours),
      postDutySummary: buildPostDutyExportText(row.postDutyByPost),
      totalDistanceKm: roundNumber(row.totalDistanceKm),
    }));

    employeesSheet.addRows(employeeRows);

    for (const row of employeeRows) {
      employeePostsSheet.addRow({
        cityName: row.cityName,
        name: row.name,
        postName: "Дополнительно",
        shiftEquivalent: row.postDutyShiftEquivalent,
        hours: row.postDutyHours,
        count: row.postDutyCount,
      });

      for (const [postName, stats] of Object.entries(row.postDutyByPost)) {
        employeePostsSheet.addRow({
          cityName: row.cityName,
          name: row.name,
          postName,
          shiftEquivalent: roundNumber(Number((stats as any).shiftEquivalent)),
          hours: roundNumber(Number((stats as any).hours)),
          count: (stats as any).count,
        });
      }
    }

    crewsSheet.columns = [
      { header: "Город", key: "cityName", width: 18 },
      { header: "Наряд", key: "name", width: 24 },
      { header: "Смен", key: "totalShifts", width: 12 },
      { header: "Поездок", key: "totalTrips", width: 12 },
      { header: "Пробег", key: "totalDistanceKm", width: 12 },
      { header: "Сработок", key: "totalAlarms", width: 12 },
      { header: "ОХ", key: "totalOh", width: 10 },
      { header: "Партнеры", key: "totalPartner", width: 12 },
      { header: "Ложные", key: "falseTotal", width: 12 },
      { header: "Боевые", key: "combatTotal", width: 12 },
      { header: "Доп.", key: "additionalTotal", width: 12 },
      { header: "Задержано", key: "detained", width: 12 },
      { header: "Передано", key: "transferred", width: 12 },
    ];

    crewsSheet.addRows(
      Array.from(crewMap.values()).map((row) => ({
        ...row,
        totalShifts: roundNumber(row.totalShifts),
        totalDistanceKm: roundNumber(row.totalDistanceKm),
      })),
    );

    vehiclesSheet.columns = [
      { header: "Город", key: "cityName", width: 18 },
      { header: "Автомобиль", key: "title", width: 24 },
      { header: "Госномер", key: "licensePlate", width: 16 },
      { header: "Смен", key: "totalShifts", width: 12 },
      { header: "Поездок", key: "totalTrips", width: 12 },
      { header: "Пробег", key: "totalDistanceKm", width: 12 },
      { header: "Спидометр начало", key: "odometerStartFirstShift", width: 18 },
      { header: "Спидометр конец", key: "odometerEndLastShift", width: 18 },
      { header: "Сработок", key: "totalAlarms", width: 12 },
      { header: "ОХ", key: "totalOh", width: 10 },
      { header: "Партнеры", key: "totalPartner", width: 12 },
      { header: "Ложные", key: "falseTotal", width: 12 },
      { header: "Боевые", key: "combatTotal", width: 12 },
      { header: "Доп.", key: "additionalTotal", width: 12 },
      { header: "Задержано", key: "detained", width: 12 },
      { header: "Передано", key: "transferred", width: 12 },
    ];

    vehiclesSheet.addRows(
      Array.from(vehicleMap.values()).map((row) => ({
        ...row,
        totalShifts: roundNumber(row.totalShifts),
        totalDistanceKm: roundNumber(row.totalDistanceKm),
      })),
    );

    [
      generalSheet,
      employeesSheet,
      employeePostsSheet,
      crewsSheet,
      vehiclesSheet,
    ].forEach(styleSheet);

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
      message: "Internal server error",
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
        const source = event.alarmSource === "OH" ? "ОХ" : "Партнеры";
        const combatText = event.isCombat ? "боевая" : "ложная";
        return `${source}, ${combatText}`;
      }

      const reason =
        event.reason?.name ?? event.customReasonText ?? "Без причины";
      const oh = event.ohCount ?? 0;
      const partner = event.partnerCount ?? 0;

      return `Доп.: ${reason} (${oh}/${partner})`;
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
    return "Есть боевые и ложные";
  }

  if (totals.combatTotal > 0) {
    return "Боевая";
  }

  if (totals.falseTotal > 0) {
    return "Ложная";
  }

  return "—";
}

function buildTripExportWhere(req: Request) {
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

    const where = buildTripExportWhere(req);

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

    const tripsSheet = workbook.addWorksheet("Все поездки");
    const eventsSheet = workbook.addWorksheet("События поездок");

    tripsSheet.columns = [
      { header: "Город", key: "city", width: 18 },
      { header: "Дата", key: "shiftDate", width: 14 },
      { header: "Наряд", key: "crew", width: 18 },
      { header: "Авто", key: "vehicle", width: 24 },
      { header: "Госномер", key: "licensePlate", width: 16 },
      { header: "Старший", key: "senior", width: 28 },
      { header: "Водитель", key: "driver", width: 28 },
      { header: "Спидометр начало", key: "odometerStart", width: 18 },
      { header: "Откуда", key: "fromLocation", width: 28 },
      { header: "Время выезда", key: "departureTime", width: 18 },
      { header: "Куда", key: "toLocation", width: 28 },
      { header: "Время прибытия", key: "arrivalTime", width: 18 },
      { header: "Прибытие, мин", key: "arrivalMinutes", width: 16 },
      { header: "Расстояние, км", key: "distanceKm", width: 16 },
      { header: "Цель поездки", key: "goal", width: 24 },
      { header: "Сработка", key: "eventSummary", width: 40 },
      { header: "Боевая?", key: "combatLabel", width: 18 },
      { header: "Всего сработок", key: "totalAlarms", width: 16 },
      { header: "ОХ", key: "totalOh", width: 10 },
      { header: "Партнеры", key: "totalPartner", width: 12 },
      { header: "Доп. ОХ", key: "additionalOh", width: 12 },
      { header: "Доп. Партнеры", key: "additionalPartner", width: 16 },
      { header: "Задержано", key: "detained", width: 12 },
      { header: "Передано", key: "transferred", width: 12 },
      { header: "Примечание", key: "note", width: 30 },
    ];

    eventsSheet.columns = [
      { header: "ID поездки", key: "tripId", width: 12 },
      { header: "Город", key: "city", width: 18 },
      { header: "Дата", key: "shiftDate", width: 14 },
      { header: "Наряд", key: "crew", width: 18 },
      { header: "Маршрут", key: "route", width: 42 },
      { header: "Событие", key: "title", width: 28 },
      { header: "Категория", key: "eventCategory", width: 22 },
      { header: "ОХ", key: "ohCount", width: 10 },
      { header: "Партнеры", key: "partnerCount", width: 12 },
      { header: "Всего", key: "countTotal", width: 10 },
      { header: "Боевая?", key: "combatLabel", width: 14 },
      { header: "Причина", key: "reasonName", width: 26 },
      { header: "Задержано", key: "detained", width: 12 },
      { header: "Передано", key: "transferred", width: 12 },
      { header: "Примечание", key: "note", width: 30 },
    ];

    for (const trip of trips) {
      const totals = calculateTripExportTotals(trip.events);
      const combatLabel = getTripExportCombatLabel(totals);

      tripsSheet.addRow({
        city: trip.city.name,
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
              ? "Сработка ОХ"
              : "Сработка Партнеры"
            : "Дополнительные сработки",
          eventCategory: event.eventCategory,
          ohCount,
          partnerCount,
          countTotal: isRegular ? 1 : ohCount + partnerCount,
          combatLabel: isRegular ? (event.isCombat ? "Боевая" : "Ложная") : "",
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
      message: "Internal server error",
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

function buildShiftExportWhere(req: Request) {
  const cityId = parseNumberExportQuery(req.query.cityId);
  const crewId = parseNumberExportQuery(req.query.crewId);
  const vehicleId = parseNumberExportQuery(req.query.vehicleId);
  const employeeId = parseNumberExportQuery(req.query.employeeId);

  const dateFrom = parseDate(req.query.dateFrom);
  const dateTo = parseDate(req.query.dateTo);

  const search = req.query.search ? String(req.query.search).trim() : "";

  const where: any = {
    deletedAt: null,
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
    parts.push("водитель");
  }

  if (params.seniorHasWeapon) {
    parts.push("старший");
  }

  return parts.length ? parts.join(", ") : "без оружия";
}

export async function exportShiftsTableExcel(req: Request, res: Response) {
  try {
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

    const where = buildShiftExportWhere(req);

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

    const shiftsSheet = workbook.addWorksheet("Итоги смен");
    const tripsSheet = workbook.addWorksheet("Поездки смен");
    const eventsSheet = workbook.addWorksheet("События поездок");

    shiftsSheet.columns = [
      { header: "Город", key: "city", width: 18 },
      { header: "Дата", key: "shiftDate", width: 14 },
      { header: "Время отправки", key: "submittedAt", width: 18 },
      { header: "Наряд", key: "crew", width: 18 },
      { header: "Тип наряда", key: "crewDutyType", width: 16 },
      { header: "Транспорт", key: "crewTransportType", width: 14 },
      { header: "Часы", key: "shiftDurationHours", width: 10 },
      { header: "Смены", key: "shiftEquivalent", width: 10 },
      { header: "Авто", key: "vehicle", width: 24 },
      { header: "Госномер", key: "licensePlate", width: 16 },
      { header: "Водитель", key: "driver", width: 28 },
      { header: "Старший", key: "senior", width: 28 },
      { header: "Оружие", key: "weapon", width: 20 },
      { header: "Спидометр начало", key: "odometerStart", width: 18 },
      { header: "Спидометр конец", key: "odometerEnd", width: 18 },
      { header: "Пробег", key: "distance", width: 14 },
      { header: "Поездок", key: "totalTrips", width: 12 },
      { header: "Сработок всего", key: "totalAlarms", width: 16 },
      { header: "ОХ", key: "totalOh", width: 10 },
      { header: "Партнеры", key: "totalPartner", width: 12 },
      { header: "Боевые", key: "combatTotal", width: 12 },
      { header: "Ложные", key: "falseTotal", width: 12 },
      { header: "Доп. всего", key: "additionalTotal", width: 14 },
      { header: "Доп. ОХ", key: "additionalOh", width: 12 },
      { header: "Доп. Партнеры", key: "additionalPartner", width: 16 },
      { header: "Задержано", key: "detained", width: 12 },
      { header: "Передано", key: "transferred", width: 12 },
    ];

    tripsSheet.columns = [
      { header: "ID смены", key: "shiftId", width: 12 },
      { header: "Город", key: "city", width: 18 },
      { header: "Дата", key: "shiftDate", width: 14 },
      { header: "Наряд", key: "crew", width: 18 },
      { header: "Авто", key: "vehicle", width: 24 },
      { header: "Водитель", key: "driver", width: 28 },
      { header: "Старший", key: "senior", width: 28 },
      { header: "Откуда", key: "fromLocation", width: 28 },
      { header: "Время выезда", key: "departureTime", width: 18 },
      { header: "Куда", key: "toLocation", width: 28 },
      { header: "Время прибытия", key: "arrivalTime", width: 18 },
      { header: "Прибытие, мин", key: "arrivalMinutes", width: 16 },
      { header: "Расстояние, км", key: "distanceKm", width: 16 },
      { header: "Цель поездки", key: "goal", width: 24 },
      { header: "Сработка", key: "eventSummary", width: 40 },
      { header: "Задержано", key: "detained", width: 12 },
      { header: "Передано", key: "transferred", width: 12 },
      { header: "Примечание", key: "note", width: 30 },
    ];

    eventsSheet.columns = [
      { header: "ID смены", key: "shiftId", width: 12 },
      { header: "ID поездки", key: "tripId", width: 12 },
      { header: "Город", key: "city", width: 18 },
      { header: "Дата", key: "shiftDate", width: 14 },
      { header: "Наряд", key: "crew", width: 18 },
      { header: "Маршрут", key: "route", width: 42 },
      { header: "Событие", key: "title", width: 28 },
      { header: "Категория", key: "eventCategory", width: 22 },
      { header: "ОХ", key: "ohCount", width: 10 },
      { header: "Партнеры", key: "partnerCount", width: 12 },
      { header: "Всего", key: "countTotal", width: 10 },
      { header: "Боевая?", key: "combatLabel", width: 14 },
      { header: "Причина", key: "reasonName", width: 26 },
      { header: "Задержано", key: "detained", width: 12 },
      { header: "Передано", key: "transferred", width: 12 },
      { header: "Примечание", key: "note", width: 30 },
    ];

    for (const shift of shifts) {
      const shiftSummary = calculateShiftSummary(shift);

      shiftsSheet.addRow({
        city: shift.city.name,
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
                ? "Сработка ОХ"
                : "Сработка Партнеры"
              : "Дополнительные сработки",
            eventCategory: event.eventCategory,
            ohCount,
            partnerCount,
            countTotal: isRegular ? 1 : ohCount + partnerCount,
            combatLabel: isRegular
              ? event.isCombat
                ? "Боевая"
                : "Ложная"
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
      message: "Internal server error",
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

function buildEmployeesExportWhere(req: Request) {
  const cityId = parseNumberExportQuery(req.query.cityId);
  const crewId = parseNumberExportQuery(req.query.crewId);
  const vehicleId = parseNumberExportQuery(req.query.vehicleId);
  const employeeId = parseNumberExportQuery(req.query.employeeId);

  const dateFrom = parseDate(req.query.dateFrom);
  const dateTo = parseDate(req.query.dateTo);

  const search = req.query.search ? String(req.query.search).trim() : "";

  const where: any = {
    deletedAt: null,
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
      return `${postName}: ${roundNumber(stats.shiftEquivalent)} смен / ${roundNumber(
        stats.hours,
      )} ч / ${stats.count} выходов`;
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

    const { where, employeeId } = buildEmployeesExportWhere(req);
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

    const employeesSheet = workbook.addWorksheet("По сотрудникам");
    const reasonsSheet = workbook.addWorksheet("Доп. сработки");
    const postsSheet = workbook.addWorksheet("Постовые дежурства");

    employeesSheet.columns = [
      { header: "Город", key: "cityName", width: 18 },
      { header: "ФИО", key: "fullName", width: 32 },
      { header: "Всего смен", key: "totalShifts", width: 14 },
      { header: "Водителем", key: "driverShifts", width: 14 },
      { header: "Старшим", key: "seniorShifts", width: 14 },
      { header: "С оружием", key: "weaponShifts", width: 14 },
      { header: "Дополнительно", key: "postDutyShiftEquivalent", width: 16 },
      { header: "Постовые часы", key: "postDutyHours", width: 16 },
      { header: "Выходов на посты", key: "postDutyCount", width: 18 },
      { header: "Посты", key: "postDutySummary", width: 42 },
      { header: "Поездок", key: "totalTrips", width: 12 },
      { header: "Пробег", key: "totalDistanceKm", width: 14 },
      { header: "Всего сработок", key: "totalAlarms", width: 18 },
      { header: "Средняя нагрузка", key: "averageAlarmsPerShift", width: 18 },
      { header: "ОХ", key: "totalOh", width: 10 },
      { header: "Партнеры", key: "totalPartner", width: 12 },
      { header: "Боевые", key: "combatTotal", width: 12 },
      { header: "Ложные", key: "falseTotal", width: 12 },
      { header: "Доп. всего", key: "additionalTotal", width: 14 },
      { header: "Доп. ОХ", key: "additionalOh", width: 12 },
      { header: "Доп. Партнеры", key: "additionalPartner", width: 16 },
      { header: "Задержано", key: "detained", width: 12 },
      { header: "Передано", key: "transferred", width: 12 },
    ];

    reasonsSheet.columns = [
      { header: "Город", key: "cityName", width: 18 },
      { header: "ФИО", key: "fullName", width: 32 },
      { header: "Причина", key: "reasonName", width: 28 },
      { header: "Всего", key: "total", width: 12 },
      { header: "ОХ", key: "oh", width: 12 },
      { header: "Партнеры", key: "partner", width: 12 },
    ];

    postsSheet.columns = [
      { header: "Город", key: "cityName", width: 18 },
      { header: "ФИО", key: "fullName", width: 32 },
      { header: "Пост", key: "postName", width: 28 },
      { header: "Смен", key: "shiftEquivalent", width: 12 },
      { header: "Часы", key: "hours", width: 12 },
      { header: "Выходов", key: "count", width: 12 },
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
        reasonName: "Дополнительно",
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
        postName: "Дополнительно",
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
      message: "Internal server error",
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

function buildCrewsExportWhere(req: Request) {
  const cityId = parseNumberExportQuery(req.query.cityId);
  const crewId = parseNumberExportQuery(req.query.crewId);
  const vehicleId = parseNumberExportQuery(req.query.vehicleId);
  const employeeId = parseNumberExportQuery(req.query.employeeId);

  const dateFrom = parseDate(req.query.dateFrom);
  const dateTo = parseDate(req.query.dateTo);

  const search = req.query.search ? String(req.query.search).trim() : "";

  const where: any = {
    deletedAt: null,
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

    const where = buildCrewsExportWhere(req);

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

    const crewMap = new Map<number, CrewExportRow>();

    for (const shift of shifts) {
      const summary = calculateShiftSummary(shift);
      const crew = shift.crew;

      if (!crewMap.has(crew.id)) {
        crewMap.set(
          crew.id,
          createCrewExportRow({
            crewId: crew.id,
            crewName: crew.name,
            cityId: shift.city.id,
            cityName: shift.city.name,
          }),
        );
      }

      const row = crewMap.get(crew.id)!;
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

    const crewsSheet = workbook.addWorksheet("По нарядам");
    const reasonsSheet = workbook.addWorksheet("Доп. сработки");
    const distanceSheet = workbook.addWorksheet("Пробег по целям");

    crewsSheet.columns = [
      { header: "Город", key: "cityName", width: 18 },
      { header: "Наряд", key: "crewName", width: 24 },
      { header: "Всего смен", key: "totalShifts", width: 14 },
      { header: "Поездок", key: "totalTrips", width: 12 },
      { header: "Пробег", key: "totalDistanceKm", width: 14 },
      { header: "Средний пробег", key: "averageDistancePerShift", width: 18 },
      { header: "Всего сработок", key: "totalAlarms", width: 18 },
      { header: "Средняя нагрузка", key: "averageAlarmsPerShift", width: 18 },
      { header: "ОХ", key: "totalOh", width: 10 },
      { header: "Партнеры", key: "totalPartner", width: 12 },
      { header: "Боевые", key: "combatTotal", width: 12 },
      { header: "Ложные", key: "falseTotal", width: 12 },
      { header: "Доп. всего", key: "additionalTotal", width: 14 },
      { header: "Доп. ОХ", key: "additionalOh", width: 12 },
      { header: "Доп. Партнеры", key: "additionalPartner", width: 16 },
      { header: "Задержано", key: "detained", width: 12 },
      { header: "Передано", key: "transferred", width: 12 },
    ];

    reasonsSheet.columns = [
      { header: "Город", key: "cityName", width: 18 },
      { header: "Наряд", key: "crewName", width: 24 },
      { header: "Причина", key: "reasonName", width: 28 },
      { header: "Всего", key: "total", width: 12 },
      { header: "ОХ", key: "oh", width: 12 },
      { header: "Партнеры", key: "partner", width: 12 },
    ];

    distanceSheet.columns = [
      { header: "Город", key: "cityName", width: 18 },
      { header: "Наряд", key: "crewName", width: 24 },
      { header: "Цель поездки", key: "goalName", width: 30 },
      { header: "Пробег", key: "distance", width: 14 },
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
        reasonName: "Дополнительно",
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
      message: "Internal server error",
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

function buildVehiclesExportWhere(req: Request) {
  const cityId = parseNumberExportQuery(req.query.cityId);
  const crewId = parseNumberExportQuery(req.query.crewId);
  const vehicleId = parseNumberExportQuery(req.query.vehicleId);
  const employeeId = parseNumberExportQuery(req.query.employeeId);

  const dateFrom = parseDate(req.query.dateFrom);
  const dateTo = parseDate(req.query.dateTo);

  const search = req.query.search ? String(req.query.search).trim() : "";

  const shiftsWhere: any = {
    deletedAt: null,
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
      buildVehiclesExportWhere(req);

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

    const vehicleMap = new Map<number, VehicleExportRow>();

    for (const vehicle of vehiclesFromDirectory) {
      vehicleMap.set(
        vehicle.id,
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

      if (!vehicleMap.has(vehicle.id)) {
        vehicleMap.set(
          vehicle.id,
          createVehicleExportRow({
            vehicleId: vehicle.id,
            vehicleTitle: vehicle.title,
            licensePlate: vehicle.licensePlate,
            cityId: shift.city.id,
            cityName: shift.city.name,
          }),
        );
      }

      const row = vehicleMap.get(vehicle.id)!;
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

    const vehiclesSheet = workbook.addWorksheet("По автомобилям");
    const reasonsSheet = workbook.addWorksheet("Доп. сработки");
    const distanceSheet = workbook.addWorksheet("Пробег по целям");

    vehiclesSheet.columns = [
      { header: "Город", key: "cityName", width: 18 },
      { header: "Автомобиль", key: "vehicleTitle", width: 24 },
      { header: "Госномер", key: "licensePlate", width: 16 },
      { header: "Всего смен", key: "totalShifts", width: 14 },
      { header: "Поездок", key: "totalTrips", width: 12 },
      { header: "Пробег", key: "totalDistanceKm", width: 14 },
      { header: "Средний пробег", key: "averageDistancePerShift", width: 18 },
      { header: "Первая смена", key: "firstShiftDate", width: 14 },
      { header: "Первый спидометр", key: "odometerStartFirstShift", width: 18 },
      { header: "Последняя смена", key: "lastShiftDate", width: 16 },
      { header: "Последний спидометр", key: "odometerEndLastShift", width: 20 },
      { header: "Всего сработок", key: "totalAlarms", width: 18 },
      { header: "ОХ", key: "totalOh", width: 10 },
      { header: "Партнеры", key: "totalPartner", width: 12 },
      { header: "Боевые", key: "combatTotal", width: 12 },
      { header: "Ложные", key: "falseTotal", width: 12 },
      { header: "Доп. всего", key: "additionalTotal", width: 14 },
      { header: "Доп. ОХ", key: "additionalOh", width: 12 },
      { header: "Доп. Партнеры", key: "additionalPartner", width: 16 },
      { header: "Задержано", key: "detained", width: 12 },
      { header: "Передано", key: "transferred", width: 12 },
    ];

    reasonsSheet.columns = [
      { header: "Город", key: "cityName", width: 18 },
      { header: "Автомобиль", key: "vehicleTitle", width: 24 },
      { header: "Госномер", key: "licensePlate", width: 16 },
      { header: "Причина", key: "reasonName", width: 28 },
      { header: "Всего", key: "total", width: 12 },
      { header: "ОХ", key: "oh", width: 12 },
      { header: "Партнеры", key: "partner", width: 12 },
    ];

    distanceSheet.columns = [
      { header: "Город", key: "cityName", width: 18 },
      { header: "Автомобиль", key: "vehicleTitle", width: 24 },
      { header: "Госномер", key: "licensePlate", width: 16 },
      { header: "Цель поездки", key: "goalName", width: 30 },
      { header: "Пробег", key: "distance", width: 14 },
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
        reasonName: "Дополнительно",
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
      message: "Internal server error",
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
  return date.toLocaleDateString("ru-RU", {
    month: "long",
    year: "numeric",
  });
}

function buildAlarmsExportWhere(req: Request) {
  const cityId = parseNumberExportQuery(req.query.cityId);
  const crewId = parseNumberExportQuery(req.query.crewId);
  const vehicleId = parseNumberExportQuery(req.query.vehicleId);
  const employeeId = parseNumberExportQuery(req.query.employeeId);

  const dateFrom = parseDate(req.query.dateFrom);
  const dateTo = parseDate(req.query.dateTo);

  const search = req.query.search ? String(req.query.search).trim() : "";

  const where: any = {
    deletedAt: null,
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
    title: "Всего сработок",
    total: totals.totalAlarms,
    oh: totals.totalOh,
    partner: totals.totalPartner,
  });

  sheet.addRow({
    title: "Ложные",
    total: totals.falseTotal,
    oh: totals.falseOh,
    partner: totals.falsePartner,
  });

  sheet.addRow({
    title: "Боевые",
    total: totals.combatTotal,
    oh: totals.combatOh,
    partner: totals.combatPartner,
  });

  sheet.addRow({
    title: "Дополнительно",
    total: totals.additionalTotal,
    oh: totals.additionalOh,
    partner: totals.additionalPartner,
  });

  sheet.addRow({
    title: "Задержано",
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
    title: "Смен",
    total: totals.totalShifts,
    oh: "",
    partner: "",
  });

  sheet.addRow({
    title: "Поездок",
    total: totals.totalTrips,
    oh: "",
    partner: "",
  });

  sheet.addRow({
    title: "Пробег",
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
    const where = buildAlarmsExportWhere(req);

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

    const summarySheet = workbook.addWorksheet("Сводка");
    const reasonsSheet = workbook.addWorksheet("Доп. причины");
    const citiesSheet = workbook.addWorksheet("По городам");
    const monthsSheet = workbook.addWorksheet("По месяцам");

    summarySheet.columns = [
      { header: "Показатель", key: "title", width: 28 },
      { header: "Всего", key: "total", width: 14 },
      { header: "ОХ", key: "oh", width: 14 },
      { header: "Партнеры", key: "partner", width: 14 },
    ];

    reasonsSheet.columns = [
      { header: "Причина", key: "reasonName", width: 30 },
      { header: "Всего", key: "total", width: 14 },
      { header: "ОХ", key: "oh", width: 14 },
      { header: "Партнеры", key: "partner", width: 14 },
    ];

    citiesSheet.columns = [
      { header: "Город", key: "name", width: 22 },
      { header: "Всего сработок", key: "totalAlarms", width: 18 },
      { header: "ОХ", key: "totalOh", width: 10 },
      { header: "Партнеры", key: "totalPartner", width: 12 },
      { header: "Боевые", key: "combatTotal", width: 12 },
      { header: "Ложные", key: "falseTotal", width: 12 },
      { header: "Доп. всего", key: "additionalTotal", width: 14 },
      { header: "Доп. ОХ", key: "additionalOh", width: 12 },
      { header: "Доп. Партнеры", key: "additionalPartner", width: 16 },
      { header: "Задержано", key: "detained", width: 12 },
      { header: "Передано", key: "transferred", width: 12 },
      { header: "Смен", key: "totalShifts", width: 10 },
      { header: "Поездок", key: "totalTrips", width: 10 },
      { header: "Пробег", key: "totalDistanceKm", width: 12 },
    ];

    monthsSheet.columns = [
      { header: "Месяц", key: "name", width: 22 },
      { header: "Всего сработок", key: "totalAlarms", width: 18 },
      { header: "ОХ", key: "totalOh", width: 10 },
      { header: "Партнеры", key: "totalPartner", width: 12 },
      { header: "Боевые", key: "combatTotal", width: 12 },
      { header: "Ложные", key: "falseTotal", width: 12 },
      { header: "Доп. всего", key: "additionalTotal", width: 14 },
      { header: "Доп. ОХ", key: "additionalOh", width: 12 },
      { header: "Доп. Партнеры", key: "additionalPartner", width: 16 },
      { header: "Задержано", key: "detained", width: 12 },
      { header: "Передано", key: "transferred", width: 12 },
      { header: "Смен", key: "totalShifts", width: 10 },
      { header: "Поездок", key: "totalTrips", width: 10 },
      { header: "Пробег", key: "totalDistanceKm", width: 12 },
    ];

    addAlarmsSummaryRows(summarySheet, totals);

    reasonsSheet.addRow({
      reasonName: "Дополнительно",
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
      message: "Internal server error",
    });
  }
}
