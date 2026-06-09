import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import {
  buildCityAccessWhere,
  buildDepartmentAccessWhere,
  canEditDepartmentData,
  getAllowedCityIds,
  getAllowedDepartmentIds,
} from "../../utils/admin-access";

const updateMobileUserSchema = z.object({
  login: z.string().min(1, "Login is required").optional(),
  newPassword: z.string().min(6, "Password must be at least 6 characters").optional(),
  confirmNewPassword: z.string().optional(),
  comment: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

function mobileUserSelect() {
  return {
    id: true,
    cityId: true,
    departmentId: true,
    userKind: true,
    crewId: true,
    dutyPostId: true,
    login: true,
    displayName: true,
    comment: true,
    isActive: true,
    deletedAt: true,
    createdAt: true,
    updatedAt: true,
    city: { select: { id: true, name: true } },
    department: { select: { id: true, name: true, type: true } },
    crew: { select: { id: true, name: true } },
    dutyPost: { select: { id: true, name: true } },
  } as const;
}

export async function getMobileUsers(req: Request, res: Response) {
  try {
    const cityId = req.query.cityId ? Number(req.query.cityId) : undefined;
    const departmentId = req.query.departmentId ? Number(req.query.departmentId) : undefined;
    const includeInactive = req.query.includeInactive === "true";
    const archive = req.query.archive === "true";
    const userKind = req.query.userKind === "CREW" || req.query.userKind === "POST" ? String(req.query.userKind) : undefined;

    const allowedCityIds = await getAllowedCityIds(req);
    const allowedDepartmentIds = await getAllowedDepartmentIds(req);

    if (allowedCityIds !== null && cityId && !allowedCityIds.includes(cityId)) return res.json({ data: [] });
    if (allowedDepartmentIds !== null && departmentId && !allowedDepartmentIds.includes(departmentId)) return res.json({ data: [] });

    const mobileUsers = await prisma.mobileUser.findMany({
      where: {
        ...(archive ? { deletedAt: { not: null } } : { deletedAt: null }),
        ...(cityId ? { cityId } : buildCityAccessWhere(allowedCityIds)),
        ...(departmentId ? { departmentId } : buildDepartmentAccessWhere(allowedDepartmentIds)),
        ...(userKind ? { userKind: userKind as any } : {}),
        ...(includeInactive || archive ? {} : { isActive: true }),
      },
      orderBy: { login: "asc" },
      select: mobileUserSelect(),
    });

    return res.json({ data: mobileUsers });
  } catch (error) {
    console.error("getMobileUsers error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function getMobileUserById(req: Request, res: Response) {
  try {
    const mobileUserId = Number(req.params.id);
    if (!Number.isInteger(mobileUserId)) return res.status(400).json({ message: "Invalid mobile user id" });

    const allowedCityIds = await getAllowedCityIds(req);
    const allowedDepartmentIds = await getAllowedDepartmentIds(req);
    const mobileUser = await prisma.mobileUser.findFirst({
      where: { id: mobileUserId, deletedAt: null, ...buildCityAccessWhere(allowedCityIds), ...buildDepartmentAccessWhere(allowedDepartmentIds) },
      select: mobileUserSelect(),
    });

    if (!mobileUser) return res.status(404).json({ message: "Mobile user not found" });
    return res.json({ data: mobileUser });
  } catch (error) {
    console.error("getMobileUserById error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function createMobileUser(req: Request, res: Response) {
  return res.status(400).json({
    message: "Пользователь приложения создается через справочник Наряды ГБР или Доп. посты",
  });
}

export async function updateMobileUser(req: Request, res: Response) {
  try {
    const mobileUserId = Number(req.params.id);
    if (!Number.isInteger(mobileUserId)) return res.status(400).json({ message: "Invalid mobile user id" });

    const parsed = updateMobileUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.flatten() });

    const mobileUser = await prisma.mobileUser.findFirst({ where: { id: mobileUserId, deletedAt: null } });
    if (!mobileUser) return res.status(404).json({ message: "Mobile user not found" });
    if (!(await canEditDepartmentData(req, mobileUser.departmentId))) return res.status(403).json({ message: "Недостаточно прав для этого подразделения" });

    if (parsed.data.login && parsed.data.login !== mobileUser.login) {
      const existingUser = await prisma.mobileUser.findUnique({ where: { login: parsed.data.login.trim() } });
      if (existingUser) return res.status(409).json({ message: "Mobile user with this login already exists" });
    }

    let passwordHash: string | undefined;
    if (parsed.data.newPassword || parsed.data.confirmNewPassword) {
      if (!parsed.data.newPassword || parsed.data.newPassword.length < 6) return res.status(400).json({ message: "Новый пароль должен быть минимум 6 символов" });
      if (parsed.data.newPassword !== parsed.data.confirmNewPassword) return res.status(400).json({ message: "Новые пароли не совпадают" });
      passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
    }

    const updatedMobileUser = await prisma.mobileUser.update({
      where: { id: mobileUserId },
      data: {
        login: parsed.data.login?.trim(),
        passwordHash,
        comment: parsed.data.comment === undefined ? undefined : parsed.data.comment?.trim() || null,
        isActive: parsed.data.isActive,
      },
      select: mobileUserSelect(),
    });

    return res.json({ data: updatedMobileUser });
  } catch (error) {
    console.error("updateMobileUser error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function deleteMobileUser(req: Request, res: Response) {
  try {
    const mobileUserId = Number(req.params.id);
    if (!Number.isInteger(mobileUserId)) return res.status(400).json({ message: "Invalid mobile user id" });

    const mobileUser = await prisma.mobileUser.findFirst({ where: { id: mobileUserId, deletedAt: null } });
    if (!mobileUser) return res.status(404).json({ message: "Mobile user not found" });
    if (!(await canEditDepartmentData(req, mobileUser.departmentId))) return res.status(403).json({ message: "Недостаточно прав для этого подразделения" });

    await prisma.mobileUser.update({ where: { id: mobileUserId }, data: { deletedAt: new Date(), isActive: false } });
    return res.json({ message: "Mobile user archived successfully" });
  } catch (error) {
    console.error("deleteMobileUser error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function restoreMobileUser(req: Request, res: Response) {
  try {
    const mobileUserId = Number(req.params.id);
    if (!Number.isInteger(mobileUserId)) return res.status(400).json({ message: "Invalid mobile user id" });

    const mobileUser = await prisma.mobileUser.findUnique({ where: { id: mobileUserId } });
    if (!mobileUser) return res.status(404).json({ message: "Mobile user not found" });
    if (!(await canEditDepartmentData(req, mobileUser.departmentId))) return res.status(403).json({ message: "Недостаточно прав для этого подразделения" });

    const restoredMobileUser = await prisma.mobileUser.update({ where: { id: mobileUserId }, data: { deletedAt: null, isActive: true }, select: mobileUserSelect() });
    return res.json({ data: restoredMobileUser });
  } catch (error) {
    console.error("restoreMobileUser error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}
