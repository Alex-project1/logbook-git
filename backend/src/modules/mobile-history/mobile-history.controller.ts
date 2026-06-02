import type { Request, Response } from "express";
import { prisma } from "../../config/prisma";

type HistoryAlarmReasonTotals = {
  label: string;
  total: number;
  oh: number;
  partner: number;
};

function toNumber(value: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }

  return Number(value);
}

function buildShiftSummary(trips: any[]) {
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

  const additionalReasonMap = new Map<string, HistoryAlarmReasonTotals>();

  for (const trip of trips) {
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
        const label =
          event.reason?.name || event.customReasonText || "Без причини";

        additionalOh += oh;
        additionalPartner += partner;

        const current = additionalReasonMap.get(label) ?? {
          label,
          total: 0,
          oh: 0,
          partner: 0,
        };

        current.oh += oh;
        current.partner += partner;
        current.total = current.oh + current.partner;

        additionalReasonMap.set(label, current);
      }
    }
  }

  const totalOh = regularOh + additionalOh;
  const totalPartner = regularPartner + additionalPartner;

  return {
    totalAlarms: totalOh + totalPartner,
    totalOh,
    totalPartner,

    regularTotal: regularOh + regularPartner,
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
    additionalReasons: Array.from(additionalReasonMap.values()).sort((a, b) =>
      a.label.localeCompare(b.label, "uk")
    ),

    detained,
    transferred,
  };
}

export async function getMobileHistory(req: Request, res: Response) {
  try {
    if (!req.mobileUser) {
      return res.status(401).json({
        message: "Не авторизовано",
      });
    }

    const cityId = req.mobileUser.cityId;

    const [shifts, postDuties] = await Promise.all([
      prisma.shift.findMany({
        where: {
          cityId,
          deletedAt: null,
        },
        orderBy: {
          shiftDate: "desc",
        },
        take: 100,
        include: {
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
      prisma.postDuty.findMany({
        where: {
          cityId,
          deletedAt: null,
        },
        orderBy: {
          dutyDate: "desc",
        },
        take: 100,
        include: {
          post: {
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
          members: {
            orderBy: {
              id: "asc",
            },
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
      }),
    ]);

    const shiftItems = shifts.map((shift) => {
      const summary = buildShiftSummary(shift.trips);

      return {
        type: "SHIFT" as const,
        id: shift.id,
        date: shift.shiftDate,
        title: shift.crew.name,
        shift: {
          id: shift.id,
          date: shift.shiftDate,
          crew: shift.crew,
          vehicle: shift.vehicle,
          driver: {
            employee: shift.driverEmployee,
            hasWeapon: shift.driverHasWeapon,
          },
          senior: {
            employee: shift.seniorEmployee,
            hasWeapon: shift.seniorHasWeapon,
          },
          odometerStart: shift.odometerStart,
          odometerEndCalculated: shift.odometerEndCalculated,
          totalDistanceKm: toNumber(shift.totalDistanceKm),
          summary,
          trips: shift.trips.map((trip) => ({
            id: trip.id,
            fromLocation: trip.fromLocation,
            toLocation: trip.toLocation,
            departureTime: trip.departureTime,
            arrivalTime: trip.arrivalTime,
            distanceKm: toNumber(trip.distanceKm),
            goal: trip.goal,
            events: trip.events.map((event) => ({
              id: event.id,
              eventCategory: event.eventCategory,
              alarmSource: event.alarmSource,
              countTotal: event.countTotal,
              isCombat: event.isCombat,
              reason: event.reason,
              customReasonText: event.customReasonText,
              ohCount: event.ohCount,
              partnerCount: event.partnerCount,
              detainedCount: event.detainedCount,
              transferredCount: event.transferredCount,
              note: event.note,
            })),
          })),
        },
        postDuty: null,
      };
    });

    const postDutyItems = postDuties.map((duty) => ({
      type: "POST_DUTY" as const,
      id: duty.id,
      date: duty.dutyDate,
      title: duty.post.name,
      shift: null,
      postDuty: {
        id: duty.id,
        date: duty.dutyDate,
        post: duty.post,
        vehicle: duty.vehicle,
        durationHours: toNumber(duty.durationHours),
        shiftEquivalent: toNumber(duty.durationHours) / 24,
        note: duty.note,
        members: duty.members.map((member) => ({
          id: member.id,
          employee: member.employee,
          hasWeapon: member.hasWeapon,
          isDriver: member.isDriver,
          comment: member.comment,
        })),
      },
    }));

    const data = [...shiftItems, ...postDutyItems].sort((a, b) => {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    return res.json({
      data,
    });
  } catch (error) {
    console.error("getMobileHistory error:", error);

    return res.status(500).json({
      message: "Внутрішня помилка сервера",
    });
  }
}
