import { Request, Response } from "express";
import { prisma } from "../../config/prisma";
import {
  buildCityAccessWhere,
  buildDepartmentAccessWhere,
  getAllowedCityIds,
  getAllowedDepartmentIds,
} from "../../utils/admin-access";

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

function buildReportAccessWhere(allowedCityIds: number[] | null, allowedDepartmentIds: number[] | null) {
  return {
    ...buildCityAccessWhere(allowedCityIds),
    ...buildDepartmentAccessWhere(allowedDepartmentIds),
  };
}

async function getReportScope(req: Request) {
  return {
    allowedCityIds: await getAllowedCityIds(req),
    allowedDepartmentIds: await getAllowedDepartmentIds(req),
  };
}

function departmentSelect() {
  return {
    id: true,
    name: true,
    type: true,
  } as const;
}

type ShiftWithData = Awaited<ReturnType<typeof loadShiftsForReports>>[number];
type ShiftSummaryInput = Pick<
  ShiftWithData,
  "totalDistanceKm" | "shiftDurationHours" | "trips"
>;
async function loadShiftsForReports(params: {
  cityId?: number;
  departmentId?: number;
  dateFrom?: Date;
  dateTo?: Date;
  allowedCityIds?: number[] | null;
  allowedDepartmentIds?: number[] | null;
}) {
  return prisma.shift.findMany({
    where: {
      deletedAt: null,
      ...buildReportAccessWhere(params.allowedCityIds ?? null, params.allowedDepartmentIds ?? null),
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
      city: {
        select: {
          id: true,
          name: true,
        },
      },
      department: {
        select: departmentSelect(),
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
}

function calculateShiftSummary(shift: ShiftSummaryInput) {
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
    {
      total: number;
      oh: number;
      partner: number;
    }
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

          if (event.isCombat) {
            combatOh += 1;
          } else {
            falseOh += 1;
          }
        }

        if (event.alarmSource === "PARTNER") {
          regularPartner += 1;

          if (event.isCombat) {
            combatPartner += 1;
          } else {
            falsePartner += 1;
          }
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
          additionalByReason[reasonName] = {
            total: 0,
            oh: 0,
            partner: 0,
          };
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

    regularOh,
    regularPartner,

    falseTotal: falseOh + falsePartner,
    falseOh,
    falsePartner,

    combatTotal: combatOh + combatPartner,
    combatOh,
    combatPartner,

    additionalTotal: additionalOh + additionalPartner,
    additionalOh,
    additionalPartner,

    additionalByReason,

    detained,
    transferred,

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
      {
        total: number;
        oh: number;
        partner: number;
      }
    >,

    distanceByGoal: {} as Record<string, number>,
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

  for (const [goalName, distance] of Object.entries(summary.distanceByGoal)) {
    totals.distanceByGoal[goalName] =
      (totals.distanceByGoal[goalName] ?? 0) + distance;
  }
}

function roundNumber(value: number) {
  return Math.round(value * 100) / 100;
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

export async function getGeneralReport(req: Request, res: Response) {
  try {
    const cityId = req.query.cityId ? Number(req.query.cityId) : undefined;
    const departmentId = req.query.departmentId ? Number(req.query.departmentId) : undefined;
    const { allowedCityIds, allowedDepartmentIds } = await getReportScope(req);
    const dateFrom = parseDate(req.query.dateFrom);
    const dateTo = parseDate(req.query.dateTo);

    const shifts = await loadShiftsForReports({
      cityId,
      departmentId,
      dateFrom,
      dateTo,
      allowedCityIds,
      allowedDepartmentIds,
    });

    const totals = createEmptyTotals();

    const byCity: Record<
      string,
      ReturnType<typeof createEmptyTotals> & {
        cityId: number;
        cityName: string;
      }
    > = {};

    for (const shift of shifts) {
      const summary = calculateShiftSummary(shift);

      addSummaryToTotals(totals, summary);

      const cityKey = String(shift.city.id);

      if (!byCity[cityKey]) {
        byCity[cityKey] = {
          ...createEmptyTotals(),
          cityId: shift.city.id,
          cityName: shift.city.name,
        };
      }

      addSummaryToTotals(byCity[cityKey], summary);
    }

    return res.json({
      filters: {
        cityId: cityId ?? null,
        departmentId: departmentId ?? null,
        dateFrom: dateFrom ?? null,
        dateTo: dateTo ?? null,
      },
      data: {
        totals: finalizeTotals(totals),
        byCity: Object.values(byCity).map((cityTotals) => ({
          cityId: cityTotals.cityId,
          cityName: cityTotals.cityName,
          ...finalizeTotals(cityTotals),
        })),
      },
    });
  } catch (error) {
    console.error("getGeneralReport error:", error);

    return res.status(500).json({
      message: "Внутрішня помилка сервера",
    });
  }
}

type EmployeeReportRow = ReturnType<typeof createEmployeeReportRow>;

function createEmployeeReportRow(employee: { id: number; fullName: string }) {
  return {
    employeeId: employee.id,
    fullName: employee.fullName,

    totalShifts: 0,
    driverShifts: 0,
    seniorShifts: 0,
    weaponShifts: 0,

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
      {
        total: number;
        oh: number;
        partner: number;
      }
    >,

    distanceByGoal: {} as Record<string, number>,
  };
}

function addSummaryToEmployeeRow(
  row: EmployeeReportRow,
  summary: ReturnType<typeof calculateShiftSummary>,
) {
  row.totalDistanceKm += summary.totalDistanceKm;

  row.totalAlarms += summary.totalAlarms;
  row.totalOh += summary.totalOh;
  row.totalPartner += summary.totalPartner;

  row.falseTotal += summary.falseTotal;
  row.falseOh += summary.falseOh;
  row.falsePartner += summary.falsePartner;

  row.combatTotal += summary.combatTotal;
  row.combatOh += summary.combatOh;
  row.combatPartner += summary.combatPartner;

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
      (row.distanceByGoal[goalName] ?? 0) + distance;
  }
}

function finalizeEmployeeRow(row: EmployeeReportRow) {
  return {
    ...row,
    driverShifts: roundNumber(row.driverShifts),
    seniorShifts: roundNumber(row.seniorShifts),
    weaponShifts: roundNumber(row.weaponShifts),
    totalDistanceKm: roundNumber(row.totalDistanceKm),
    averageAlarmsPerShift:
      row.totalShifts > 0 ? roundNumber(row.totalAlarms / row.totalShifts) : 0,
  };
}

export async function getEmployeesReport(req: Request, res: Response) {
  try {
    const cityId = req.query.cityId ? Number(req.query.cityId) : undefined;
    const departmentId = req.query.departmentId ? Number(req.query.departmentId) : undefined;
    const { allowedCityIds, allowedDepartmentIds } = await getReportScope(req);
    const dateFrom = parseDate(req.query.dateFrom);
    const dateTo = parseDate(req.query.dateTo);

    const shifts = await loadShiftsForReports({
      cityId,
      departmentId,
      dateFrom,
      dateTo,
      allowedCityIds,
      allowedDepartmentIds,
    });

    const employeeMap = new Map<number, EmployeeReportRow>();

    for (const shift of shifts) {
      const summary = calculateShiftSummary(shift);

      const driver = shift.driverEmployee;
      const senior = shift.seniorEmployee;

      if (!employeeMap.has(driver.id)) {
        employeeMap.set(driver.id, createEmployeeReportRow(driver));
      }

      const driverRow = employeeMap.get(driver.id)!;
      driverRow.totalShifts += summary.shiftEquivalent;
      driverRow.driverShifts += summary.shiftEquivalent;

      if (shift.driverHasWeapon) {
        driverRow.weaponShifts += summary.shiftEquivalent;
      }

      addSummaryToEmployeeRow(driverRow, summary);

      if (!employeeMap.has(senior.id)) {
        employeeMap.set(senior.id, createEmployeeReportRow(senior));
      }

      const seniorRow = employeeMap.get(senior.id)!;
      seniorRow.totalShifts += summary.shiftEquivalent;
      seniorRow.seniorShifts += summary.shiftEquivalent;

      if (shift.seniorHasWeapon) {
        seniorRow.weaponShifts += summary.shiftEquivalent;
      }

      addSummaryToEmployeeRow(seniorRow, summary);
    }

    const rows = Array.from(employeeMap.values())
      .map(finalizeEmployeeRow)
      .sort((a, b) => b.totalAlarms - a.totalAlarms);

    return res.json({
      filters: {
        cityId: cityId ?? null,
        departmentId: departmentId ?? null,
        dateFrom: dateFrom ?? null,
        dateTo: dateTo ?? null,
      },
      data: rows,
    });
  } catch (error) {
    console.error("getEmployeesReport error:", error);

    return res.status(500).json({
      message: "Внутрішня помилка сервера",
    });
  }
}

type CrewReportRow = ReturnType<typeof createCrewReportRow>;

function createCrewReportRow(crew: { id: number; name: string }) {
  return {
    crewId: crew.id,
    crewName: crew.name,

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
      {
        total: number;
        oh: number;
        partner: number;
      }
    >,

    distanceByGoal: {} as Record<string, number>,
  };
}

function addSummaryToCrewRow(
  row: CrewReportRow,
  summary: ReturnType<typeof calculateShiftSummary>,
) {
  row.totalShifts += summary.shiftEquivalent;
  row.totalTrips += summary.totalTrips;
  row.totalDistanceKm += summary.totalDistanceKm;

  row.totalAlarms += summary.totalAlarms;
  row.totalOh += summary.totalOh;
  row.totalPartner += summary.totalPartner;

  row.falseTotal += summary.falseTotal;
  row.falseOh += summary.falseOh;
  row.falsePartner += summary.falsePartner;

  row.combatTotal += summary.combatTotal;
  row.combatOh += summary.combatOh;
  row.combatPartner += summary.combatPartner;

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
      (row.distanceByGoal[goalName] ?? 0) + distance;
  }
}

function finalizeCrewRow(row: CrewReportRow) {
  return {
    ...row,
    totalShifts: roundNumber(row.totalShifts),
    totalDistanceKm: roundNumber(row.totalDistanceKm),
    averageAlarmsPerShift:
      row.totalShifts > 0 ? roundNumber(row.totalAlarms / row.totalShifts) : 0,
    averageDistancePerShift:
      row.totalShifts > 0
        ? roundNumber(row.totalDistanceKm / row.totalShifts)
        : 0,
  };
}

export async function getCrewsReport(req: Request, res: Response) {
  try {
    const cityId = req.query.cityId ? Number(req.query.cityId) : undefined;
    const departmentId = req.query.departmentId ? Number(req.query.departmentId) : undefined;
    const { allowedCityIds, allowedDepartmentIds } = await getReportScope(req);
    const dateFrom = parseDate(req.query.dateFrom);
    const dateTo = parseDate(req.query.dateTo);

    const shifts = await loadShiftsForReports({
      cityId,
      departmentId,
      dateFrom,
      dateTo,
      allowedCityIds,
      allowedDepartmentIds,
    });

    const crewMap = new Map<number, CrewReportRow>();

    for (const shift of shifts) {
      const summary = calculateShiftSummary(shift);
      const crew = shift.crew;

      if (!crewMap.has(crew.id)) {
        crewMap.set(crew.id, createCrewReportRow(crew));
      }

      const row = crewMap.get(crew.id)!;
      addSummaryToCrewRow(row, summary);
    }

    const rows = Array.from(crewMap.values())
      .map(finalizeCrewRow)
      .sort((a, b) => b.totalAlarms - a.totalAlarms);

    return res.json({
      filters: {
        cityId: cityId ?? null,
        departmentId: departmentId ?? null,
        dateFrom: dateFrom ?? null,
        dateTo: dateTo ?? null,
      },
      data: rows,
    });
  } catch (error) {
    console.error("getCrewsReport error:", error);

    return res.status(500).json({
      message: "Внутрішня помилка сервера",
    });
  }
}

type VehicleReportRow = ReturnType<typeof createVehicleReportRow>;

function createVehicleReportRow(vehicle: {
  id: number;
  title: string;
  licensePlate: string | null;
}) {
  return {
    vehicleId: vehicle.id,
    vehicleTitle: vehicle.title,
    licensePlate: vehicle.licensePlate,

    totalShifts: 0,
    totalTrips: 0,
    totalDistanceKm: 0,

    averageDistancePerShift: 0,

    odometerStartFirstShift: null as number | null,
    odometerEndLastShift: null as number | null,
    firstShiftDate: null as Date | null,
    lastShiftDate: null as Date | null,

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
      {
        total: number;
        oh: number;
        partner: number;
      }
    >,

    distanceByGoal: {} as Record<string, number>,
  };
}

function addSummaryToVehicleRow(
  row: VehicleReportRow,
  shift: ShiftWithData,
  summary: ReturnType<typeof calculateShiftSummary>,
) {
  row.totalShifts += summary.shiftEquivalent;
  row.totalTrips += summary.totalTrips;
  row.totalDistanceKm += summary.totalDistanceKm;

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

  row.falseTotal += summary.falseTotal;
  row.falseOh += summary.falseOh;
  row.falsePartner += summary.falsePartner;

  row.combatTotal += summary.combatTotal;
  row.combatOh += summary.combatOh;
  row.combatPartner += summary.combatPartner;

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
      (row.distanceByGoal[goalName] ?? 0) + distance;
  }
}

function finalizeVehicleRow(row: VehicleReportRow) {
  return {
    ...row,
    totalShifts: roundNumber(row.totalShifts),
    totalDistanceKm: roundNumber(row.totalDistanceKm),
    averageDistancePerShift:
      row.totalShifts > 0
        ? roundNumber(row.totalDistanceKm / row.totalShifts)
        : 0,
  };
}

export async function getVehiclesReport(req: Request, res: Response) {
  try {
    const cityId = req.query.cityId ? Number(req.query.cityId) : undefined;
    const departmentId = req.query.departmentId ? Number(req.query.departmentId) : undefined;
    const { allowedCityIds, allowedDepartmentIds } = await getReportScope(req);
    const dateFrom = parseDate(req.query.dateFrom);
    const dateTo = parseDate(req.query.dateTo);

    const shifts = await loadShiftsForReports({
      cityId,
      departmentId,
      dateFrom,
      dateTo,
      allowedCityIds,
      allowedDepartmentIds,
    });

    const vehicleMap = new Map<number, VehicleReportRow>();

    for (const shift of shifts) {
      const summary = calculateShiftSummary(shift);
      const vehicle = shift.vehicle;

      if (!vehicleMap.has(vehicle.id)) {
        vehicleMap.set(vehicle.id, createVehicleReportRow(vehicle));
      }

      const row = vehicleMap.get(vehicle.id)!;
      addSummaryToVehicleRow(row, shift, summary);
    }

    const rows = Array.from(vehicleMap.values())
      .map(finalizeVehicleRow)
      .sort((a, b) => b.totalDistanceKm - a.totalDistanceKm);

    return res.json({
      filters: {
        cityId: cityId ?? null,
        departmentId: departmentId ?? null,
        dateFrom: dateFrom ?? null,
        dateTo: dateTo ?? null,
      },
      data: rows,
    });
  } catch (error) {
    console.error("getVehiclesReport error:", error);

    return res.status(500).json({
      message: "Внутрішня помилка сервера",
    });
  }
}
type TripsTableSortBy =
  | "shiftDate"
  | "departureTime"
  | "arrivalTime"
  | "arrivalMinutes"
  | "distanceKm";

function parseNumberQuery(value: unknown) {
  if (!value) return undefined;

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return undefined;
  }

  return numberValue;
}

function parseBooleanQuery(value: unknown) {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function buildTripOrderBy(sortBy: TripsTableSortBy, sortDir: "asc" | "desc") {
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

function mapTripEventForTable(event: any) {
  if (event.eventCategory === "REGULAR_ALARM") {
    return {
      id: event.id,
      eventCategory: event.eventCategory,
      title:
        event.alarmSource === "OH"
          ? "Спрацювання ОХ"
          : event.alarmSource === "PARTNER"
            ? "Спрацювання партнери"
            : "Спрацювання",
      alarmSource: event.alarmSource,
      isCombat: event.isCombat,
      countTotal: event.countTotal ?? 1,
      ohCount: event.alarmSource === "OH" ? 1 : 0,
      partnerCount: event.alarmSource === "PARTNER" ? 1 : 0,
      reasonName: null,
      detainedCount: event.detainedCount ?? 0,
      transferredCount: event.transferredCount ?? 0,
      note: event.note ?? null,
    };
  }

  const ohCount = event.ohCount ?? 0;
  const partnerCount = event.partnerCount ?? 0;

  return {
    id: event.id,
    eventCategory: event.eventCategory,
    title: "Додаткові спрацювання",
    alarmSource: null,
    isCombat: null,
    countTotal: ohCount + partnerCount,
    ohCount,
    partnerCount,
    reasonName: event.reason?.name ?? event.customReasonText ?? "Без причини",
    detainedCount: event.detainedCount ?? 0,
    transferredCount: event.transferredCount ?? 0,
    note: event.note ?? null,
  };
}

function buildTripEventSummary(events: any[]) {
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

function calculateTripEventTotals(events: any[]) {
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
    regularOh,
    regularPartner,
    additionalOh,
    additionalPartner,
    totalOh: regularOh + additionalOh,
    totalPartner: regularPartner + additionalPartner,
    totalAlarms: regularOh + regularPartner + additionalOh + additionalPartner,
    combatTotal,
    falseTotal,
    detained,
    transferred,
  };
}

export async function getTripsTableReport(req: Request, res: Response) {
  try {
    const page = Math.max(parseNumberQuery(req.query.page) ?? 1, 1);
    const pageSizeRaw = parseNumberQuery(req.query.pageSize) ?? 20;
    const pageSize = Math.min(Math.max(pageSizeRaw, 10), 100);

    const sortByRaw = String(req.query.sortBy ?? "departureTime");
    const sortBy: TripsTableSortBy = [
      "shiftDate",
      "departureTime",
      "arrivalTime",
      "arrivalMinutes",
      "distanceKm",
    ].includes(sortByRaw)
      ? (sortByRaw as TripsTableSortBy)
      : "departureTime";

    const sortDir: "asc" | "desc" =
      req.query.sortDir === "asc" ? "asc" : "desc";

    const cityId = parseNumberQuery(req.query.cityId);
    const departmentId = parseNumberQuery(req.query.departmentId);
    const { allowedCityIds, allowedDepartmentIds } = await getReportScope(req);
    const crewId = parseNumberQuery(req.query.crewId);
    const vehicleId = parseNumberQuery(req.query.vehicleId);
    const employeeId = parseNumberQuery(req.query.employeeId);
    const goalId = parseNumberQuery(req.query.goalId);

    const dateFrom = parseDate(req.query.dateFrom);
    const dateTo = parseDate(req.query.dateTo);

    const alarmSourceRaw = req.query.alarmSource
      ? String(req.query.alarmSource)
      : undefined;

    const alarmSource =
      alarmSourceRaw === "OH" || alarmSourceRaw === "PARTNER"
        ? alarmSourceRaw
        : undefined;

    const isCombat = parseBooleanQuery(req.query.isCombat);
    const hasDetained = parseBooleanQuery(req.query.hasDetained);
    const hasTransferred = parseBooleanQuery(req.query.hasTransferred);

    const search = req.query.search ? String(req.query.search).trim() : "";

    const where: any = {
      deletedAt: null,
      shift: {
        deletedAt: null,
        ...buildReportAccessWhere(allowedCityIds, allowedDepartmentIds),
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
      ...(alarmSource || typeof isCombat === "boolean"
        ? {
            events: {
              some: {
                ...(alarmSource ? { alarmSource } : {}),
                ...(typeof isCombat === "boolean" ? { isCombat } : {}),
              },
            },
          }
        : {}),
      ...(hasDetained
        ? {
            events: {
              some: {
                detainedCount: {
                  gt: 0,
                },
              },
            },
          }
        : {}),
      ...(hasTransferred
        ? {
            events: {
              some: {
                transferredCount: {
                  gt: 0,
                },
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

    const [total, trips] = await Promise.all([
      prisma.trip.count({
        where,
      }),

      prisma.trip.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: buildTripOrderBy(sortBy, sortDir) as any,
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
                select: departmentSelect(),
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
      }),
    ]);

    const rows = trips.map((trip) => {
      const totals = calculateTripEventTotals(trip.events);

      return {
        id: trip.id,
        shiftId: trip.shiftId,

        city: trip.city,
        department: trip.shift.department,
        shiftDate: trip.shift.shiftDate,
        submittedAt: trip.shift.submittedAt,

        crew: trip.shift.crew,
        vehicle: trip.shift.vehicle,
        driverEmployee: trip.shift.driverEmployee,
        seniorEmployee: trip.shift.seniorEmployee,

        odometerStart: trip.shift.odometerStart,

        fromLocation: trip.fromLocation,
        departureTime: trip.departureTime,
        toLocation: trip.toLocation,
        arrivalTime: trip.arrivalTime,
        arrivalMinutes: trip.arrivalMinutes,
        distanceKm: toNumber(trip.distanceKm),

        goal: trip.goal,
        note: trip.note,

        eventSummary: buildTripEventSummary(trip.events),
        eventTotals: totals,
        events: trip.events.map(mapTripEventForTable),
      };
    });

    const summary = rows.reduce(
      (acc, row) => {
        acc.totalDistanceKm += row.distanceKm;
        acc.totalAlarms += row.eventTotals.totalAlarms;
        acc.totalOh += row.eventTotals.totalOh;
        acc.totalPartner += row.eventTotals.totalPartner;
        acc.combatTotal += row.eventTotals.combatTotal;
        acc.falseTotal += row.eventTotals.falseTotal;
        acc.additionalOh += row.eventTotals.additionalOh;
        acc.additionalPartner += row.eventTotals.additionalPartner;
        acc.detained += row.eventTotals.detained;
        acc.transferred += row.eventTotals.transferred;

        return acc;
      },
      {
        totalRowsOnPage: rows.length,
        totalDistanceKm: 0,
        totalAlarms: 0,
        totalOh: 0,
        totalPartner: 0,
        combatTotal: 0,
        falseTotal: 0,
        additionalOh: 0,
        additionalPartner: 0,
        detained: 0,
        transferred: 0,
      },
    );

    return res.json({
      filters: {
        page,
        pageSize,
        sortBy,
        sortDir,
        cityId: cityId ?? null,
        departmentId: departmentId ?? null,
        crewId: crewId ?? null,
        vehicleId: vehicleId ?? null,
        employeeId: employeeId ?? null,
        goalId: goalId ?? null,
        dateFrom: dateFrom ?? null,
        dateTo: dateTo ?? null,
        alarmSource: alarmSource ?? null,
        isCombat: typeof isCombat === "boolean" ? isCombat : null,
        hasDetained: hasDetained ?? null,
        hasTransferred: hasTransferred ?? null,
        search,
      },
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      summary,
      data: rows,
    });
  } catch (error) {
    console.error("getTripsTableReport error:", error);

    return res.status(500).json({
      message: "Внутрішня помилка сервера",
    });
  }
}
type ShiftsTableSortBy =
  | "shiftDate"
  | "submittedAt"
  | "totalDistanceKm"
  | "odometerStart"
  | "odometerEndCalculated";

function buildShiftOrderBy(sortBy: ShiftsTableSortBy, sortDir: "asc" | "desc") {
  return {
    [sortBy]: sortDir,
  };
}

export async function getShiftsTableReport(req: Request, res: Response) {
  try {
    const page = Math.max(parseNumberQuery(req.query.page) ?? 1, 1);
    const pageSizeRaw = parseNumberQuery(req.query.pageSize) ?? 20;
    const pageSize = Math.min(Math.max(pageSizeRaw, 10), 100);

    const sortByRaw = String(req.query.sortBy ?? "shiftDate");
    const sortBy: ShiftsTableSortBy = [
      "shiftDate",
      "submittedAt",
      "totalDistanceKm",
      "odometerStart",
      "odometerEndCalculated",
    ].includes(sortByRaw)
      ? (sortByRaw as ShiftsTableSortBy)
      : "shiftDate";

    const sortDir: "asc" | "desc" =
      req.query.sortDir === "asc" ? "asc" : "desc";

    const cityId = parseNumberQuery(req.query.cityId);
    const departmentId = parseNumberQuery(req.query.departmentId);
    const { allowedCityIds, allowedDepartmentIds } = await getReportScope(req);
    const crewId = parseNumberQuery(req.query.crewId);
    const vehicleId = parseNumberQuery(req.query.vehicleId);
    const employeeId = parseNumberQuery(req.query.employeeId);

    const dateFrom = parseDate(req.query.dateFrom);
    const dateTo = parseDate(req.query.dateTo);

    const search = req.query.search ? String(req.query.search).trim() : "";

    const where: any = {
      deletedAt: null,
      ...buildReportAccessWhere(allowedCityIds, allowedDepartmentIds),
      ...(cityId ? { cityId } : {}),
      ...(departmentId ? { departmentId } : {}),
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

    const [total, shifts] = await Promise.all([
      prisma.shift.count({
        where,
      }),

      prisma.shift.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: buildShiftOrderBy(sortBy, sortDir),
        include: {
          city: {
            select: {
              id: true,
              name: true,
            },
          },
          department: {
            select: departmentSelect(),
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
      }),
    ]);

    const rows = shifts.map((shift) => {
      const summary = calculateShiftSummary(shift);

      return {
        id: shift.id,

        city: shift.city,
        department: shift.department,
        shiftDate: shift.shiftDate,
        submittedAt: shift.submittedAt,

        crew: shift.crew,
        vehicle: shift.vehicle,
        driverEmployee: shift.driverEmployee,
        seniorEmployee: shift.seniorEmployee,

        driverHasWeapon: shift.driverHasWeapon,
        seniorHasWeapon: shift.seniorHasWeapon,

        odometerStart: shift.odometerStart,
        odometerEndCalculated: shift.odometerEndCalculated,
        totalDistanceKm: toNumber(shift.totalDistanceKm),

        crewDutyType: shift.crewDutyType,
        crewTransportType: shift.crewTransportType,
        shiftDurationHours: Number(shift.shiftDurationHours ?? 24),
        shiftEquivalent: summary.shiftEquivalent,

        summary,

        trips: shift.trips.map((trip) => ({
          id: trip.id,
          fromLocation: trip.fromLocation,
          departureTime: trip.departureTime,
          toLocation: trip.toLocation,
          arrivalTime: trip.arrivalTime,
          arrivalMinutes: trip.arrivalMinutes,
          distanceKm: toNumber(trip.distanceKm),
          goal: trip.goal,
          note: trip.note,
          eventSummary: buildTripEventSummary(trip.events),
          eventTotals: calculateTripEventTotals(trip.events),
          events: trip.events.map(mapTripEventForTable),
        })),
      };
    });

    const summary = rows.reduce(
      (acc, row) => {
        acc.totalRowsOnPage += 1;
        acc.totalShiftEquivalent += row.shiftEquivalent;
        acc.totalTrips += row.summary.totalTrips;
        acc.totalDistanceKm += row.summary.totalDistanceKm;
        acc.totalAlarms += row.summary.totalAlarms;
        acc.totalOh += row.summary.totalOh;
        acc.totalPartner += row.summary.totalPartner;
        acc.combatTotal += row.summary.combatTotal;
        acc.falseTotal += row.summary.falseTotal;
        acc.additionalTotal += row.summary.additionalTotal;
        acc.detained += row.summary.detained;
        acc.transferred += row.summary.transferred;

        return acc;
      },
      {
        totalRowsOnPage: 0,
        totalShiftEquivalent: 0,
        totalTrips: 0,
        totalDistanceKm: 0,
        totalAlarms: 0,
        totalOh: 0,
        totalPartner: 0,
        combatTotal: 0,
        falseTotal: 0,
        additionalTotal: 0,
        detained: 0,
        transferred: 0,
      },
    );

    return res.json({
      filters: {
        page,
        pageSize,
        sortBy,
        sortDir,
        cityId: cityId ?? null,
        departmentId: departmentId ?? null,
        crewId: crewId ?? null,
        vehicleId: vehicleId ?? null,
        employeeId: employeeId ?? null,
        dateFrom: dateFrom ?? null,
        dateTo: dateTo ?? null,
        search,
      },
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      summary,
      data: rows,
    });
  } catch (error) {
    console.error("getShiftsTableReport error:", error);

    return res.status(500).json({
      message: "Внутрішня помилка сервера",
    });
  }
}

type EmployeesTableSortBy =
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

type EmployeeTableReportRow = {
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

function createEmployeeTableReportRow(params: {
  employeeId: number;
  fullName: string;
  cityId: number;
  cityName: string;
}): EmployeeTableReportRow {
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

function addShiftSummaryToEmployeeTableRow(
  row: EmployeeTableReportRow,
  summary: ReturnType<typeof calculateShiftSummary>,
) {
  row.totalTrips += summary.totalTrips;
  row.totalDistanceKm += summary.totalDistanceKm;

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
function addPostDutyToEmployeeTableRow(
  row: EmployeeTableReportRow,
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
function sortEmployeeTableReportRows(
  rows: EmployeeTableReportRow[],
  sortBy: EmployeesTableSortBy,
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

export async function getEmployeesTableReport(req: Request, res: Response) {
  try {
    const page = Math.max(parseNumberQuery(req.query.page) ?? 1, 1);
    const pageSizeRaw = parseNumberQuery(req.query.pageSize) ?? 20;
    const pageSize = Math.min(Math.max(pageSizeRaw, 10), 100);

    const sortByRaw = String(req.query.sortBy ?? "totalAlarms");

    const sortBy: EmployeesTableSortBy = [
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
      ? (sortByRaw as EmployeesTableSortBy)
      : "totalAlarms";

    const sortDir: "asc" | "desc" =
      req.query.sortDir === "asc" ? "asc" : "desc";

    const cityId = parseNumberQuery(req.query.cityId);
    const departmentId = parseNumberQuery(req.query.departmentId);
    const { allowedCityIds, allowedDepartmentIds } = await getReportScope(req);
    const crewId = parseNumberQuery(req.query.crewId);
    const vehicleId = parseNumberQuery(req.query.vehicleId);
    const employeeId = parseNumberQuery(req.query.employeeId);

    const dateFrom = parseDate(req.query.dateFrom);
    const dateTo = parseDate(req.query.dateTo);

    const search = req.query.search ? String(req.query.search).trim() : "";

    const where: any = {
      deletedAt: null,
      ...buildReportAccessWhere(allowedCityIds, allowedDepartmentIds),
      ...(cityId ? { cityId } : {}),
      ...(departmentId ? { departmentId } : {}),
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
    const postDuties = await prisma.postDuty.findMany({
      where: {
        deletedAt: null,

        ...(cityId ? { cityId } : {}),

        ...(vehicleId ? { vehicleId } : {}),

        ...(crewId
          ? {
              id: -1,
            }
          : {}),

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
    const employeeMap = new Map<string, EmployeeTableReportRow>();

    for (const shift of shifts) {
      const summary = calculateShiftSummary(shift);

      const driver = shift.driverEmployee;
      const senior = shift.seniorEmployee;

      const driverKey = `${driver.id}_${shift.city.id}`;

      if (!employeeMap.has(driverKey)) {
        employeeMap.set(
          driverKey,
          createEmployeeTableReportRow({
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

      addShiftSummaryToEmployeeTableRow(driverRow, summary);

      const seniorKey = `${senior.id}_${shift.city.id}`;

      if (!employeeMap.has(seniorKey)) {
        employeeMap.set(
          seniorKey,
          createEmployeeTableReportRow({
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

      addShiftSummaryToEmployeeTableRow(seniorRow, summary);
    }
    for (const duty of postDuties) {
      const durationHours = Number(duty.durationHours);

      for (const member of duty.members) {
        const employee = member.employee;
        const employeeKey = `${employee.id}_${duty.city.id}`;

        if (!employeeMap.has(employeeKey)) {
          employeeMap.set(
            employeeKey,
            createEmployeeTableReportRow({
              employeeId: employee.id,
              fullName: employee.fullName,
              cityId: duty.city.id,
              cityName: duty.city.name,
            }),
          );
        }

        const row = employeeMap.get(employeeKey)!;

        addPostDutyToEmployeeTableRow(row, {
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

    const sortedRows = sortEmployeeTableReportRows(
      filteredRows,
      sortBy,
      sortDir,
    );

    const total = sortedRows.length;
    const paginatedRows = sortedRows.slice(
      (page - 1) * pageSize,
      page * pageSize,
    );

    const summary = filteredRows.reduce(
      (acc, row) => {
        acc.totalEmployees += 1;
        acc.totalShifts += row.totalShifts;
        acc.driverShifts += row.driverShifts;
        acc.seniorShifts += row.seniorShifts;
        acc.weaponShifts += row.weaponShifts;
        acc.postDutyShiftEquivalent += row.postDutyShiftEquivalent;
        acc.postDutyHours += row.postDutyHours;
        acc.postDutyCount += row.postDutyCount;
        acc.totalAlarms += row.totalAlarms;
        acc.totalOh += row.totalOh;
        acc.totalPartner += row.totalPartner;
        acc.combatTotal += row.combatTotal;
        acc.falseTotal += row.falseTotal;
        acc.additionalTotal += row.additionalTotal;
        acc.detained += row.detained;
        acc.transferred += row.transferred;
        acc.totalDistanceKm += row.totalDistanceKm;

        return acc;
      },
      {
        totalEmployees: 0,
        totalShifts: 0,
        driverShifts: 0,
        seniorShifts: 0,
        weaponShifts: 0,
        postDutyShiftEquivalent: 0,
        postDutyHours: 0,
        postDutyCount: 0,
        totalAlarms: 0,
        totalOh: 0,
        totalPartner: 0,
        combatTotal: 0,
        falseTotal: 0,
        additionalTotal: 0,
        detained: 0,
        transferred: 0,
        totalDistanceKm: 0,
      },
    );

    return res.json({
      filters: {
        page,
        pageSize,
        sortBy,
        sortDir,
        cityId: cityId ?? null,
        departmentId: departmentId ?? null,
        crewId: crewId ?? null,
        vehicleId: vehicleId ?? null,
        employeeId: employeeId ?? null,
        dateFrom: dateFrom ?? null,
        dateTo: dateTo ?? null,
        search,
      },
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      summary: {
        ...summary,
        totalShifts: roundNumber(summary.totalShifts),
        driverShifts: roundNumber(summary.driverShifts),
        seniorShifts: roundNumber(summary.seniorShifts),
        weaponShifts: roundNumber(summary.weaponShifts),
        postDutyShiftEquivalent: roundNumber(summary.postDutyShiftEquivalent),
        postDutyHours: roundNumber(summary.postDutyHours),
        totalDistanceKm: roundNumber(summary.totalDistanceKm),
      },
      data: paginatedRows,
    });
  } catch (error) {
    console.error("getEmployeesTableReport error:", error);

    return res.status(500).json({
      message: "Внутрішня помилка сервера",
    });
  }
}

type CrewsTableSortBy =
  | "crewName"
  | "totalShifts"
  | "totalTrips"
  | "totalAlarms"
  | "averageAlarmsPerShift"
  | "averageDistancePerShift"
  | "totalDistanceKm"
  | "detained"
  | "transferred";

type CrewTableReportRow = {
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

function createCrewTableReportRow(params: {
  crewId: number;
  crewName: string;
  cityId: number;
  cityName: string;
}): CrewTableReportRow {
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

function addShiftSummaryToCrewTableRow(
  row: CrewTableReportRow,
  summary: ReturnType<typeof calculateShiftSummary>,
) {
  row.totalShifts += summary.shiftEquivalent;
  row.totalTrips += summary.totalTrips;
  row.totalDistanceKm += summary.totalDistanceKm;

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
      (row.distanceByGoal[goalName] ?? 0) + distance;
  }
}

function sortCrewTableReportRows(
  rows: CrewTableReportRow[],
  sortBy: CrewsTableSortBy,
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

export async function getCrewsTableReport(req: Request, res: Response) {
  try {
    const page = Math.max(parseNumberQuery(req.query.page) ?? 1, 1);
    const pageSizeRaw = parseNumberQuery(req.query.pageSize) ?? 20;
    const pageSize = Math.min(Math.max(pageSizeRaw, 10), 100);

    const sortByRaw = String(req.query.sortBy ?? "totalAlarms");

    const sortBy: CrewsTableSortBy = [
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
      ? (sortByRaw as CrewsTableSortBy)
      : "totalAlarms";

    const sortDir: "asc" | "desc" =
      req.query.sortDir === "asc" ? "asc" : "desc";

    const cityId = parseNumberQuery(req.query.cityId);
    const departmentId = parseNumberQuery(req.query.departmentId);
    const { allowedCityIds, allowedDepartmentIds } = await getReportScope(req);
    const crewId = parseNumberQuery(req.query.crewId);
    const vehicleId = parseNumberQuery(req.query.vehicleId);
    const employeeId = parseNumberQuery(req.query.employeeId);

    const dateFrom = parseDate(req.query.dateFrom);
    const dateTo = parseDate(req.query.dateTo);

    const search = req.query.search ? String(req.query.search).trim() : "";

    const where: any = {
      deletedAt: null,
      ...buildReportAccessWhere(allowedCityIds, allowedDepartmentIds),
      ...(cityId ? { cityId } : {}),
      ...(departmentId ? { departmentId } : {}),
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

    const crewMap = new Map<string, CrewTableReportRow>();

    for (const shift of shifts) {
      const summary = calculateShiftSummary(shift);
      const crew = shift.crew;

      const crewKey = `${crew.id}_${shift.city.id}`;

      if (!crewMap.has(crewKey)) {
        crewMap.set(
          crewKey,
          createCrewTableReportRow({
            crewId: crew.id,
            crewName: crew.name,
            cityId: shift.city.id,
            cityName: shift.city.name,
          }),
        );
      }

      const row = crewMap.get(crewKey)!;
      addShiftSummaryToCrewTableRow(row, summary);
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

    const sortedRows = sortCrewTableReportRows(rows, sortBy, sortDir);

    const total = sortedRows.length;
    const paginatedRows = sortedRows.slice(
      (page - 1) * pageSize,
      page * pageSize,
    );

    const summary = rows.reduce(
      (acc, row) => {
        acc.totalCrews += 1;
        acc.totalShifts += row.totalShifts;
        acc.totalTrips += row.totalTrips;
        acc.totalAlarms += row.totalAlarms;
        acc.totalOh += row.totalOh;
        acc.totalPartner += row.totalPartner;
        acc.combatTotal += row.combatTotal;
        acc.falseTotal += row.falseTotal;
        acc.additionalTotal += row.additionalTotal;
        acc.detained += row.detained;
        acc.transferred += row.transferred;
        acc.totalDistanceKm += row.totalDistanceKm;

        return acc;
      },
      {
        totalCrews: 0,
        totalShifts: 0,
        totalTrips: 0,
        totalAlarms: 0,
        totalOh: 0,
        totalPartner: 0,
        combatTotal: 0,
        falseTotal: 0,
        additionalTotal: 0,
        detained: 0,
        transferred: 0,
        totalDistanceKm: 0,
      },
    );

    return res.json({
      filters: {
        page,
        pageSize,
        sortBy,
        sortDir,
        cityId: cityId ?? null,
        departmentId: departmentId ?? null,
        crewId: crewId ?? null,
        vehicleId: vehicleId ?? null,
        employeeId: employeeId ?? null,
        dateFrom: dateFrom ?? null,
        dateTo: dateTo ?? null,
        search,
      },
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      summary: {
        ...summary,
        totalDistanceKm: roundNumber(summary.totalDistanceKm),
      },
      data: paginatedRows,
    });
  } catch (error) {
    console.error("getCrewsTableReport error:", error);

    return res.status(500).json({
      message: "Внутрішня помилка сервера",
    });
  }
}

type VehiclesTableSortBy =
  | "vehicleTitle"
  | "totalShifts"
  | "totalTrips"
  | "totalAlarms"
  | "averageDistancePerShift"
  | "totalDistanceKm"
  | "detained"
  | "transferred";

type VehicleTableReportRow = {
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

function createVehicleTableReportRow(params: {
  vehicleId: number;
  vehicleTitle: string;
  licensePlate: string | null;
  cityId: number;
  cityName: string;
}): VehicleTableReportRow {
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

function addShiftSummaryToVehicleTableRow(
  row: VehicleTableReportRow,
  shift: any,
  summary: ReturnType<typeof calculateShiftSummary>,
) {
  row.totalShifts += summary.shiftEquivalent;
  row.totalTrips += summary.totalTrips;
  row.totalDistanceKm += summary.totalDistanceKm;

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
      (row.distanceByGoal[goalName] ?? 0) + distance;
  }
}

function sortVehicleTableReportRows(
  rows: VehicleTableReportRow[],
  sortBy: VehiclesTableSortBy,
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

export async function getVehiclesTableReport(req: Request, res: Response) {
  try {
    const page = Math.max(parseNumberQuery(req.query.page) ?? 1, 1);
    const pageSizeRaw = parseNumberQuery(req.query.pageSize) ?? 20;
    const pageSize = Math.min(Math.max(pageSizeRaw, 10), 100);

    const sortByRaw = String(req.query.sortBy ?? "totalDistanceKm");

    const sortBy: VehiclesTableSortBy = [
      "vehicleTitle",
      "totalShifts",
      "totalTrips",
      "totalAlarms",
      "averageDistancePerShift",
      "totalDistanceKm",
      "detained",
      "transferred",
    ].includes(sortByRaw)
      ? (sortByRaw as VehiclesTableSortBy)
      : "totalDistanceKm";

    const sortDir: "asc" | "desc" =
      req.query.sortDir === "asc" ? "asc" : "desc";

    const cityId = parseNumberQuery(req.query.cityId);
    const departmentId = parseNumberQuery(req.query.departmentId);
    const { allowedCityIds, allowedDepartmentIds } = await getReportScope(req);
    const crewId = parseNumberQuery(req.query.crewId);
    const vehicleId = parseNumberQuery(req.query.vehicleId);
    const employeeId = parseNumberQuery(req.query.employeeId);

    const dateFrom = parseDate(req.query.dateFrom);
    const dateTo = parseDate(req.query.dateTo);

    const search = req.query.search ? String(req.query.search).trim() : "";

    const where: any = {
      deletedAt: null,
      ...buildReportAccessWhere(allowedCityIds, allowedDepartmentIds),
      ...(cityId ? { cityId } : {}),
      ...(departmentId ? { departmentId } : {}),
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
    const shouldShowEmptyVehicles = !crewId && !employeeId;

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

    const vehicleMap = new Map<string, VehicleTableReportRow>();

    for (const vehicle of vehiclesFromDirectory) {
      const vehicleKey = `${vehicle.id}_${vehicle.city.id}`;

      vehicleMap.set(
        vehicleKey,
        createVehicleTableReportRow({
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
          createVehicleTableReportRow({
            vehicleId: vehicle.id,
            vehicleTitle: vehicle.title,
            licensePlate: vehicle.licensePlate,
            cityId: shift.city.id,
            cityName: shift.city.name,
          }),
        );
      }

      const row = vehicleMap.get(vehicleKey)!;
      addShiftSummaryToVehicleTableRow(row, shift, summary);
    }

    const rows = Array.from(vehicleMap.values()).map((row) => ({
      ...row,
      totalDistanceKm: roundNumber(row.totalDistanceKm),
      averageDistancePerShift:
        row.totalShifts > 0
          ? roundNumber(row.totalDistanceKm / row.totalShifts)
          : 0,
    }));

    const sortedRows = sortVehicleTableReportRows(rows, sortBy, sortDir);

    const total = sortedRows.length;
    const paginatedRows = sortedRows.slice(
      (page - 1) * pageSize,
      page * pageSize,
    );

    const summary = rows.reduce(
      (acc, row) => {
        acc.totalVehicles += 1;
        acc.totalShifts += row.totalShifts;
        acc.totalTrips += row.totalTrips;
        acc.totalAlarms += row.totalAlarms;
        acc.totalOh += row.totalOh;
        acc.totalPartner += row.totalPartner;
        acc.combatTotal += row.combatTotal;
        acc.falseTotal += row.falseTotal;
        acc.additionalTotal += row.additionalTotal;
        acc.detained += row.detained;
        acc.transferred += row.transferred;
        acc.totalDistanceKm += row.totalDistanceKm;

        return acc;
      },
      {
        totalVehicles: 0,
        totalShifts: 0,
        totalTrips: 0,
        totalAlarms: 0,
        totalOh: 0,
        totalPartner: 0,
        combatTotal: 0,
        falseTotal: 0,
        additionalTotal: 0,
        detained: 0,
        transferred: 0,
        totalDistanceKm: 0,
      },
    );

    return res.json({
      filters: {
        page,
        pageSize,
        sortBy,
        sortDir,
        cityId: cityId ?? null,
        departmentId: departmentId ?? null,
        crewId: crewId ?? null,
        vehicleId: vehicleId ?? null,
        employeeId: employeeId ?? null,
        dateFrom: dateFrom ?? null,
        dateTo: dateTo ?? null,
        search,
      },
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      summary: {
        ...summary,
        totalDistanceKm: roundNumber(summary.totalDistanceKm),
      },
      data: paginatedRows,
    });
  } catch (error) {
    console.error("getVehiclesTableReport error:", error);

    return res.status(500).json({
      message: "Внутрішня помилка сервера",
    });
  }
}

type AlarmReportTotals = {
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

type AlarmReasonStats = {
  total: number;
  oh: number;
  partner: number;
};

type AlarmReportGroupRow = AlarmReportTotals & {
  key: string;
  name: string;
};

function createAlarmReportTotals(): AlarmReportTotals {
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

function createAlarmReportGroupRow(params: {
  key: string;
  name: string;
}): AlarmReportGroupRow {
  return {
    key: params.key,
    name: params.name,
    ...createAlarmReportTotals(),
  };
}

function addShiftSummaryToAlarmTotals(
  totals: AlarmReportTotals,
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

function addAdditionalReasonsToMap(
  map: Map<string, AlarmReasonStats>,
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

function getMonthKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

function getMonthName(date: Date) {
  return date.toLocaleDateString("uk-UA", {
    month: "long",
    year: "numeric",
  });
}

export async function getAlarmsReport(req: Request, res: Response) {
  try {
    const cityId = parseNumberQuery(req.query.cityId);
    const departmentId = parseNumberQuery(req.query.departmentId);
    const { allowedCityIds, allowedDepartmentIds } = await getReportScope(req);
    const crewId = parseNumberQuery(req.query.crewId);
    const vehicleId = parseNumberQuery(req.query.vehicleId);
    const employeeId = parseNumberQuery(req.query.employeeId);

    const dateFrom = parseDate(req.query.dateFrom);
    const dateTo = parseDate(req.query.dateTo);

    const search = req.query.search ? String(req.query.search).trim() : "";

    const where: any = {
      deletedAt: null,
      ...buildReportAccessWhere(allowedCityIds, allowedDepartmentIds),
      ...(cityId ? { cityId } : {}),
      ...(departmentId ? { departmentId } : {}),
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

    const totals = createAlarmReportTotals();

    const byCityMap = new Map<string, AlarmReportGroupRow>();
    const byMonthMap = new Map<string, AlarmReportGroupRow>();
    const additionalByReasonMap = new Map<string, AlarmReasonStats>();

    for (const shift of shifts) {
      const summary = calculateShiftSummary(shift);

      addShiftSummaryToAlarmTotals(totals, summary);
      addAdditionalReasonsToMap(additionalByReasonMap, summary);

      const cityKey = String(shift.city.id);

      if (!byCityMap.has(cityKey)) {
        byCityMap.set(
          cityKey,
          createAlarmReportGroupRow({
            key: cityKey,
            name: shift.city.name,
          }),
        );
      }

      addShiftSummaryToAlarmTotals(byCityMap.get(cityKey)!, summary);

      const monthKey = getMonthKey(shift.shiftDate);

      if (!byMonthMap.has(monthKey)) {
        byMonthMap.set(
          monthKey,
          createAlarmReportGroupRow({
            key: monthKey,
            name: getMonthName(shift.shiftDate),
          }),
        );
      }

      addShiftSummaryToAlarmTotals(byMonthMap.get(monthKey)!, summary);
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

    return res.json({
      filters: {
        cityId: cityId ?? null,
        departmentId: departmentId ?? null,
        crewId: crewId ?? null,
        vehicleId: vehicleId ?? null,
        employeeId: employeeId ?? null,
        dateFrom: dateFrom ?? null,
        dateTo: dateTo ?? null,
        search,
      },
      data: {
        totals: {
          ...totals,
          totalDistanceKm: roundNumber(totals.totalDistanceKm),
        },
        additionalByReason,
        byCity,
        byMonth,
      },
    });
  } catch (error) {
    console.error("getAlarmsReport error:", error);

    return res.status(500).json({
      message: "Внутрішня помилка сервера",
    });
  }
}
