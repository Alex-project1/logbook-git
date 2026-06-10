import { Request, Response } from "express";
import { z } from "zod";
import {
  AlarmSource,
  AppSyncStatus,
  ShiftSourceType,
  TripEventCategory,
} from "@prisma/client";
import { prisma } from "../../config/prisma";
function toNumber(value: unknown) {
  return Number(value ?? 0);
}
function roundNumber(value: number) {
  return Math.round(value * 100) / 100;
}

function getShiftEquivalent(shift: { shiftDurationHours?: unknown }) {
  const durationHours = Number(shift.shiftDurationHours ?? 24);

  if (!Number.isFinite(durationHours) || durationHours <= 0) {
    return 1;
  }

  return roundNumber(durationHours / 24);
}
function calculateShiftSummary(shift: any) {
  let totalTrips = 0;

  let totalDistanceKm = toNumber(shift.totalDistanceKm);

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

  for (const trip of shift.trips ?? []) {
    totalTrips += 1;

    const goalName = trip.goal?.name ?? "Без цели";
    distanceByGoal[goalName] =
      (distanceByGoal[goalName] ?? 0) + toNumber(trip.distanceKm);

    for (const event of trip.events ?? []) {
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
          event.reason?.name ?? event.customReasonText ?? "Без причины";

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

function mapShiftForList(shift: any) {
  return {
    id: shift.id,
    localShiftId: shift.localShiftId,
    sourceType: shift.sourceType,

    city: shift.city,
    crew: shift.crew,
    vehicle: shift.vehicle,
    driverEmployee: shift.driverEmployee,
    driverHasWeapon: shift.driverHasWeapon,
    seniorEmployee: shift.seniorEmployee,
    seniorHasWeapon: shift.seniorHasWeapon,

    shiftDate: shift.shiftDate,
    submittedAt: shift.submittedAt,

    odometerStart: shift.odometerStart,
    totalDistanceKm: toNumber(shift.totalDistanceKm),
    odometerEndCalculated: shift.odometerEndCalculated,

    createdAt: shift.createdAt,
    updatedAt: shift.updatedAt,

    summary: calculateShiftSummary(shift),

    crewDutyType: shift.crewDutyType,
    crewTransportType: shift.crewTransportType,
    shiftDurationHours: Number(shift.shiftDurationHours ?? 24),
    shiftEquivalent: getShiftEquivalent(shift),
  };
}

export async function getAdminShifts(req: Request, res: Response) {
  try {
    const cityId = req.query.cityId ? Number(req.query.cityId) : undefined;
    const crewId = req.query.crewId ? Number(req.query.crewId) : undefined;
    const vehicleId = req.query.vehicleId
      ? Number(req.query.vehicleId)
      : undefined;
    const employeeId = req.query.employeeId
      ? Number(req.query.employeeId)
      : undefined;

    const dateFrom = req.query.dateFrom
      ? new Date(String(req.query.dateFrom))
      : undefined;
    const dateTo = req.query.dateTo
      ? new Date(String(req.query.dateTo))
      : undefined;

    const shifts = await prisma.shift.findMany({
      where: {
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
      },
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

    return res.json({
      data: shifts.map(mapShiftForList),
    });
  } catch (error) {
    console.error("getAdminShifts error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

export async function getAdminShiftById(req: Request, res: Response) {
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

    if (!shift) {
      return res.status(404).json({
        message: "Shift not found",
      });
    }

    return res.json({
      data: mapShiftForList(shift),
    });
  } catch (error) {
    console.error("getAdminShiftById error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

const deleteShiftSchema = z.object({
  deleteReason: z.string().optional().nullable(),
});

export async function deleteAdminShift(req: Request, res: Response) {
  try {
    const shiftId = Number(req.params.id);

    if (!Number.isInteger(shiftId)) {
      return res.status(400).json({
        message: "Invalid shift id",
      });
    }

    const parsed = deleteShiftSchema.safeParse(req.body ?? {});

    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation error",
        errors: parsed.error.flatten(),
      });
    }

    const shift = await prisma.shift.findFirst({
      where: {
        id: shiftId,
        deletedAt: null,
      },
      include: {
        trips: {
          where: {
            deletedAt: null,
          },
        },
      },
    });

    if (!shift) {
      return res.status(404).json({
        message: "Shift not found",
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.shift.update({
        where: {
          id: shiftId,
        },
        data: {
          deletedAt: new Date(),
          deletedBy: req.user?.id ?? null,
          deleteReason: parsed.data.deleteReason ?? null,
        },
      });

      await tx.trip.updateMany({
        where: {
          shiftId,
          deletedAt: null,
        },
        data: {
          deletedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          userId: req.user?.id ?? null,
          action: "DELETE_SHIFT",
          entityType: "shift",
          entityId: shiftId,
          oldValue: {
            cityId: shift.cityId,
            shiftDate: shift.shiftDate,
            crewId: shift.crewId,
            vehicleId: shift.vehicleId,
            driverEmployeeId: shift.driverEmployeeId,
            seniorEmployeeId: shift.seniorEmployeeId,
            tripsCount: shift.trips.length,
          },
          newValue: {
            deletedAt: new Date(),
            deleteReason: parsed.data.deleteReason ?? null,
          },
        },
      });
    });

    return res.json({
      message: "Shift deleted successfully",
    });
  } catch (error) {
    console.error("deleteAdminShift error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

export async function getAdminTrips(req: Request, res: Response) {
  try {
    const cityId = req.query.cityId ? Number(req.query.cityId) : undefined;
    const shiftId = req.query.shiftId ? Number(req.query.shiftId) : undefined;
    const goalId = req.query.goalId ? Number(req.query.goalId) : undefined;

    const trips = await prisma.trip.findMany({
      where: {
        deletedAt: null,
        ...(cityId ? { cityId } : {}),
        ...(shiftId ? { shiftId } : {}),
        ...(goalId ? { goalId } : {}),
        shift: {
          deletedAt: null,
        },
      },
      orderBy: {
        departureTime: "desc",
      },
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
            odometerStart: true,
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

    const data = trips.map((trip) => ({
      id: trip.id,
      shiftId: trip.shiftId,
      city: trip.city,
      shift: trip.shift,

      fromLocation: trip.fromLocation,
      departureTime: trip.departureTime,
      toLocation: trip.toLocation,
      arrivalTime: trip.arrivalTime,
      arrivalMinutes: trip.arrivalMinutes,
      distanceKm: toNumber(trip.distanceKm),

      goal: trip.goal,
      note: trip.note,
      events: trip.events,
    }));

    return res.json({
      data,
    });
  } catch (error) {
    console.error("getAdminTrips error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

const adminTripEventSchema = z.object({
  eventCategory: z.enum(["REGULAR_ALARM", "ADDITIONAL_ALARM"]),

  alarmSource: z.enum(["OH", "PARTNER"]).optional(),
  countTotal: z.number().int().nonnegative().optional(),
  isCombat: z.boolean().optional(),

  reasonId: z.number().int().positive().optional().nullable(),
  customReasonText: z.string().optional().nullable(),

  ohCount: z.number().int().nonnegative().optional(),
  partnerCount: z.number().int().nonnegative().optional(),

  detainedCount: z.number().int().nonnegative().optional(),
  transferredCount: z.number().int().nonnegative().optional(),
  note: z.string().optional().nullable(),
});

const adminTripSchema = z.object({
  fromLocation: z.string().min(1, "From location is required"),
  departureTime: z.string().min(1, "Departure time is required"),
  toLocation: z.string().min(1, "To location is required"),
  arrivalTime: z.string().min(1, "Arrival time is required"),
  distanceKm: z.number().nonnegative(),
  goalId: z.number().int().positive(),
  note: z.string().optional().nullable(),
  events: z.array(adminTripEventSchema).optional().default([]),
});

const createAdminShiftSchema = z.object({
  cityId: z.number().int().positive(),

  crewId: z.number().int().positive(),
  vehicleId: z.number().int().positive(),

  driverEmployeeId: z.number().int().positive(),
  driverHasWeapon: z.boolean(),

  seniorEmployeeId: z.number().int().positive(),
  seniorHasWeapon: z.boolean(),

  shiftDate: z.string().min(1, "Shift date is required"),
  odometerStart: z.number().int().nonnegative(),

  trips: z.array(adminTripSchema).min(1, "At least one trip is required"),
});

function parseDateForCreate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function calculateArrivalMinutesForCreate(
  departureTime: Date,
  arrivalTime: Date,
) {
  const diffMs = arrivalTime.getTime() - departureTime.getTime();
  return Math.round(diffMs / 1000 / 60);
}

function calculateAdminShiftDistance(trips: z.infer<typeof adminTripSchema>[]) {
  return trips.reduce((sum, trip) => sum + trip.distanceKm, 0);
}

export async function createAdminShift(req: Request, res: Response) {
  try {
    const parsed = createAdminShiftSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation error",
        errors: parsed.error.flatten(),
      });
    }

    const data = parsed.data;

    if (data.driverEmployeeId === data.seniorEmployeeId) {
      return res.status(400).json({
        message: "Driver and senior cannot be the same employee",
      });
    }

    const shiftDate = parseDateForCreate(data.shiftDate);

    if (!shiftDate) {
      return res.status(400).json({
        message: "Invalid shiftDate",
      });
    }

    const [city, crew, vehicle, driver, senior] = await Promise.all([
      prisma.city.findFirst({
        where: {
          id: data.cityId,
          deletedAt: null,
          isActive: true,
        },
      }),

      prisma.crew.findFirst({
        where: {
          id: data.crewId,
          cityId: data.cityId,
          deletedAt: null,
          isActive: true,
        },
      }),

      prisma.vehicle.findFirst({
        where: {
          id: data.vehicleId,
          cityId: data.cityId,
          deletedAt: null,
          isActive: true,
        },
      }),

      prisma.employee.findFirst({
        where: {
          id: data.driverEmployeeId,
          cityId: data.cityId,
          deletedAt: null,
          isActive: true,
        },
      }),

      prisma.employee.findFirst({
        where: {
          id: data.seniorEmployeeId,
          cityId: data.cityId,
          deletedAt: null,
          isActive: true,
        },
      }),
    ]);

    if (!city) {
      return res.status(404).json({ message: "City not found" });
    }

    if (!crew) {
      return res.status(404).json({ message: "Crew not found" });
    }

    if (!vehicle) {
      return res.status(404).json({ message: "Vehicle not found" });
    }

    if (!driver) {
      return res.status(404).json({ message: "Driver not found" });
    }

    if (!senior) {
      return res.status(404).json({ message: "Senior not found" });
    }

    const goalIds = [...new Set(data.trips.map((trip) => trip.goalId))];

    const goals = await prisma.tripGoal.findMany({
      where: {
        id: {
          in: goalIds,
        },
        deletedAt: null,
        isActive: true,
      },
    });

    if (goals.length !== goalIds.length) {
      return res.status(400).json({
        message: "One or more trip goals are invalid",
      });
    }

    const reasonIds = data.trips
      .flatMap((trip) => trip.events ?? [])
      .map((event) => event.reasonId)
      .filter((id): id is number => Boolean(id));

    if (reasonIds.length > 0) {
      const uniqueReasonIds = [...new Set(reasonIds)];

      const reasons = await prisma.additionalAlarmReason.findMany({
        where: {
          id: {
            in: uniqueReasonIds,
          },
          deletedAt: null,
          isActive: true,
        },
      });

      if (reasons.length !== uniqueReasonIds.length) {
        return res.status(400).json({
          message: "One or more additional alarm reasons are invalid",
        });
      }
    }

    for (const trip of data.trips) {
      const departureTime = parseDateForCreate(trip.departureTime);
      const arrivalTime = parseDateForCreate(trip.arrivalTime);

      if (!departureTime || !arrivalTime) {
        return res.status(400).json({
          message: "Invalid trip departureTime or arrivalTime",
        });
      }

      if (arrivalTime.getTime() < departureTime.getTime()) {
        return res.status(400).json({
          message: "Arrival time cannot be earlier than departure time",
        });
      }

      for (const event of trip.events ?? []) {
        if (event.eventCategory === "REGULAR_ALARM") {
          if (!event.alarmSource) {
            return res.status(400).json({
              message: "Regular alarm must have alarmSource",
            });
          }

          if (typeof event.isCombat !== "boolean") {
            return res.status(400).json({
              message: "Regular alarm must have isCombat",
            });
          }
        }

        if (event.eventCategory === "ADDITIONAL_ALARM") {
          const ohCount = event.ohCount ?? 0;
          const partnerCount = event.partnerCount ?? 0;

          if (ohCount + partnerCount <= 0) {
            return res.status(400).json({
              message: "Additional alarm must have OH or Partner count",
            });
          }

          if (!event.reasonId && !event.customReasonText) {
            return res.status(400).json({
              message:
                "Additional alarm must have reasonId or customReasonText",
            });
          }
        }
      }
    }

    const totalDistanceKm = calculateAdminShiftDistance(data.trips);
    const odometerEndCalculated =
      data.odometerStart + Math.round(totalDistanceKm);

    const selectedCrew = await prisma.crew.findFirst({
      where: {
        id: data.crewId,
        cityId: data.cityId,
        deletedAt: null,
        isActive: true,
      },
      select: {
        departmentId: true,
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

    const shiftDurationHours = Number(selectedCrew.durationHours ?? 24);
    const savedShift = await prisma.$transaction(async (tx) => {
      const shift = await tx.shift.create({
        data: {
          cityId: data.cityId,
          departmentId: selectedCrew.departmentId,
          createdByAdminId: req.user?.id ?? null,
          sourceType: ShiftSourceType.ADMIN_PANEL,

          crewId: data.crewId,
          vehicleId: data.vehicleId,

          driverEmployeeId: data.driverEmployeeId,
          driverHasWeapon: data.driverHasWeapon,

          seniorEmployeeId: data.seniorEmployeeId,
          seniorHasWeapon: data.seniorHasWeapon,

          crewDutyType: selectedCrew.dutyType,
          crewTransportType: selectedCrew.transportType,
          shiftDurationHours,

          shiftDate,
          odometerStart: data.odometerStart,
          totalDistanceKm,
          odometerEndCalculated,

          appSyncStatus: AppSyncStatus.SENT,
          submittedAt: new Date(),
        },
      });

      for (const trip of data.trips) {
        const departureTime = parseDateForCreate(trip.departureTime)!;
        const arrivalTime = parseDateForCreate(trip.arrivalTime)!;
        const arrivalMinutes = calculateArrivalMinutesForCreate(
          departureTime,
          arrivalTime,
        );

        const savedTrip = await tx.trip.create({
          data: {
            shiftId: shift.id,
            cityId: data.cityId,
            fromLocation: trip.fromLocation,
            departureTime,
            toLocation: trip.toLocation,
            arrivalTime,
            arrivalMinutes,
            distanceKm: trip.distanceKm,
            goalId: trip.goalId,
            note: trip.note ?? null,
          },
        });

        for (const event of trip.events ?? []) {
          await tx.tripEvent.create({
            data: {
              tripId: savedTrip.id,

              eventCategory:
                event.eventCategory === "REGULAR_ALARM"
                  ? TripEventCategory.REGULAR_ALARM
                  : TripEventCategory.ADDITIONAL_ALARM,

              alarmSource:
                event.alarmSource === "OH"
                  ? AlarmSource.OH
                  : event.alarmSource === "PARTNER"
                    ? AlarmSource.PARTNER
                    : null,

              countTotal:
                event.eventCategory === "REGULAR_ALARM"
                  ? 1
                  : (event.ohCount ?? 0) + (event.partnerCount ?? 0),

              isCombat:
                event.eventCategory === "REGULAR_ALARM"
                  ? (event.isCombat ?? false)
                  : null,

              reasonId: event.reasonId ?? null,
              customReasonText: event.customReasonText ?? null,

              ohCount: event.ohCount ?? 0,
              partnerCount: event.partnerCount ?? 0,

              detainedCount: event.detainedCount ?? 0,
              transferredCount: event.transferredCount ?? 0,
              note: event.note ?? null,
            },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          userId: req.user?.id ?? null,
          action: "CREATE_ADMIN_SHIFT",
          entityType: "shift",
          entityId: shift.id,
          newValue: {
            cityId: data.cityId,
            shiftDate: data.shiftDate,
            crewId: data.crewId,
            vehicleId: data.vehicleId,
            driverEmployeeId: data.driverEmployeeId,
            seniorEmployeeId: data.seniorEmployeeId,
            tripsCount: data.trips.length,
          },
        },
      });

      return shift;
    });

    return res.status(201).json({
      message: "Admin shift created successfully",
      data: {
        id: savedShift.id,
        sourceType: savedShift.sourceType,
        shiftDate: savedShift.shiftDate,
        submittedAt: savedShift.submittedAt,
        odometerStart: savedShift.odometerStart,
        totalDistanceKm: Number(savedShift.totalDistanceKm),
        odometerEndCalculated: savedShift.odometerEndCalculated,
      },
    });
  } catch (error) {
    console.error("createAdminShift error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

export async function updateAdminShift(req: Request, res: Response) {
  try {
    const shiftId = Number(req.params.id);

    if (!Number.isInteger(shiftId)) {
      return res.status(400).json({
        message: "Invalid shift id",
      });
    }

    const parsed = createAdminShiftSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation error",
        errors: parsed.error.flatten(),
      });
    }

    const data = parsed.data;

    if (data.driverEmployeeId === data.seniorEmployeeId) {
      return res.status(400).json({
        message: "Driver and senior cannot be the same employee",
      });
    }

    const existingShift = await prisma.shift.findFirst({
      where: {
        id: shiftId,
        deletedAt: null,
      },
      include: {
        trips: {
          where: {
            deletedAt: null,
          },
          include: {
            events: true,
          },
        },
      },
    });

    if (!existingShift) {
      return res.status(404).json({
        message: "Shift not found",
      });
    }

    const shiftDate = parseDateForCreate(data.shiftDate);

    if (!shiftDate) {
      return res.status(400).json({
        message: "Invalid shiftDate",
      });
    }

    const [city, crew, vehicle, driver, senior] = await Promise.all([
      prisma.city.findFirst({
        where: {
          id: data.cityId,
          deletedAt: null,
          isActive: true,
        },
      }),

      prisma.crew.findFirst({
        where: {
          id: data.crewId,
          cityId: data.cityId,
          deletedAt: null,
          isActive: true,
        },
      }),

      prisma.vehicle.findFirst({
        where: {
          id: data.vehicleId,
          cityId: data.cityId,
          deletedAt: null,
          isActive: true,
        },
      }),

      prisma.employee.findFirst({
        where: {
          id: data.driverEmployeeId,
          cityId: data.cityId,
          deletedAt: null,
          isActive: true,
        },
      }),

      prisma.employee.findFirst({
        where: {
          id: data.seniorEmployeeId,
          cityId: data.cityId,
          deletedAt: null,
          isActive: true,
        },
      }),
    ]);

    if (!city) {
      return res.status(404).json({ message: "City not found" });
    }

    if (!crew) {
      return res.status(404).json({ message: "Crew not found" });
    }

    if (!vehicle) {
      return res.status(404).json({ message: "Vehicle not found" });
    }

    if (!driver) {
      return res.status(404).json({ message: "Driver not found" });
    }

    if (!senior) {
      return res.status(404).json({ message: "Senior not found" });
    }

    const goalIds = [...new Set(data.trips.map((trip) => trip.goalId))];

    const goals = await prisma.tripGoal.findMany({
      where: {
        id: {
          in: goalIds,
        },
        deletedAt: null,
        isActive: true,
      },
    });

    if (goals.length !== goalIds.length) {
      return res.status(400).json({
        message: "One or more trip goals are invalid",
      });
    }

    const reasonIds = data.trips
      .flatMap((trip) => trip.events ?? [])
      .map((event) => event.reasonId)
      .filter((id): id is number => Boolean(id));

    if (reasonIds.length > 0) {
      const uniqueReasonIds = [...new Set(reasonIds)];

      const reasons = await prisma.additionalAlarmReason.findMany({
        where: {
          id: {
            in: uniqueReasonIds,
          },
          deletedAt: null,
          isActive: true,
        },
      });

      if (reasons.length !== uniqueReasonIds.length) {
        return res.status(400).json({
          message: "One or more additional alarm reasons are invalid",
        });
      }
    }

    for (const trip of data.trips) {
      const departureTime = parseDateForCreate(trip.departureTime);
      const arrivalTime = parseDateForCreate(trip.arrivalTime);

      if (!departureTime || !arrivalTime) {
        return res.status(400).json({
          message: "Invalid trip departureTime or arrivalTime",
        });
      }

      if (arrivalTime.getTime() < departureTime.getTime()) {
        return res.status(400).json({
          message: "Arrival time cannot be earlier than departure time",
        });
      }

      for (const event of trip.events ?? []) {
        if (event.eventCategory === "REGULAR_ALARM") {
          if (!event.alarmSource) {
            return res.status(400).json({
              message: "Regular alarm must have alarmSource",
            });
          }

          if (typeof event.isCombat !== "boolean") {
            return res.status(400).json({
              message: "Regular alarm must have isCombat",
            });
          }
        }

        if (event.eventCategory === "ADDITIONAL_ALARM") {
          const ohCount = event.ohCount ?? 0;
          const partnerCount = event.partnerCount ?? 0;

          if (ohCount + partnerCount <= 0) {
            return res.status(400).json({
              message: "Additional alarm must have OH or Partner count",
            });
          }

          if (!event.reasonId && !event.customReasonText) {
            return res.status(400).json({
              message:
                "Additional alarm must have reasonId or customReasonText",
            });
          }
        }
      }
    }

    const totalDistanceKm = calculateAdminShiftDistance(data.trips);
    const odometerEndCalculated =
      data.odometerStart + Math.round(totalDistanceKm);

    const updatedShift = await prisma.$transaction(async (tx) => {
      const shift = await tx.shift.update({
        where: {
          id: shiftId,
        },
        data: {
          cityId: data.cityId,

          crewId: data.crewId,
          vehicleId: data.vehicleId,

          driverEmployeeId: data.driverEmployeeId,
          driverHasWeapon: data.driverHasWeapon,

          seniorEmployeeId: data.seniorEmployeeId,
          seniorHasWeapon: data.seniorHasWeapon,

          shiftDate,
          odometerStart: data.odometerStart,
          totalDistanceKm,
          odometerEndCalculated,

          updatedAt: new Date(),
        },
      });

      await tx.trip.updateMany({
        where: {
          shiftId,
          deletedAt: null,
        },
        data: {
          deletedAt: new Date(),
        },
      });

      for (const trip of data.trips) {
        const departureTime = parseDateForCreate(trip.departureTime)!;
        const arrivalTime = parseDateForCreate(trip.arrivalTime)!;

        const arrivalMinutes = calculateArrivalMinutesForCreate(
          departureTime,
          arrivalTime,
        );

        const savedTrip = await tx.trip.create({
          data: {
            shiftId,
            cityId: data.cityId,
            fromLocation: trip.fromLocation,
            departureTime,
            toLocation: trip.toLocation,
            arrivalTime,
            arrivalMinutes,
            distanceKm: trip.distanceKm,
            goalId: trip.goalId,
            note: trip.note ?? null,
          },
        });

        for (const event of trip.events ?? []) {
          await tx.tripEvent.create({
            data: {
              tripId: savedTrip.id,

              eventCategory:
                event.eventCategory === "REGULAR_ALARM"
                  ? TripEventCategory.REGULAR_ALARM
                  : TripEventCategory.ADDITIONAL_ALARM,

              alarmSource:
                event.alarmSource === "OH"
                  ? AlarmSource.OH
                  : event.alarmSource === "PARTNER"
                    ? AlarmSource.PARTNER
                    : null,

              countTotal:
                event.eventCategory === "REGULAR_ALARM"
                  ? 1
                  : (event.ohCount ?? 0) + (event.partnerCount ?? 0),

              isCombat:
                event.eventCategory === "REGULAR_ALARM"
                  ? (event.isCombat ?? false)
                  : null,

              reasonId: event.reasonId ?? null,
              customReasonText: event.customReasonText ?? null,

              ohCount: event.ohCount ?? 0,
              partnerCount: event.partnerCount ?? 0,

              detainedCount: event.detainedCount ?? 0,
              transferredCount: event.transferredCount ?? 0,
              note: event.note ?? null,
            },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          userId: req.user?.id ?? null,
          action: "UPDATE_SHIFT",
          entityType: "shift",
          entityId: shiftId,
          oldValue: {
            cityId: existingShift.cityId,
            shiftDate: existingShift.shiftDate,
            crewId: existingShift.crewId,
            vehicleId: existingShift.vehicleId,
            driverEmployeeId: existingShift.driverEmployeeId,
            seniorEmployeeId: existingShift.seniorEmployeeId,
            tripsCount: existingShift.trips.length,
          },
          newValue: {
            cityId: data.cityId,
            shiftDate: data.shiftDate,
            crewId: data.crewId,
            vehicleId: data.vehicleId,
            driverEmployeeId: data.driverEmployeeId,
            seniorEmployeeId: data.seniorEmployeeId,
            tripsCount: data.trips.length,
          },
        },
      });

      return shift;
    });

    return res.json({
      message: "Shift updated successfully",
      data: {
        id: updatedShift.id,
        sourceType: updatedShift.sourceType,
        shiftDate: updatedShift.shiftDate,
        submittedAt: updatedShift.submittedAt,
        odometerStart: updatedShift.odometerStart,
        totalDistanceKm: Number(updatedShift.totalDistanceKm),
        odometerEndCalculated: updatedShift.odometerEndCalculated,
      },
    });
  } catch (error) {
    console.error("updateAdminShift error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}
