import type { Request, Response } from "express";
import { prisma } from "../../config/prisma";
import {
  buildCityAccessWhere,
  canAddShiftInCity,
  canDeleteShiftInCity,
  canEditCityData,
  getAllowedCityIds,
  isAdmin,
  isSuperAdmin,
} from "../../utils/admin-access";

type ManualTripEventInput = {
  eventCategory: "REGULAR_ALARM" | "ADDITIONAL_ALARM";

  alarmSource?: "OH" | "PARTNER";
  isCombat?: boolean;

  reasonId?: number | null;
  customReasonText?: string | null;

  ohCount?: number;
  partnerCount?: number;
  countTotal?: number;

  detainedCount?: number;
  transferredCount?: number;

  note?: string | null;
};

type ManualTripInput = {
  fromLocation: string;
  departureTime: string;
  toLocation: string;
  arrivalTime: string;
  arrivalMinutes: number;
  distanceKm: number;
  goalId: number;
  note?: string | null;
  events?: ManualTripEventInput[];
};

function parseDateValue(value: unknown) {
  if (!value || typeof value !== "string") {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function parseNumberValue(value: unknown) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return null;
  }

  return numberValue;
}

function roundNumber(value: number) {
  return Number(value.toFixed(1));
}
function getShiftEquivalent(shift: { shiftDurationHours?: unknown }) {
  const durationHours = Number(shift.shiftDurationHours ?? 24);

  if (!Number.isFinite(durationHours) || durationHours <= 0) {
    return 1;
  }

  return Math.round((durationHours / 24) * 100) / 100;
}
function normalizeEvent(event: ManualTripEventInput) {
  const detainedCount = Math.max(Number(event.detainedCount ?? 0), 0);
  const transferredCount = Math.max(Number(event.transferredCount ?? 0), 0);

  if (event.eventCategory === "REGULAR_ALARM") {
    if (event.alarmSource !== "OH" && event.alarmSource !== "PARTNER") {
      throw new Error("Для обычной сработки нужен alarmSource OH или PARTNER");
    }

    if (typeof event.isCombat !== "boolean") {
      throw new Error("Для обычной сработки нужно указать isCombat");
    }

    return {
      eventCategory: "REGULAR_ALARM",
      alarmSource: event.alarmSource,
      isCombat: event.isCombat,
      countTotal: 1,
      detainedCount,
      transferredCount,
      note: event.note?.trim() || null,
    };
  }

  const ohCount = Math.max(Number(event.ohCount ?? 0), 0);
  const partnerCount = Math.max(Number(event.partnerCount ?? 0), 0);
  const countTotal = ohCount + partnerCount;

  if (countTotal <= 0) {
    throw new Error(
      "Для доп. сработок нужно указать количество ОХ или Партнеров",
    );
  }

  return {
    eventCategory: "ADDITIONAL_ALARM",
    reasonId: event.reasonId || null,
    customReasonText: event.customReasonText?.trim() || null,
    ohCount,
    partnerCount,
    countTotal,
    detainedCount,
    transferredCount,
    note: event.note?.trim() || null,
  };
}

function normalizeTrip(trip: ManualTripInput) {
  const departureTime = parseDateValue(trip.departureTime);
  const arrivalTime = parseDateValue(trip.arrivalTime);

  if (!trip.fromLocation?.trim()) {
    throw new Error("Не заполнено поле Откуда");
  }

  if (!trip.toLocation?.trim()) {
    throw new Error("Не заполнено поле Куда");
  }

  if (!departureTime) {
    throw new Error("Некорректное время выезда");
  }

  if (!arrivalTime) {
    throw new Error("Некорректное время прибытия");
  }

  const arrivalMinutes = parseNumberValue(trip.arrivalMinutes);
  const distanceKm = parseNumberValue(trip.distanceKm);
  const goalId = parseNumberValue(trip.goalId);

  if (arrivalMinutes === null || arrivalMinutes < 0) {
    throw new Error("Некорректное время прибытия в минутах");
  }

  if (distanceKm === null || distanceKm < 0) {
    throw new Error("Некорректное расстояние");
  }

  if (!goalId) {
    throw new Error("Не указана цель поездки");
  }

  return {
    fromLocation: trip.fromLocation.trim(),
    departureTime,
    toLocation: trip.toLocation.trim(),
    arrivalTime,
    arrivalMinutes,
    distanceKm: roundNumber(distanceKm),
    goalId,
    note: trip.note?.trim() || null,
    events: (trip.events ?? []).map(normalizeEvent),
  };
}
function getAdminInfoFromRequest(req: Request) {
  const requestAny = req as any;

  const admin =
    requestAny.admin ||
    requestAny.adminUser ||
    requestAny.user ||
    requestAny.auth ||
    {};

  return {
    adminUserId: Number(admin.id ?? admin.userId ?? admin.adminUserId) || null,
    adminLogin: admin.login ?? null,
    adminName: admin.name ?? null,
  };
}

async function createAdminActionLog(
  req: Request,
  data: {
    action: string;
    entityType: string;
    entityId?: number | null;
    cityId?: number | null;
    description?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  try {
    const adminInfo = getAdminInfoFromRequest(req);

    await prisma.adminActionLog.create({
      data: {
        adminUserId: adminInfo.adminUserId,
        adminLogin: adminInfo.adminLogin,
        adminName: adminInfo.adminName,

        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId ?? null,
        cityId: data.cityId ?? null,

        description: data.description ?? null,
        metadata: data.metadata ?? {},
      } as any,
    });
  } catch (error) {
    console.error("createAdminActionLog error:", error);
  }
}

export async function createManualShift(req: Request, res: Response) {
  try {
    const cityId = parseNumberValue(req.body.cityId);
    const crewId = parseNumberValue(req.body.crewId);
    const vehicleId = parseNumberValue(req.body.vehicleId);
    const driverEmployeeId = parseNumberValue(req.body.driverEmployeeId);
    const seniorEmployeeId = parseNumberValue(req.body.seniorEmployeeId);
    const odometerStart = parseNumberValue(req.body.odometerStart);

    const shiftDate = parseDateValue(req.body.shiftDate);
    const submittedAt = parseDateValue(req.body.submittedAt) ?? new Date();

    if (
      !cityId ||
      !crewId ||
      !vehicleId ||
      !driverEmployeeId ||
      !seniorEmployeeId
    ) {
      return res.status(400).json({
        message: "Не заполнены основные поля смены",
      });
    }
    const canCreateShift = await canAddShiftInCity(req, cityId);

    if (!canCreateShift) {
      return res.status(403).json({
        message: "Недостаточно прав для создания смены в этом городе",
      });
    }
    if (driverEmployeeId === seniorEmployeeId) {
      return res.status(400).json({
        message: "Водитель и старший не могут быть одним сотрудником",
      });
    }

    if (!shiftDate) {
      return res.status(400).json({
        message: "Некорректная дата смены",
      });
    }

    if (odometerStart === null || odometerStart < 0) {
      return res.status(400).json({
        message: "Некорректный спидометр на начало смены",
      });
    }

    if (!Array.isArray(req.body.trips) || req.body.trips.length === 0) {
      return res.status(400).json({
        message: "Добавьте хотя бы одну поездку",
      });
    }

    const trips = req.body.trips.map(normalizeTrip);
    const totalDistanceKm = roundNumber(
      trips.reduce((sum: number, trip: ReturnType<typeof normalizeTrip>) => {
        return sum + trip.distanceKm;
      }, 0),
    );

    const odometerEndCalculated = roundNumber(odometerStart + totalDistanceKm);
    const crew = await prisma.crew.findFirst({
      where: {
        id: crewId,
        cityId,
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        dutyType: true,
        transportType: true,
        durationHours: true,
      },
    });

    if (!crew) {
      return res.status(404).json({
        message: "Наряд не найден или неактивен",
      });
    }

    const shiftDurationHours = Number(crew.durationHours || 24);
    const shift = await prisma.shift.create({
      data: {
        cityId,
        crewId,
        vehicleId,
        driverEmployeeId,
        seniorEmployeeId,

        driverHasWeapon: Boolean(req.body.driverHasWeapon),
        seniorHasWeapon: Boolean(req.body.seniorHasWeapon),

        crewDutyType: crew.dutyType,
        crewTransportType: crew.transportType,
        shiftDurationHours,

        shiftDate,
        submittedAt,

        odometerStart,
        odometerEndCalculated,
        totalDistanceKm,

        trips: {
          create: trips.map((trip: ReturnType<typeof normalizeTrip>) => ({
            cityId,
            goalId: trip.goalId,

            fromLocation: trip.fromLocation,
            departureTime: trip.departureTime,
            toLocation: trip.toLocation,
            arrivalTime: trip.arrivalTime,
            arrivalMinutes: trip.arrivalMinutes,
            distanceKm: trip.distanceKm,
            note: trip.note,

            events: {
              create: trip.events,
            },
          })),
        },
      } as any,
      include: {
        city: true,
        crew: true,
        vehicle: true,
        driverEmployee: true,
        seniorEmployee: true,
        trips: {
          include: {
            goal: true,
            events: true,
          },
        },
      },
    });
    await createAdminActionLog(req, {
      action: "CREATE_SHIFT",
      entityType: "SHIFT",
      entityId: shift.id,
      cityId: shift.cityId,
      description: `Создана смена #${shift.id}`,
      metadata: {
        shiftId: shift.id,
        tripsCount: shift.trips.length,
        totalDistanceKm: shift.totalDistanceKm,
      },
    });
    return res.status(201).json({
      message: "Смена добавлена вручную",
      data: shift,
    });
  } catch (error) {
    console.error("createManualShift error:", error);

    if (error instanceof Error) {
      return res.status(400).json({
        message: error.message,
      });
    }

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

export async function deleteManualShift(req: Request, res: Response) {
  try {
    const shiftId = Number(req.params.id);

    if (!Number.isInteger(shiftId)) {
      return res.status(400).json({
        message: "Invalid shift id",
      });
    }

    const shift = await prisma.shift.findFirst({
      where: {
        id: shiftId,
        deletedAt: null,
      },
    });

    if (!shift) {
      return res.status(404).json({
        message: "Shift not found",
      });
    }
    const canDeleteShift = await canDeleteShiftInCity(req, shift.cityId);

    if (!canDeleteShift) {
      return res.status(403).json({
        message: "Недостаточно прав для удаления смены в этом городе",
      });
    }
    const deleteReason =
      typeof req.body?.reason === "string" && req.body.reason.trim()
        ? req.body.reason.trim()
        : "Причина не указана";

    await prisma.shift.update({
      where: {
        id: shiftId,
      },
      data: {
        deletedAt: new Date(),
      } as any,
    });
    await createAdminActionLog(req, {
      action: "DELETE_SHIFT",
      entityType: "SHIFT",
      entityId: shiftId,
      cityId: shift.cityId,
      description: `Удалена смена #${shiftId}. Причина: ${deleteReason}`,
      metadata: {
        shiftId,
        reason: deleteReason,
      },
    });
    return res.json({
      message: "Смена удалена",
    });
  } catch (error) {
    console.error("deleteManualShift error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

export async function getDeletedManualShifts(req: Request, res: Response) {
  try {
    const page = Math.max(Number(req.query.page ?? 1), 1);
    const pageSizeRaw = Number(req.query.pageSize ?? 20);
    const pageSize = Math.min(Math.max(pageSizeRaw, 10), 100);

    const cityId = parseNumberValue(req.query.cityId);
    const dateFrom = parseDateValue(req.query.dateFrom);
    const dateTo = parseDateValue(req.query.dateTo);
    const search = req.query.search ? String(req.query.search).trim() : "";

    if (!isSuperAdmin(req) && !isAdmin(req)) {
      return res.status(403).json({
        message: "Недостаточно прав для просмотра архива смен",
      });
    }

    const where: any = {
      deletedAt: {
        not: null,
      },
      ...(cityId ? { cityId } : {}),
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
        orderBy: {
          deletedAt: "desc",
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
            select: {
              id: true,
            },
          },
        },
      }),
    ]);

    return res.json({
      filters: {
        page,
        pageSize,
        cityId: cityId ?? null,
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
      data: shifts.map((shift) => ({
        id: shift.id,
        city: shift.city,
        crew: shift.crew,
        vehicle: shift.vehicle,
        driverEmployee: shift.driverEmployee,
        seniorEmployee: shift.seniorEmployee,

        shiftDate: shift.shiftDate,
        submittedAt: shift.submittedAt,
        deletedAt: shift.deletedAt,

        crewDutyType: shift.crewDutyType,
        crewTransportType: shift.crewTransportType,
        shiftDurationHours: Number(shift.shiftDurationHours ?? 24),
        shiftEquivalent: getShiftEquivalent(shift),

        odometerStart: shift.odometerStart,
        odometerEndCalculated: shift.odometerEndCalculated,
        totalDistanceKm: Number(shift.totalDistanceKm),

        tripsCount: shift.trips.length,
      })),
    });
  } catch (error) {
    console.error("getDeletedManualShifts error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

export async function restoreManualShift(req: Request, res: Response) {
  try {
    const shiftId = Number(req.params.id);

    if (!Number.isInteger(shiftId)) {
      return res.status(400).json({
        message: "Invalid shift id",
      });
    }

    const shift = await prisma.shift.findFirst({
      where: {
        id: shiftId,
        deletedAt: {
          not: null,
        },
      },
    });

    if (!shift) {
      return res.status(404).json({
        message: "Deleted shift not found",
      });
    }
    const canRestoreShift = await canDeleteShiftInCity(req, shift.cityId);

    if (!canRestoreShift) {
      return res.status(403).json({
        message: "Недостаточно прав для восстановления смены в этом городе",
      });
    }
    await prisma.shift.update({
      where: {
        id: shiftId,
      },
      data: {
        deletedAt: null,
      } as any,
    });
    await createAdminActionLog(req, {
      action: "RESTORE_SHIFT",
      entityType: "SHIFT",
      entityId: shiftId,
      cityId: shift.cityId,
      description: `Восстановлена смена #${shiftId}`,
      metadata: {
        shiftId,
      },
    });
    return res.json({
      message: "Смена восстановлена",
    });
  } catch (error) {
    console.error("restoreManualShift error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

export async function getManualShiftById(req: Request, res: Response) {
  try {
    const shiftId = Number(req.params.id);

    if (!Number.isInteger(shiftId)) {
      return res.status(400).json({
        message: "Invalid shift id",
      });
    }
    const allowedCityIds = await getAllowedCityIds(req);
    const shift = await prisma.shift.findFirst({
      where: {
        id: shiftId,
        deletedAt: null,
        ...buildCityAccessWhere(allowedCityIds),
      },
      include: {
        city: true,
        crew: true,
        vehicle: true,
        driverEmployee: true,
        seniorEmployee: true,
        trips: {
          where: {
            deletedAt: null,
          },
          orderBy: {
            departureTime: "asc",
          },
          include: {
            goal: true,
            events: {
              include: {
                reason: true,
              },
            },
          },
        },
      },
    });

    if (!shift) {
      return res.status(404).json({
        message: "Shift not found",
      });
    }

    return res.json({
      data: shift,
    });
  } catch (error) {
    console.error("getManualShiftById error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

export async function updateManualShift(req: Request, res: Response) {
  try {
    const shiftId = Number(req.params.id);

    if (!Number.isInteger(shiftId)) {
      return res.status(400).json({
        message: "Invalid shift id",
      });
    }

    const existingShift = await prisma.shift.findFirst({
      where: {
        id: shiftId,
        deletedAt: null,
      },
    });

    if (!existingShift) {
      return res.status(404).json({
        message: "Shift not found",
      });
    }
    const canEditCurrentShift = await canEditCityData(
      req,
      existingShift.cityId,
    );

    if (!canEditCurrentShift) {
      return res.status(403).json({
        message: "Недостаточно прав для редактирования этой смены",
      });
    }
    const cityId = parseNumberValue(req.body.cityId);
    const crewId = parseNumberValue(req.body.crewId);
    const vehicleId = parseNumberValue(req.body.vehicleId);
    const driverEmployeeId = parseNumberValue(req.body.driverEmployeeId);
    const seniorEmployeeId = parseNumberValue(req.body.seniorEmployeeId);
    const odometerStart = parseNumberValue(req.body.odometerStart);

    const shiftDate = parseDateValue(req.body.shiftDate);
    const submittedAt = parseDateValue(req.body.submittedAt) ?? new Date();

    if (
      !cityId ||
      !crewId ||
      !vehicleId ||
      !driverEmployeeId ||
      !seniorEmployeeId
    ) {
      return res.status(400).json({
        message: "Не заполнены основные поля смены",
      });
    }
    const canEditNewShiftCity = await canEditCityData(req, cityId);

    if (!canEditNewShiftCity) {
      return res.status(403).json({
        message: "Недостаточно прав для переноса смены в этот город",
      });
    }

    if (driverEmployeeId === seniorEmployeeId) {
      return res.status(400).json({
        message: "Водитель и старший не могут быть одним сотрудником",
      });
    }

    if (!shiftDate) {
      return res.status(400).json({
        message: "Некорректная дата смены",
      });
    }

    if (odometerStart === null || odometerStart < 0) {
      return res.status(400).json({
        message: "Некорректный спидометр на начало смены",
      });
    }

    if (!Array.isArray(req.body.trips) || req.body.trips.length === 0) {
      return res.status(400).json({
        message: "Добавьте хотя бы одну поездку",
      });
    }

    const trips = req.body.trips.map(normalizeTrip);

    const totalDistanceKm = roundNumber(
      trips.reduce((sum: number, trip: ReturnType<typeof normalizeTrip>) => {
        return sum + trip.distanceKm;
      }, 0),
    );

    const odometerEndCalculated = roundNumber(odometerStart + totalDistanceKm);
    const selectedCrew = await prisma.crew.findFirst({
      where: {
        id: crewId,
        cityId,
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        dutyType: true,
        transportType: true,
        durationHours: true,
      },
    });

    if (!selectedCrew) {
      return res.status(404).json({
        message: "Наряд не найден или неактивен",
      });
    }

    const shouldRefreshCrewSnapshot = selectedCrew.id !== existingShift.crewId;

    const nextCrewDutyType = shouldRefreshCrewSnapshot
      ? selectedCrew.dutyType
      : (existingShift.crewDutyType ?? selectedCrew.dutyType);

    const nextCrewTransportType = shouldRefreshCrewSnapshot
      ? selectedCrew.transportType
      : (existingShift.crewTransportType ?? selectedCrew.transportType);

    const nextShiftDurationHours = shouldRefreshCrewSnapshot
      ? Number(selectedCrew.durationHours ?? 24)
      : Number(
          existingShift.shiftDurationHours ?? selectedCrew.durationHours ?? 24,
        );
    const oldTrips = await prisma.trip.findMany({
      where: {
        shiftId,
      },
      select: {
        id: true,
      },
    });

    const oldTripIds = oldTrips.map((trip) => trip.id);

    const updatedShift = await prisma.$transaction(async (tx) => {
      if (oldTripIds.length > 0) {
        await tx.tripEvent.deleteMany({
          where: {
            tripId: {
              in: oldTripIds,
            },
          },
        });

        await tx.trip.deleteMany({
          where: {
            id: {
              in: oldTripIds,
            },
          },
        });
      }

      return tx.shift.update({
        where: {
          id: shiftId,
        },
        data: {
          cityId,
          crewId,
          vehicleId,
          driverEmployeeId,
          seniorEmployeeId,

          driverHasWeapon: Boolean(req.body.driverHasWeapon),
          seniorHasWeapon: Boolean(req.body.seniorHasWeapon),

          crewDutyType: nextCrewDutyType,
          crewTransportType: nextCrewTransportType,
          shiftDurationHours: nextShiftDurationHours,

          shiftDate,
          submittedAt,

          odometerStart,
          odometerEndCalculated,
          totalDistanceKm,

          trips: {
            create: trips.map((trip: ReturnType<typeof normalizeTrip>) => ({
              cityId,
              goalId: trip.goalId,

              fromLocation: trip.fromLocation,
              departureTime: trip.departureTime,
              toLocation: trip.toLocation,
              arrivalTime: trip.arrivalTime,
              arrivalMinutes: trip.arrivalMinutes,
              distanceKm: trip.distanceKm,
              note: trip.note,

              events: {
                create: trip.events,
              },
            })),
          },
        } as any,
        include: {
          city: true,
          crew: true,
          vehicle: true,
          driverEmployee: true,
          seniorEmployee: true,
          trips: {
            include: {
              goal: true,
              events: true,
            },
          },
        },
      });
    });
    await createAdminActionLog(req, {
      action: "UPDATE_SHIFT",
      entityType: "SHIFT",
      entityId: updatedShift.id,
      cityId: updatedShift.cityId,
      description: `Обновлена смена #${updatedShift.id}`,
      metadata: {
        shiftId: updatedShift.id,
        tripsCount: updatedShift.trips.length,
        totalDistanceKm: updatedShift.totalDistanceKm,
      },
    });
    return res.json({
      message: "Смена обновлена",
      data: updatedShift,
    });
  } catch (error) {
    console.error("updateManualShift error:", error);

    if (error instanceof Error) {
      return res.status(400).json({
        message: error.message,
      });
    }

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}
