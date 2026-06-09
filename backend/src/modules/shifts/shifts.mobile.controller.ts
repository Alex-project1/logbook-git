import { Request, Response } from "express";
import { z } from "zod";
import {
  AlarmSource,
  AppSyncStatus,
  ShiftSourceType,
  TripEventCategory,
  MobileUserKind,
} from "@prisma/client";
import { prisma } from "../../config/prisma";

const tripEventSchema = z.object({
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

const tripSchema = z.object({
  fromLocation: z.string().min(1, "From location is required"),
  departureTime: z.string().min(1, "Departure time is required"),
  toLocation: z.string().min(1, "To location is required"),
  arrivalTime: z.string().min(1, "Arrival time is required"),
  distanceKm: z.number().nonnegative(),
  goalId: z.number().int().positive(),
  note: z.string().optional().nullable(),
  events: z.array(tripEventSchema).optional().default([]),
});

const createMobileShiftSchema = z.object({
  localShiftId: z.string().min(1, "localShiftId is required"),

  crewId: z.number().int().positive(),
  vehicleId: z.number().int().positive(),

  driverEmployeeId: z.number().int().positive(),
  driverHasWeapon: z.boolean(),

  seniorEmployeeId: z.number().int().positive(),
  seniorHasWeapon: z.boolean(),

  shiftDate: z.string().min(1, "Shift date is required"),
  odometerStart: z.number().int().nonnegative(),

  trips: z.array(tripSchema).min(1, "At least one trip is required"),
});

function parseDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function calculateArrivalMinutes(departureTime: Date, arrivalTime: Date) {
  const diffMs = arrivalTime.getTime() - departureTime.getTime();
  return Math.round(diffMs / 1000 / 60);
}

function calculateSummary(trips: z.infer<typeof tripSchema>[]) {
  let totalDistanceKm = 0;

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

  for (const trip of trips) {
    totalDistanceKm += trip.distanceKm;

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
        additionalOh += event.ohCount ?? 0;
        additionalPartner += event.partnerCount ?? 0;
      }
    }
  }

  const totalOh = regularOh + additionalOh;
  const totalPartner = regularPartner + additionalPartner;

  return {
    totalDistanceKm,
    odometerDistanceRounded: Math.round(totalDistanceKm),

    totalAlarms: totalOh + totalPartner,
    totalOh,
    totalPartner,

    regularOh,
    regularPartner,

    combatTotal: combatOh + combatPartner,
    combatOh,
    combatPartner,

    falseTotal: falseOh + falsePartner,
    falseOh,
    falsePartner,

    additionalTotal: additionalOh + additionalPartner,
    additionalOh,
    additionalPartner,

    detained,
    transferred,
  };
}

export async function createMobileShift(req: Request, res: Response) {
  try {
    if (!req.mobileUser) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    const parsed = createMobileShiftSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation error",
        errors: parsed.error.flatten(),
      });
    }

    const data = parsed.data;
    const cityId = req.mobileUser.cityId;
    const departmentId = req.mobileUser.departmentId;

    if (req.mobileUser.userKind !== MobileUserKind.CREW || !req.mobileUser.crewId) {
      return res.status(403).json({
        message: "Створення зміни ГШР доступне тільки користувачу-наряду",
      });
    }

    if (data.crewId !== req.mobileUser.crewId) {
      return res.status(403).json({
        message: "Не можна відправити зміну за інший наряд",
      });
    }

    if (data.driverEmployeeId === data.seniorEmployeeId) {
      return res.status(400).json({
        message: "Driver and senior cannot be the same employee",
      });
    }

    const existingShift = await prisma.shift.findUnique({
      where: {
        localShiftId: data.localShiftId,
      },
      select: {
        id: true,
        localShiftId: true,
        submittedAt: true,
      },
    });

    if (existingShift) {
      return res.json({
        message: "Shift already saved",
        data: existingShift,
        duplicated: true,
      });
    }

    const shiftDate = parseDate(data.shiftDate);

    if (!shiftDate) {
      return res.status(400).json({
        message: "Invalid shiftDate",
      });
    }

    const [crew, vehicle, driver, senior] = await Promise.all([
      prisma.crew.findFirst({
        where: {
          id: data.crewId,
          cityId,
          departmentId,
          deletedAt: null,
          isActive: true,
        },
      }),
      prisma.vehicle.findFirst({
        where: {
          id: data.vehicleId,
          cityId,
          departmentId,
          deletedAt: null,
          isActive: true,
        },
      }),
      prisma.employee.findFirst({
        where: {
          id: data.driverEmployeeId,
          cityId,
          departmentId,
          deletedAt: null,
          isActive: true,
        },
      }),
      prisma.employee.findFirst({
        where: {
          id: data.seniorEmployeeId,
          cityId,
          departmentId,
          deletedAt: null,
          isActive: true,
        },
      }),
    ]);

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
      const departureTime = parseDate(trip.departureTime);
      const arrivalTime = parseDate(trip.arrivalTime);

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
              message: "Additional alarm must have reasonId or customReasonText",
            });
          }
        }
      }
    }

    const summary = calculateSummary(data.trips);

    const odometerEndCalculated =
      data.odometerStart + summary.odometerDistanceRounded;

    const savedShift = await prisma.$transaction(async (tx) => {
      const shift = await tx.shift.create({
        data: {
          localShiftId: data.localShiftId,
          cityId,
          departmentId,
          mobileUserId: req.mobileUser!.id,
          sourceType: ShiftSourceType.MOBILE_APP,

          crewId: req.mobileUser!.crewId!,
          vehicleId: data.vehicleId,
          driverEmployeeId: data.driverEmployeeId,
          driverHasWeapon: data.driverHasWeapon,
          seniorEmployeeId: data.seniorEmployeeId,
          seniorHasWeapon: data.seniorHasWeapon,

          shiftDate,
          odometerStart: data.odometerStart,
          totalDistanceKm: summary.totalDistanceKm,
          odometerEndCalculated,

          appSyncStatus: AppSyncStatus.SENT,
          submittedAt: new Date(),
        },
      });

      for (const trip of data.trips) {
        const departureTime = parseDate(trip.departureTime)!;
        const arrivalTime = parseDate(trip.arrivalTime)!;
        const arrivalMinutes = calculateArrivalMinutes(
          departureTime,
          arrivalTime
        );

        const savedTrip = await tx.trip.create({
          data: {
            shiftId: shift.id,
            cityId,
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
                  ? event.isCombat ?? false
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

      return shift;
    });

    return res.status(201).json({
      message: "Shift saved successfully",
      data: {
        id: savedShift.id,
        localShiftId: savedShift.localShiftId,
        submittedAt: savedShift.submittedAt,
        odometerStart: savedShift.odometerStart,
        totalDistanceKm: Number(savedShift.totalDistanceKm),
        odometerEndCalculated: savedShift.odometerEndCalculated,
        summary,
      },
      duplicated: false,
    });
  } catch (error) {
    console.error("createMobileShift error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}