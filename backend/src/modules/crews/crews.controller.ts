import { Request, Response } from "express";
import { z } from "zod";
import bcrypt from "bcrypt";
import { CrewDutyType, CrewTransportType, DepartmentType, MobileUserKind } from "@prisma/client";
import { prisma } from "../../config/prisma";
import {
  buildCityAccessWhere,
  buildDepartmentAccessWhere,
  canEditDepartmentData,
  getAllowedCityIds,
  getAllowedDepartmentIds,
} from "../../utils/admin-access";
import { validateDepartmentInCity } from "../../utils/departments";

const passwordSchema = z.string().min(6, "Пароль должен быть минимум 6 символов");

const createCrewSchema = z.object({
  cityId: z.number().int().positive(),
  departmentId: z.number().int().positive(),
  name: z.string().min(1, "Crew name is required"),
  login: z.string().min(1, "Login is required"),
  password: passwordSchema,
  confirmPassword: z.string().min(1),
  comment: z.string().optional().nullable(),
  dutyType: z.nativeEnum(CrewDutyType).optional(),
  transportType: z.nativeEnum(CrewTransportType).optional(),
  durationHours: z.number().positive().max(24).optional(),
  telegramEnabled: z.boolean().optional(),
  telegramChannelId: z.number().int().positive().optional().nullable(),
  telegramChannelIds: z.array(z.number().int().positive()).optional(),
  isActive: z.boolean().optional(),
});

const updateCrewSchema = z.object({
  cityId: z.number().int().positive().optional(),
  departmentId: z.number().int().positive().optional(),
  name: z.string().min(1, "Crew name is required").optional(),
  login: z.string().min(1, "Login is required").optional(),
  newPassword: z.string().optional(),
  confirmNewPassword: z.string().optional(),
  comment: z.string().optional().nullable(),
  dutyType: z.nativeEnum(CrewDutyType).optional(),
  transportType: z.nativeEnum(CrewTransportType).optional(),
  durationHours: z.number().positive().max(24).optional(),
  telegramEnabled: z.boolean().optional(),
  telegramChannelId: z.number().int().positive().optional().nullable(),
  telegramChannelIds: z.array(z.number().int().positive()).optional(),
  isActive: z.boolean().optional(),
});

function normalizeCrewDurationHours(dutyType: CrewDutyType, durationHours?: number | null) {
  if (dutyType === CrewDutyType.FULL_DAY) return 24;
  const value = Number(durationHours);
  if (!Number.isFinite(value) || value <= 0 || value > 24) throw new Error("Для дневного или ночного наряда укажите часы от 0 до 24");
  return Number(value.toFixed(2));
}


function normalizeTelegramChannelIds(data: {
  telegramChannelId?: number | null;
  telegramChannelIds?: number[];
}) {
  const ids = data.telegramChannelIds?.length
    ? data.telegramChannelIds
    : data.telegramChannelId
      ? [data.telegramChannelId]
      : [];

  return Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0)));
}

async function validateTelegramChannels(channelIds: number[]) {
  if (channelIds.length === 0) return true;

  const count = await prisma.telegramChannel.count({
    where: {
      id: { in: channelIds },
      deletedAt: null,
      isActive: true,
      bot: { deletedAt: null, isActive: true },
    },
  });

  return count === channelIds.length;
}

function crewSelect() {
  return {
    id: true,
    cityId: true,
    departmentId: true,
    name: true,
    comment: true,
    isActive: true,
    deletedAt: true,
    createdAt: true,
    updatedAt: true,
    dutyType: true,
    transportType: true,
    durationHours: true,
    telegramEnabled: true,
    telegramChannelId: true,
    telegramChannel: { select: { id: true, name: true, chatId: true, isActive: true } },
    telegramChannels: {
      include: {
        channel: { select: { id: true, name: true, chatId: true, isActive: true } },
      },
    },
    city: { select: { id: true, name: true } },
    department: { select: { id: true, name: true, type: true } },
    mobileUsers: {
      where: { userKind: MobileUserKind.CREW },
      select: { id: true, login: true, isActive: true, deletedAt: true },
      take: 1,
    },
  } as const;
}

function sanitizeCrew(crew: any) {
  const mobileUser = crew.mobileUsers?.[0] ?? null;
  const telegramChannels = (crew.telegramChannels ?? [])
    .map((link: any) => link.channel)
    .filter(Boolean);
  const { mobileUsers, telegramChannels: _telegramChannelLinks, ...rest } = crew;

  return {
    ...rest,
    telegramChannels,
    telegramChannelIds: telegramChannels.map((channel: any) => channel.id),
    mobileUser,
    login: mobileUser?.login ?? "",
  };
}

export async function getCrews(req: Request, res: Response) {
  try {
    const cityId = req.query.cityId ? Number(req.query.cityId) : undefined;
    const departmentId = req.query.departmentId ? Number(req.query.departmentId) : undefined;
    const includeInactive = req.query.includeInactive === "true";
    const archive = req.query.archive === "true";

    const allowedCityIds = await getAllowedCityIds(req);
    const allowedDepartmentIds = await getAllowedDepartmentIds(req);

    if (allowedCityIds !== null && cityId && !allowedCityIds.includes(cityId)) return res.json({ data: [] });
    if (allowedDepartmentIds !== null && departmentId && !allowedDepartmentIds.includes(departmentId)) return res.json({ data: [] });

    const crews = await prisma.crew.findMany({
      where: {
        ...(archive ? { deletedAt: { not: null } } : { deletedAt: null }),
        ...(cityId ? { cityId } : buildCityAccessWhere(allowedCityIds)),
        ...(departmentId ? { departmentId } : buildDepartmentAccessWhere(allowedDepartmentIds)),
        ...(includeInactive || archive ? {} : { isActive: true }),
      },
      orderBy: { name: "asc" },
      select: crewSelect(),
    });

    return res.json({ data: crews.map(sanitizeCrew) });
  } catch (error) {
    console.error("getCrews error:", error);
    return res.status(500).json({ message: "Внутрішня помилка сервера" });
  }
}

export async function getCrewById(req: Request, res: Response) {
  try {
    const crewId = Number(req.params.id);
    if (!Number.isInteger(crewId)) return res.status(400).json({ message: "Invalid crew id" });

    const allowedCityIds = await getAllowedCityIds(req);
    const allowedDepartmentIds = await getAllowedDepartmentIds(req);

    const crew = await prisma.crew.findFirst({
      where: { id: crewId, deletedAt: null, ...buildCityAccessWhere(allowedCityIds), ...buildDepartmentAccessWhere(allowedDepartmentIds) },
      select: crewSelect(),
    });

    if (!crew) return res.status(404).json({ message: "Crew not found" });
    return res.json({ data: sanitizeCrew(crew) });
  } catch (error) {
    console.error("getCrewById error:", error);
    return res.status(500).json({ message: "Внутрішня помилка сервера" });
  }
}

export async function createCrew(req: Request, res: Response) {
  try {
    const parsed = createCrewSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.flatten() });
    if (parsed.data.password !== parsed.data.confirmPassword) return res.status(400).json({ message: "Пароли не совпадают" });

    if (!(await canEditDepartmentData(req, parsed.data.departmentId))) return res.status(403).json({ message: "Недостатньо прав для цього підрозділу" });

    const department = await validateDepartmentInCity({ cityId: parsed.data.cityId, departmentId: parsed.data.departmentId, requiredType: DepartmentType.GBR });
    if (!department) return res.status(404).json({ message: "Подразделение ГШР не найдено или неактивно" });

    const existingCrew = await prisma.crew.findFirst({ where: { cityId: parsed.data.cityId, name: parsed.data.name.trim(), deletedAt: null } });
    if (existingCrew) return res.status(409).json({ message: "Наряд с таким названием уже существует" });

    const existingLogin = await prisma.mobileUser.findUnique({ where: { login: parsed.data.login.trim() } });
    if (existingLogin) return res.status(409).json({ message: "Такой логин уже используется" });

    const dutyType = parsed.data.dutyType ?? CrewDutyType.FULL_DAY;
    const transportType = parsed.data.transportType ?? CrewTransportType.AUTO;
    let durationHours = 24;
    try { durationHours = normalizeCrewDurationHours(dutyType, parsed.data.durationHours); } catch (error) { return res.status(400).json({ message: error instanceof Error ? error.message : "Некорректная длительность" }); }

    const telegramChannelIds = parsed.data.telegramEnabled
      ? normalizeTelegramChannelIds(parsed.data)
      : [];

    if (parsed.data.telegramEnabled && telegramChannelIds.length === 0) {
      return res.status(400).json({ message: "Оберіть хоча б один Telegram-канал або вимкніть відправку" });
    }

    if (parsed.data.telegramEnabled && !(await validateTelegramChannels(telegramChannelIds))) {
      return res.status(400).json({ message: "Оберіть активні Telegram-канали" });
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);

    const crew = await prisma.$transaction(async (tx) => {
      const createdCrew = await tx.crew.create({
        data: {
          cityId: parsed.data.cityId,
          departmentId: parsed.data.departmentId,
          name: parsed.data.name.trim(),
          comment: parsed.data.comment?.trim() || null,
          dutyType,
          transportType,
          durationHours,
          telegramEnabled: parsed.data.telegramEnabled ?? false,
          telegramChannelId: telegramChannelIds[0] ?? null,
          isActive: parsed.data.isActive ?? true,
        },
      });

      if (telegramChannelIds.length > 0) {
        await tx.crewTelegramChannel.createMany({
          data: telegramChannelIds.map((channelId) => ({
            crewId: createdCrew.id,
            channelId,
          })),
          skipDuplicates: true,
        });
      }

      await tx.mobileUser.create({
        data: {
          cityId: parsed.data.cityId,
          departmentId: parsed.data.departmentId,
          userKind: MobileUserKind.CREW,
          crewId: createdCrew.id,
          login: parsed.data.login.trim(),
          passwordHash,
          displayName: createdCrew.name,
          comment: parsed.data.comment?.trim() || null,
          isActive: parsed.data.isActive ?? true,
        },
      });

      return tx.crew.findUniqueOrThrow({ where: { id: createdCrew.id }, select: crewSelect() });
    });

    return res.status(201).json({ data: sanitizeCrew(crew) });
  } catch (error) {
    console.error("createCrew error:", error);
    return res.status(500).json({ message: "Внутрішня помилка сервера" });
  }
}

export async function updateCrew(req: Request, res: Response) {
  try {
    const crewId = Number(req.params.id);
    if (!Number.isInteger(crewId)) return res.status(400).json({ message: "Invalid crew id" });

    const parsed = updateCrewSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.flatten() });

    const crew = await prisma.crew.findFirst({ where: { id: crewId, deletedAt: null } });
    if (!crew) return res.status(404).json({ message: "Crew not found" });
    if (!(await canEditDepartmentData(req, crew.departmentId))) return res.status(403).json({ message: "Недостатньо прав для поточного підрозділу" });

    const nextCityId = parsed.data.cityId ?? crew.cityId;
    const nextDepartmentId = parsed.data.departmentId ?? crew.departmentId;
    const nextTelegramEnabled = parsed.data.telegramEnabled ?? crew.telegramEnabled;

    const existingTelegramLinks = await prisma.crewTelegramChannel.findMany({
      where: { crewId },
      select: { channelId: true },
    });

    const nextTelegramChannelIds = nextTelegramEnabled
      ? parsed.data.telegramChannelIds !== undefined || parsed.data.telegramChannelId !== undefined
        ? normalizeTelegramChannelIds(parsed.data)
        : existingTelegramLinks.length > 0
          ? existingTelegramLinks.map((link) => link.channelId)
          : crew.telegramChannelId
            ? [crew.telegramChannelId]
            : []
      : [];

    if (nextTelegramEnabled && nextTelegramChannelIds.length === 0) {
      return res.status(400).json({ message: "Оберіть хоча б один Telegram-канал або вимкніть відправку" });
    }

    if (nextTelegramEnabled && !(await validateTelegramChannels(nextTelegramChannelIds))) {
      return res.status(400).json({ message: "Оберіть активні Telegram-канали" });
    }

    if (nextDepartmentId !== crew.departmentId && !(await canEditDepartmentData(req, nextDepartmentId))) return res.status(403).json({ message: "Недостатньо прав для нового підрозділу" });

    const department = await validateDepartmentInCity({ cityId: nextCityId, departmentId: nextDepartmentId, requiredType: DepartmentType.GBR });
    if (!department) return res.status(404).json({ message: "Подразделение ГШР не найдено или неактивно" });

    const nextName = parsed.data.name?.trim() ?? crew.name;
    const duplicate = await prisma.crew.findFirst({ where: { cityId: nextCityId, name: nextName, deletedAt: null, NOT: { id: crewId } } });
    if (duplicate) return res.status(409).json({ message: "Наряд с таким названием уже существует" });

    const mobileUser = await prisma.mobileUser.findFirst({ where: { crewId, userKind: MobileUserKind.CREW } });
    const login = parsed.data.login?.trim();
    if (login && login !== mobileUser?.login) {
      const existingLogin = await prisma.mobileUser.findUnique({ where: { login } });
      if (existingLogin) return res.status(409).json({ message: "Такой логин уже используется" });
    }

    let passwordHash: string | undefined;
    if (parsed.data.newPassword || parsed.data.confirmNewPassword) {
      if (!parsed.data.newPassword || parsed.data.newPassword.length < 6) return res.status(400).json({ message: "Новый пароль должен быть минимум 6 символов" });
      if (parsed.data.newPassword !== parsed.data.confirmNewPassword) return res.status(400).json({ message: "Новые пароли не совпадают" });
      passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
    }

    const nextDutyType = parsed.data.dutyType ?? crew.dutyType;
    const nextTransportType = parsed.data.transportType ?? crew.transportType;
    let nextDurationHours = 24;
    try { nextDurationHours = normalizeCrewDurationHours(nextDutyType, parsed.data.durationHours ?? Number(crew.durationHours)); } catch (error) { return res.status(400).json({ message: error instanceof Error ? error.message : "Некорректная длительность" }); }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.crew.update({
        where: { id: crewId },
        data: {
          cityId: parsed.data.cityId,
          departmentId: parsed.data.departmentId,
          name: parsed.data.name?.trim(),
          comment: parsed.data.comment === undefined ? undefined : parsed.data.comment?.trim() || null,
          telegramEnabled: parsed.data.telegramEnabled,
          telegramChannelId: nextTelegramEnabled ? nextTelegramChannelIds[0] ?? null : null,
          isActive: parsed.data.isActive,
          dutyType: nextDutyType,
          transportType: nextTransportType,
          durationHours: nextDurationHours,
        },
      });

      await tx.crewTelegramChannel.deleteMany({ where: { crewId } });

      if (nextTelegramChannelIds.length > 0) {
        await tx.crewTelegramChannel.createMany({
          data: nextTelegramChannelIds.map((channelId) => ({ crewId, channelId })),
          skipDuplicates: true,
        });
      }

      if (mobileUser) {
        await tx.mobileUser.update({
          where: { id: mobileUser.id },
          data: {
            cityId: parsed.data.cityId,
            departmentId: parsed.data.departmentId,
            login,
            passwordHash,
            displayName: parsed.data.name?.trim(),
            comment: parsed.data.comment === undefined ? undefined : parsed.data.comment?.trim() || null,
            isActive: parsed.data.isActive,
          },
        });
      }

      return tx.crew.findUniqueOrThrow({ where: { id: crewId }, select: crewSelect() });
    });

    return res.json({ data: sanitizeCrew(updated) });
  } catch (error) {
    console.error("updateCrew error:", error);
    return res.status(500).json({ message: "Внутрішня помилка сервера" });
  }
}

export async function deleteCrew(req: Request, res: Response) {
  try {
    const crewId = Number(req.params.id);
    if (!Number.isInteger(crewId)) return res.status(400).json({ message: "Invalid crew id" });

    const crew = await prisma.crew.findFirst({ where: { id: crewId, deletedAt: null } });
    if (!crew) return res.status(404).json({ message: "Crew not found" });
    if (!(await canEditDepartmentData(req, crew.departmentId))) return res.status(403).json({ message: "Недостатньо прав для цього підрозділу" });

    await prisma.$transaction([
      prisma.crew.update({ where: { id: crewId }, data: { deletedAt: new Date(), isActive: false } }),
      prisma.mobileUser.updateMany({ where: { crewId, userKind: MobileUserKind.CREW }, data: { deletedAt: new Date(), isActive: false } }),
    ]);

    return res.json({ message: "Crew archived successfully" });
  } catch (error) {
    console.error("deleteCrew error:", error);
    return res.status(500).json({ message: "Внутрішня помилка сервера" });
  }
}

export async function restoreCrew(req: Request, res: Response) {
  try {
    const crewId = Number(req.params.id);
    if (!Number.isInteger(crewId)) return res.status(400).json({ message: "Invalid crew id" });

    const crew = await prisma.crew.findUnique({ where: { id: crewId } });
    if (!crew) return res.status(404).json({ message: "Crew not found" });
    if (!(await canEditDepartmentData(req, crew.departmentId))) return res.status(403).json({ message: "Недостатньо прав для цього підрозділу" });

    const restored = await prisma.$transaction(async (tx) => {
      await tx.crew.update({ where: { id: crewId }, data: { deletedAt: null, isActive: true } });
      await tx.mobileUser.updateMany({ where: { crewId, userKind: MobileUserKind.CREW }, data: { deletedAt: null, isActive: true } });
      return tx.crew.findUniqueOrThrow({ where: { id: crewId }, select: crewSelect() });
    });

    return res.json({ data: sanitizeCrew(restored) });
  } catch (error) {
    console.error("restoreCrew error:", error);
    return res.status(500).json({ message: "Внутрішня помилка сервера" });
  }
}
