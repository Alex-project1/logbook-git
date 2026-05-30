import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Start seeding...");

  const superAdminRole = await prisma.role.upsert({
    where: {
      code: "super_admin",
    },
    update: {
      name: "Супер администратор",
      description: "Полный доступ ко всем разделам",
    },
    create: {
      code: "super_admin",
      name: "Супер администратор",
      description: "Полный доступ ко всем разделам",
    },
  });

  await prisma.role.upsert({
    where: {
      code: "admin",
    },
    update: {
      name: "Администратор",
      description: "Управление назначенными городами",
    },
    create: {
      code: "admin",
      name: "Администратор",
      description: "Управление назначенными городами",
    },
  });

  await prisma.role.upsert({
    where: {
      code: "viewer",
    },
    update: {
      name: "Наблюдатель",
      description: "Только просмотр назначенных городов",
    },
    create: {
      code: "viewer",
      name: "Наблюдатель",
      description: "Только просмотр назначенных городов",
    },
  });

  const adminPasswordHash = await bcrypt.hash("admin12345", 10);

  await prisma.user.upsert({
    where: { login: "admin" },
    update: {
      roleId: superAdminRole.id,
      name: "Главный администратор",
      email: "admin@example.com",
      passwordHash: adminPasswordHash,
      isActive: true,
    },
    create: {
      roleId: superAdminRole.id,
      name: "Главный администратор",
      login: "admin",
      email: "admin@example.com",
      passwordHash: adminPasswordHash,
      isActive: true,
    },
  });

  const systemTripGoals = [
    {
      name: "Сработка ОХ",
      systemCode: "alarm_oh",
      sortOrder: 10,
    },
    {
      name: "Сработка Партнеры",
      systemCode: "alarm_partner",
      sortOrder: 20,
    },
    {
      name: "Список сработок",
      systemCode: "additional_alarm_list",
      sortOrder: 30,
    },
    {
      name: "Мойка",
      systemCode: "wash",
      sortOrder: 40,
    },
    {
      name: "Пересменка",
      systemCode: "shift_change",
      sortOrder: 50,
    },
    {
      name: "Проверка",
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
    { name: "Ознакомление", sortOrder: 120 },
    { name: "Туалет/Обед", sortOrder: 130 },
    { name: "Подвоз ОХ", sortOrder: 140 },
    { name: "Подвоз Партнеры", sortOrder: 150 },
    { name: "СТО", sortOrder: 160 },
    { name: "Другое", sortOrder: 999 },
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
      name: "Военные действия",
      sortOrder: 10,
    },
    {
      name: "Массовое отключение",
      sortOrder: 20,
    },
    {
      name: "Свой вариант",
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

  console.log("Seeding completed.");
  console.log("");
  console.log("Default admin:");
  console.log("login: admin");
  console.log("password: admin12345");
  console.log("");
  console.log("Change this password later in admin panel.");
}

main()
  .catch((error) => {
    console.error("Seed error:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });