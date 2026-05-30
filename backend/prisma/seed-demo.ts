/// <reference types="node" />

import { PrismaClient } from "@prisma/client";
import type {
  AdditionalAlarmReason,
  Crew,
  Employee,
  TripGoal,
  Vehicle,
} from "@prisma/client";

const prisma = new PrismaClient();

const cities = ["Запорожье", "Харьков", "Днепр", "Киев", "Одесса"];

const employeeNames = [
  "Иванов Иван Иванович",
  "Петренко Сергей Викторович",
  "Коваленко Андрей Петрович",
  "Шевченко Дмитрий Олегович",
  "Бондаренко Максим Сергеевич",
  "Ткаченко Александр Николаевич",
  "Мельник Роман Андреевич",
  "Гриценко Павел Владимирович",
];

const crewNames = ["Байкал 1", "Байкал 2", "Байкал 3"];

const vehicleTemplates = [
  { title: "Renault Duster", platePrefix: "AX" },
  { title: "Toyota Corolla", platePrefix: "AP" },
  { title: "Volkswagen Caddy", platePrefix: "AE" },
];

const locations = [
  "База",
  "ул. Центральная",
  "пр-т Соборный",
  "ул. Победы",
  "ул. Школьная",
  "ул. Садовая",
  "ТРЦ",
  "Районный отдел",
  "АЗС",
  "Объект 1045",
  "Объект 2110",
  "Объект 3250",
  "Пост охраны",
  "Склад",
  "ЖК",
];

const tripGoalsSeed = [
  {
    name: "Сработка ОХ",
    systemCode: "alarm_oh",
    isSystem: true,
    sortOrder: 10,
  },
  {
    name: "Сработка Партнеры",
    systemCode: "alarm_partner",
    isSystem: true,
    sortOrder: 20,
  },
  {
    name: "Список сработок",
    systemCode: "additional_alarm_list",
    isSystem: true,
    sortOrder: 30,
  },
  {
    name: "Мойка",
    systemCode: "wash",
    isSystem: true,
    sortOrder: 40,
  },
  {
    name: "Пересменка",
    systemCode: "shift_change",
    isSystem: true,
    sortOrder: 50,
  },
  {
    name: "Проверка",
    systemCode: "check",
    isSystem: true,
    sortOrder: 60,
  },
  {
    name: "Патруль",
    systemCode: null,
    isSystem: false,
    sortOrder: 70,
  },
  {
    name: "Туалет/Обед",
    systemCode: null,
    isSystem: false,
    sortOrder: 80,
  },
  {
    name: "Подвоз ОХ",
    systemCode: null,
    isSystem: false,
    sortOrder: 90,
  },
  {
    name: "Подвоз Партнеры",
    systemCode: null,
    isSystem: false,
    sortOrder: 100,
  },
  {
    name: "СТО",
    systemCode: null,
    isSystem: false,
    sortOrder: 110,
  },
  {
    name: "Точка",
    systemCode: null,
    isSystem: false,
    sortOrder: 120,
  },
  {
    name: "Ознаком",
    systemCode: null,
    isSystem: false,
    sortOrder: 130,
  },
  {
    name: "Інше",
    systemCode: null,
    isSystem: false,
    sortOrder: 999,
  },
];

const additionalReasonsSeed = [
  {
    name: "Военные действия",
    isSystem: true,
    sortOrder: 10,
  },
  {
    name: "Массовое отключение",
    isSystem: true,
    sortOrder: 20,
  },
  {
    name: "Свой вариант",
    isSystem: true,
    sortOrder: 999,
  },
];

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomItem<T>(items: T[]) {
  return items[randomInt(0, items.length - 1)];
}

function randomBool(percentTrue: number) {
  return Math.random() * 100 < percentTrue;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function roundKm(value: number) {
  return Number(value.toFixed(1));
}

function makeDateDaysAgo(daysAgo: number, hour = 8, minute = 0) {
  const date = new Date();

  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, minute, 0, 0);

  return date;
}

async function upsertCity(name: string) {
  const existing = await prisma.city.findFirst({
    where: {
      name,
    },
  });

  if (existing) {
    return prisma.city.update({
      where: {
        id: existing.id,
      },
      data: {
        isActive: true,
        deletedAt: null,
      } as any,
    });
  }

  return prisma.city.create({
    data: {
      name,
      isActive: true,
    } as any,
  });
}

async function upsertEmployee(cityId: number, fullName: string) {
  const existing = await prisma.employee.findFirst({
    where: {
      cityId,
      fullName,
    },
  });

  if (existing) {
    return prisma.employee.update({
      where: {
        id: existing.id,
      },
      data: {
        isActive: true,
        deletedAt: null,
      } as any,
    });
  }

  return prisma.employee.create({
    data: {
      cityId,
      fullName,
      isActive: true,
    } as any,
  });
}

async function upsertCrew(cityId: number, name: string) {
  const existing = await prisma.crew.findFirst({
    where: {
      cityId,
      name,
    },
  });

  if (existing) {
    return prisma.crew.update({
      where: {
        id: existing.id,
      },
      data: {
        isActive: true,
        deletedAt: null,
      } as any,
    });
  }

  return prisma.crew.create({
    data: {
      cityId,
      name,
      isActive: true,
    } as any,
  });
}

async function upsertVehicle(cityId: number, title: string, licensePlate: string) {
  const existing = await prisma.vehicle.findFirst({
    where: {
      cityId,
      licensePlate,
    },
  });

  if (existing) {
    return prisma.vehicle.update({
      where: {
        id: existing.id,
      },
      data: {
        title,
        isActive: true,
        deletedAt: null,
      } as any,
    });
  }

  return prisma.vehicle.create({
    data: {
      cityId,
      title,
      licensePlate,
      isActive: true,
    } as any,
  });
}

async function upsertTripGoal(goal: {
  name: string;
  systemCode: string | null;
  isSystem: boolean;
  sortOrder: number;
}) {
  const existing = await prisma.tripGoal.findFirst({
    where: {
      OR: [
        {
          name: goal.name,
        },
        ...(goal.systemCode
          ? [
              {
                systemCode: goal.systemCode,
              },
            ]
          : []),
      ],
    },
  });

  if (existing) {
    return prisma.tripGoal.update({
      where: {
        id: existing.id,
      },
      data: {
        name: goal.name,
        systemCode: goal.systemCode,
        isSystem: goal.isSystem,
        sortOrder: goal.sortOrder,
        isActive: true,
        deletedAt: null,
      } as any,
    });
  }

  return prisma.tripGoal.create({
    data: {
      name: goal.name,
      systemCode: goal.systemCode,
      isSystem: goal.isSystem,
      sortOrder: goal.sortOrder,
      isActive: true,
    } as any,
  });
}

async function upsertAdditionalReason(reason: {
  name: string;
  isSystem: boolean;
  sortOrder: number;
}) {
  const existing = await prisma.additionalAlarmReason.findFirst({
    where: {
      name: reason.name,
    },
  });

  if (existing) {
    return prisma.additionalAlarmReason.update({
      where: {
        id: existing.id,
      },
      data: {
        isSystem: reason.isSystem,
        sortOrder: reason.sortOrder,
        isActive: true,
        deletedAt: null,
      } as any,
    });
  }

  return prisma.additionalAlarmReason.create({
    data: {
      name: reason.name,
      isSystem: reason.isSystem,
      sortOrder: reason.sortOrder,
      isActive: true,
    } as any,
  });
}

async function main() {
  console.log("Начинаю добавлять демо-данные...");

  const goals = new Map<string, TripGoal>();

  for (const goal of tripGoalsSeed) {
    const savedGoal = await upsertTripGoal(goal);
  
    goals.set(goal.name, savedGoal);
  
    if (goal.systemCode) {
      goals.set(goal.systemCode, savedGoal);
    }
  }

  const reasons: AdditionalAlarmReason[] = [];

  for (const reason of additionalReasonsSeed) {
    const savedReason = await upsertAdditionalReason(reason);
    reasons.push(savedReason);
  }

  let createdShifts = 0;
  let createdTrips = 0;
  let createdEvents = 0;

  for (let cityIndex = 0; cityIndex < cities.length; cityIndex += 1) {
    const cityName = cities[cityIndex];
    const city = await upsertCity(cityName);

    console.log(`Город: ${city.name}`);

    const employees: Employee[] = [];

    for (const employeeName of employeeNames) {
      const employee = await upsertEmployee(city.id, employeeName);
      employees.push(employee);
    }

    const crews: Crew[] = [];

    for (const crewName of crewNames) {
      const crew = await upsertCrew(city.id, crewName);
      crews.push(crew);
    }

    const vehicles: Vehicle[] = [];

    for (let vehicleIndex = 0; vehicleIndex < vehicleTemplates.length; vehicleIndex += 1) {
      const template = vehicleTemplates[vehicleIndex];

      const licensePlate = `${template.platePrefix}${cityIndex + 1}${vehicleIndex + 1}00AA`;

      const vehicle = await upsertVehicle(city.id, template.title, licensePlate);
      vehicles.push(vehicle);
    }

    for (let shiftIndex = 0; shiftIndex < 12; shiftIndex += 1) {
      const shiftDate = makeDateDaysAgo(
        cityIndex * 2 + shiftIndex * 3,
        randomInt(7, 10),
        randomInt(0, 50)
      );

      const crew = randomItem(crews);
      const vehicle = randomItem(vehicles);

      const driver = randomItem(employees);

      let senior = randomItem(employees);

      while (senior.id === driver.id) {
        senior = randomItem(employees);
      }

      const tripsCount = randomInt(4, 7);
      const odometerStart =
        50000 + cityIndex * 10000 + vehicles.indexOf(vehicle) * 3000 + shiftIndex * 140;

      const shift = await prisma.shift.create({
        data: {
          cityId: city.id,
          crewId: crew.id,
          vehicleId: vehicle.id,
          driverEmployeeId: driver.id,
          seniorEmployeeId: senior.id,

          driverHasWeapon: randomBool(35),
          seniorHasWeapon: randomBool(65),

          shiftDate,
          submittedAt: addMinutes(shiftDate, 12 * 60 + randomInt(0, 60)),

          odometerStart,
          odometerEndCalculated: odometerStart,
          totalDistanceKm: 0,
        } as any,
      });

      createdShifts += 1;

      let currentLocation = "База";
      let currentTime = new Date(shiftDate);
      let totalDistanceKm = 0;

      for (let tripIndex = 0; tripIndex < tripsCount; tripIndex += 1) {
        const fromLocation = currentLocation;

        let toLocation = randomItem(locations);

        while (toLocation === fromLocation) {
          toLocation = randomItem(locations);
        }

        const departureTime = addMinutes(currentTime, randomInt(5, 25));
        const arrivalMinutes = randomInt(5, 35);
        const arrivalTime = addMinutes(departureTime, arrivalMinutes);
        const distanceKm = roundKm(randomInt(2, 24) + Math.random());

        totalDistanceKm += distanceKm;

        currentLocation = toLocation;
        currentTime = arrivalTime;

        const goalRoll = randomInt(1, 100);

        let goal;

        if (goalRoll <= 22) {
          goal = goals.get("alarm_oh");
        } else if (goalRoll <= 42) {
          goal = goals.get("alarm_partner");
        } else if (goalRoll <= 58) {
          goal = goals.get("additional_alarm_list");
        } else if (goalRoll <= 68) {
          goal = goals.get("Патруль");
        } else if (goalRoll <= 76) {
          goal = goals.get("Проверка");
        } else if (goalRoll <= 82) {
          goal = goals.get("Мойка");
        } else if (goalRoll <= 88) {
          goal = goals.get("Туалет/Обед");
        } else if (goalRoll <= 94) {
          goal = goals.get("Пересменка");
        } else {
          goal = goals.get("Інше");
        }
        if (!goal) {
            throw new Error(`Не найдена цель поездки для tripIndex=${tripIndex}`);
          }
        const trip = await prisma.trip.create({
          data: {
            cityId: city.id,
            shiftId: shift.id,
            goalId: goal.id,

            fromLocation,
            departureTime,
            toLocation,
            arrivalTime,
            arrivalMinutes,
            distanceKm,

            note: randomBool(15) ? "Тестовое примечание" : null,
          } as any,
        });

        createdTrips += 1;

        if (goal.systemCode === "alarm_oh") {
          await prisma.tripEvent.create({
            data: {
              tripId: trip.id,
              eventCategory: "REGULAR_ALARM",
              alarmSource: "OH",
              isCombat: randomBool(12),
              countTotal: 1,
              detainedCount: randomBool(8) ? randomInt(1, 2) : 0,
              transferredCount: randomBool(4) ? 1 : 0,
              note: null,
            } as any,
          });

          createdEvents += 1;
        }

        if (goal.systemCode === "alarm_partner") {
          await prisma.tripEvent.create({
            data: {
              tripId: trip.id,
              eventCategory: "REGULAR_ALARM",
              alarmSource: "PARTNER",
              isCombat: randomBool(10),
              countTotal: 1,
              detainedCount: randomBool(7) ? randomInt(1, 2) : 0,
              transferredCount: randomBool(3) ? 1 : 0,
              note: null,
            } as any,
          });

          createdEvents += 1;
        }

        if (goal.systemCode === "additional_alarm_list") {
          const reason = randomItem(reasons);
          const ohCount = randomInt(1, 8);
          const partnerCount = randomInt(1, 10);

          await prisma.tripEvent.create({
            data: {
              tripId: trip.id,
              eventCategory: "ADDITIONAL_ALARM",
              reasonId: reason.id,
              customReasonText: null,

              ohCount,
              partnerCount,
              countTotal: ohCount + partnerCount,

              detainedCount: randomBool(5) ? randomInt(1, 2) : 0,
              transferredCount: randomBool(3) ? 1 : 0,
              note: null,
            } as any,
          });

          createdEvents += 1;
        }
      }

      const roundedTotalDistance = roundKm(totalDistanceKm);

      await prisma.shift.update({
        where: {
          id: shift.id,
        },
        data: {
          totalDistanceKm: roundedTotalDistance,
          odometerEndCalculated: odometerStart + roundedTotalDistance,
        } as any,
      });
    }
  }

  console.log("Готово!");
  console.log(`Создано смен: ${createdShifts}`);
  console.log(`Создано поездок: ${createdTrips}`);
  console.log(`Создано событий: ${createdEvents}`);
}

main()
  .catch((error) => {
    console.error("Ошибка seed-demo:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });