import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Початок заповнення бази даних...");

  const superAdminRole = await prisma.role.upsert({
    where: {
      code: "super_admin",
    },
    update: {
      name: "Супер адміністратор",
      description: "Повний доступ до всіх розділів",
    },
    create: {
      code: "super_admin",
      name: "Супер адміністратор",
      description: "Повний доступ до всіх розділів",
    },
  });

  await prisma.role.upsert({
    where: {
      code: "admin",
    },
    update: {
      name: "Адміністратор",
      description: "Керування призначеними містами",
    },
    create: {
      code: "admin",
      name: "Адміністратор",
      description: "Керування призначеними містами",
    },
  });

  await prisma.role.upsert({
    where: {
      code: "viewer",
    },
    update: {
      name: "Спостерігач",
      description: "Лише перегляд призначених міст",
    },
    create: {
      code: "viewer",
      name: "Спостерігач",
      description: "Лише перегляд призначених міст",
    },
  });

  const adminPasswordHash = await bcrypt.hash("admin12345", 10);

  await prisma.user.upsert({
    where: { login: "admin" },
    update: {
      roleId: superAdminRole.id,
      name: "Головний адміністратор",
      email: "admin@example.com",
      passwordHash: adminPasswordHash,
      isActive: true,
    },
    create: {
      roleId: superAdminRole.id,
      name: "Головний адміністратор",
      login: "admin",
      email: "admin@example.com",
      passwordHash: adminPasswordHash,
      isActive: true,
    },
  });

  const systemTripGoals = [
    {
      name: "Спрацювання ОХ",
      systemCode: "alarm_oh",
      sortOrder: 10,
    },
    {
      name: "Спрацювання партнерів",
      systemCode: "alarm_partner",
      sortOrder: 20,
    },
    {
      name: "Список спрацювань",
      systemCode: "additional_alarm_list",
      sortOrder: 30,
    },
    {
      name: "Мийка",
      systemCode: "wash",
      sortOrder: 40,
    },
    {
      name: "Перезміна",
      systemCode: "shift_change",
      sortOrder: 50,
    },
    {
      name: "Перевірка",
      systemCode: "check",
      sortOrder: 60,
    },
  ];

  for (const goal of systemTripGoals) {
    await prisma.tripGoal.upsert({
      where: { systemCode: goal.systemCode },
      update: {
        name: goal.name,
        isSystem: true,
        isActive: true,
        sortOrder: goal.sortOrder,
      },
      create: {
        name: goal.name,
        systemCode: goal.systemCode,
        isSystem: true,
        isActive: true,
        sortOrder: goal.sortOrder,
      },
    });
  }

  const customTripGoals = [
    { name: "Патруль", sortOrder: 100 },
    { name: "Точка", sortOrder: 110 },
    { name: "Ознайомлення", sortOrder: 120 },
    { name: "Туалет/Обід", sortOrder: 130 },
    { name: "Підвезення ОХ", sortOrder: 140 },
    { name: "Підвезення партнерів", sortOrder: 150 },
    { name: "СТО", sortOrder: 160 },
    { name: "Інше", sortOrder: 999 },
  ];

  for (const goal of customTripGoals) {
    const existing = await prisma.tripGoal.findFirst({
      where: {
        name: goal.name,
        systemCode: null,
        deletedAt: null,
      },
    });

    if (!existing) {
      await prisma.tripGoal.create({
        data: {
          name: goal.name,
          systemCode: null,
          isSystem: false,
          isActive: true,
          sortOrder: goal.sortOrder,
        },
      });
    }
  }

  const reasons = [
    {
      name: "Воєнні дії",
      sortOrder: 10,
    },
    {
      name: "Масове відключення",
      sortOrder: 20,
    },
    {
      name: "Свій варіант",
      sortOrder: 999,
    },
  ];

  for (const reason of reasons) {
    const existing = await prisma.additionalAlarmReason.findFirst({
      where: {
        name: reason.name,
        deletedAt: null,
      },
    });

    if (!existing) {
      await prisma.additionalAlarmReason.create({
        data: {
          name: reason.name,
          isSystem: true,
          isActive: true,
          sortOrder: reason.sortOrder,
        },
      });
    }
  }

  const telegramSettingsCount = await prisma.telegramSetting.count();

  if (telegramSettingsCount === 0) {
    await prisma.telegramSetting.create({
      data: {
        botTokenEncrypted: null,
        isEnabled: false,
      },
    });
  }

  console.log("Заповнення бази даних завершено.");
  console.log("");
  console.log("Адміністратор за замовчуванням:");
  console.log("login: admin");
  console.log("password: admin12345");
  console.log("");
  console.log("Змініть цей пароль пізніше в адміністративній панелі.");
}

main()
  .catch((error) => {
    console.error("Помилка заповнення бази даних:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });