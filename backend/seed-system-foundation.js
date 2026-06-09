const { PrismaClient, DepartmentType } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

const systemCities = [
  { id: 1, name: 'Київ', lat: 50.4501, lng: 30.5234 },
  { id: 2, name: 'Запоріжжя', lat: 47.8388, lng: 35.1396 },
  { id: 3, name: 'Дніпро', lat: 48.4647, lng: 35.0462 },
  { id: 4, name: 'Львів', lat: 49.8397, lng: 24.0297 },
  { id: 5, name: 'Павлоград', lat: 48.5321, lng: 35.87 },
  { id: 6, name: 'Кам’янське', lat: 48.511339, lng: 34.602103 },
  { id: 8, name: 'Кривий Ріг', lat: 47.9105, lng: 33.3918 },
];

const tripGoals = [
  { name: 'Спрацювання ОХ', systemCode: 'alarm_oh', sortOrder: 10 },
  { name: 'Спрацювання Партнери', systemCode: 'alarm_partner', sortOrder: 20 },
  { name: 'Список спрацювань', systemCode: 'additional_alarm_list', sortOrder: 30 },
  { name: 'Мийка', systemCode: 'wash', sortOrder: 40 },
  { name: 'Перезміна', systemCode: 'shift_change', sortOrder: 50 },
  { name: 'Перевірка', systemCode: 'check', sortOrder: 60 },
];

const normalTripGoals = [
  { name: 'Патруль', sortOrder: 100 },
  { name: 'Контрольна точка', sortOrder: 110 },
  { name: 'Ознайомлення', sortOrder: 120 },
  { name: 'Туалет/Обід', sortOrder: 130 },
  { name: 'Підвіз ОХ', sortOrder: 140 },
  { name: 'Підвіз Партнери', sortOrder: 150 },
  { name: 'СТО', sortOrder: 160 },
  { name: 'Інше', sortOrder: 170 },
];

const reasons = [
  { name: 'Військові дії', sortOrder: 10 },
  { name: 'Масове відключення електроенергії', sortOrder: 20 },
  { name: 'Свій варіант', sortOrder: 30 },
];

async function upsertRoles() {
  const roles = [
    { code: 'super_admin', name: 'Головний адміністратор' },
    { code: 'admin', name: 'Адміністратор' },
    { code: 'viewer', name: 'Перегляд' },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: { name: role.name },
      create: role,
    });
  }
}

async function upsertAdmin() {
  const role = await prisma.role.findUnique({ where: { code: 'super_admin' } });
  const password = process.env.SEED_ADMIN_PASSWORD || 'Admin12345!';
  const passwordHash = await bcrypt.hash(password, 10);

  const admin = await prisma.user.upsert({
    where: { login: 'admin' },
    update: { roleId: role.id, name: 'Admin', isActive: true, deletedAt: null },
    create: { roleId: role.id, name: 'Admin', login: 'admin', passwordHash, isActive: true },
  });

  return { admin, password };
}

async function main() {
  await upsertRoles();
  const { admin, password } = await upsertAdmin();

  const createdCities = [];
  const createdDepartments = [];

  for (const city of systemCities) {
    const savedCity = await prisma.city.upsert({
      where: { id: city.id },
      update: { name: city.name, isActive: true, deletedAt: null },
      create: { id: city.id, name: city.name, isActive: true },
    });
    createdCities.push(savedCity);

    const department = await prisma.department.upsert({
      where: { cityId_name: { cityId: city.id, name: 'ГШР' } },
      update: { type: DepartmentType.GBR, isSystem: true, isActive: true, deletedAt: null },
      create: { cityId: city.id, name: 'ГШР', type: DepartmentType.GBR, isSystem: true, isActive: true },
    });
    createdDepartments.push(department);

    await prisma.adminCityAccess.upsert({
      where: { userId_cityId: { userId: admin.id, cityId: city.id } },
      update: { accessLevel: 'FULL', canAddShift: true, canDeleteShift: true },
      create: { userId: admin.id, cityId: city.id, accessLevel: 'FULL', canAddShift: true, canDeleteShift: true },
    });

    await prisma.adminDepartmentAccess.upsert({
      where: { userId_departmentId: { userId: admin.id, departmentId: department.id } },
      update: { cityId: city.id, accessLevel: 'FULL', canAddShift: true, canDeleteShift: true },
      create: { userId: admin.id, cityId: city.id, departmentId: department.id, accessLevel: 'FULL', canAddShift: true, canDeleteShift: true },
    });
  }

  for (const goal of tripGoals) {
    await prisma.tripGoal.upsert({
      where: { systemCode: goal.systemCode },
      update: { name: goal.name, sortOrder: goal.sortOrder, isSystem: true, isActive: true, deletedAt: null },
      create: { ...goal, isSystem: true, isActive: true },
    });
  }

  for (const goal of normalTripGoals) {
    const existing = await prisma.tripGoal.findFirst({ where: { name: goal.name, systemCode: null } });
    if (existing) {
      await prisma.tripGoal.update({ where: { id: existing.id }, data: { sortOrder: goal.sortOrder, isActive: true, deletedAt: null } });
    } else {
      await prisma.tripGoal.create({ data: { name: goal.name, systemCode: null, sortOrder: goal.sortOrder, isSystem: false, isActive: true } });
    }
  }

  for (const reason of reasons) {
    const existing = await prisma.additionalAlarmReason.findFirst({ where: { name: reason.name } });
    if (existing) {
      await prisma.additionalAlarmReason.update({ where: { id: existing.id }, data: { sortOrder: reason.sortOrder, isSystem: true, isActive: true, deletedAt: null } });
    } else {
      await prisma.additionalAlarmReason.create({ data: { ...reason, isSystem: true, isActive: true } });
    }
  }

  const objectsMap = {};
  for (const city of systemCities) {
    objectsMap[String(city.id)] = { externalRegionId: city.id, lat: city.lat, lng: city.lng };
  }

  console.log('ГОТОВО');
  console.log('Admin login: admin');
  console.log('Admin password:', password);
  console.log('Города:', createdCities.map((c) => `${c.id}:${c.name}`).join(', '));
  console.log('Подразделения ГШР:', createdDepartments.map((d) => `${d.cityId}:${d.id}:${d.name}`).join(', '));
  console.log('OBJECTS_CITY_REGION_MAP=\'' + JSON.stringify(objectsMap) + '\'');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
