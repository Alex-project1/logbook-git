import type { Request, Response } from "express";
import { z } from "zod";
import bcrypt from "bcrypt";
import { MobileUserKind } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { createAdminActionLog } from "../../utils/admin-action-log";
import {
  buildCityAccessWhere,
  buildDepartmentAccessWhere,
  canEditDepartmentData,
  getAllowedCityIds,
  getAllowedDepartmentIds,
} from "../../utils/admin-access";
import { validateDepartmentInCity } from "../../utils/departments";

const createDutyPostSchema = z.object({
  cityId: z.number().int().positive(),
  departmentId: z.number().int().positive(),
  name: z.string().min(1, "Post name is required"),
  login: z.string().min(1, "Login is required"),
  password: z.string().min(6, "Пароль должен быть минимум 6 символов"),
  confirmPassword: z.string().min(1),
  comment: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

const updateDutyPostSchema = z.object({
  cityId: z.number().int().positive().optional(),
  departmentId: z.number().int().positive().optional(),
  name: z.string().min(1, "Post name is required").optional(),
  login: z.string().min(1, "Login is required").optional(),
  newPassword: z.string().optional(),
  confirmNewPassword: z.string().optional(),
  comment: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

function postSelect() {
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
    city: { select: { id: true, name: true } },
    department: { select: { id: true, name: true, type: true } },
    mobileUsers: {
      where: { userKind: MobileUserKind.POST },
      select: { id: true, login: true, isActive: true, deletedAt: true },
      take: 1,
    },
  } as const;
}

function sanitizePost(post: any) {
  const mobileUser = post.mobileUsers?.[0] ?? null;
  const { mobileUsers, ...rest } = post;
  return { ...rest, mobileUser, login: mobileUser?.login ?? "" };
}

export async function getDutyPosts(req: Request, res: Response) {
  try {
    const cityId = req.query.cityId ? Number(req.query.cityId) : undefined;
    const departmentId = req.query.departmentId ? Number(req.query.departmentId) : undefined;
    const includeInactive = req.query.includeInactive === "true";
    const archive = req.query.archive === "true";

    const allowedCityIds = await getAllowedCityIds(req);
    const allowedDepartmentIds = await getAllowedDepartmentIds(req);

    if (allowedCityIds !== null && cityId && !allowedCityIds.includes(cityId)) return res.json({ data: [] });
    if (allowedDepartmentIds !== null && departmentId && !allowedDepartmentIds.includes(departmentId)) return res.json({ data: [] });

    const posts = await prisma.dutyPost.findMany({
      where: {
        ...(archive ? { deletedAt: { not: null } } : { deletedAt: null }),
        ...(cityId ? { cityId } : buildCityAccessWhere(allowedCityIds)),
        ...(departmentId ? { departmentId } : buildDepartmentAccessWhere(allowedDepartmentIds)),
        ...(includeInactive || archive ? {} : { isActive: true }),
      },
      orderBy: { name: "asc" },
      select: postSelect(),
    });

    return res.json({ data: posts.map(sanitizePost) });
  } catch (error) {
    console.error("getDutyPosts error:", error);
    return res.status(500).json({ message: "Внутрішня помилка сервера" });
  }
}

export async function getDutyPostById(req: Request, res: Response) {
  try {
    const postId = Number(req.params.id);
    if (!Number.isInteger(postId)) return res.status(400).json({ message: "Invalid post id" });

    const allowedCityIds = await getAllowedCityIds(req);
    const allowedDepartmentIds = await getAllowedDepartmentIds(req);
    const post = await prisma.dutyPost.findFirst({
      where: { id: postId, deletedAt: null, ...buildCityAccessWhere(allowedCityIds), ...buildDepartmentAccessWhere(allowedDepartmentIds) },
      select: postSelect(),
    });

    if (!post) return res.status(404).json({ message: "Пост не найден" });
    return res.json({ data: sanitizePost(post) });
  } catch (error) {
    console.error("getDutyPostById error:", error);
    return res.status(500).json({ message: "Внутрішня помилка сервера" });
  }
}

export async function createDutyPost(req: Request, res: Response) {
  try {
    const parsed = createDutyPostSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.flatten() });
    if (parsed.data.password !== parsed.data.confirmPassword) return res.status(400).json({ message: "Пароли не совпадают" });

    if (!(await canEditDepartmentData(req, parsed.data.departmentId))) return res.status(403).json({ message: "Недостатньо прав для цього підрозділу" });

    const department = await validateDepartmentInCity({ cityId: parsed.data.cityId, departmentId: parsed.data.departmentId });
    if (!department) return res.status(404).json({ message: "Подразделение не найдено или неактивно" });

    const existingPost = await prisma.dutyPost.findFirst({ where: { cityId: parsed.data.cityId, name: parsed.data.name.trim() } });
    if (existingPost && !existingPost.deletedAt) return res.status(409).json({ message: "Пост с таким названием уже существует в этом городе" });
    if (existingPost?.deletedAt) return res.status(409).json({ message: "Пост с таким названием находится в архиве. Восстановите его." });

    const existingLogin = await prisma.mobileUser.findUnique({ where: { login: parsed.data.login.trim() } });
    if (existingLogin) return res.status(409).json({ message: "Такой логин уже используется" });

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);

    const post = await prisma.$transaction(async (tx) => {
      const createdPost = await tx.dutyPost.create({
        data: {
          cityId: parsed.data.cityId,
          departmentId: parsed.data.departmentId,
          name: parsed.data.name.trim(),
          comment: parsed.data.comment?.trim() || null,
          isActive: parsed.data.isActive ?? true,
        },
      });

      await tx.mobileUser.create({
        data: {
          cityId: parsed.data.cityId,
          departmentId: parsed.data.departmentId,
          userKind: MobileUserKind.POST,
          dutyPostId: createdPost.id,
          login: parsed.data.login.trim(),
          passwordHash,
          displayName: createdPost.name,
          comment: parsed.data.comment?.trim() || null,
          isActive: parsed.data.isActive ?? true,
        },
      });

      return tx.dutyPost.findUniqueOrThrow({ where: { id: createdPost.id }, select: postSelect() });
    });

    await createAdminActionLog(req, {
      action: "CREATE_DUTY_POST",
      entityType: "DUTY_POST",
      entityId: post.id,
      cityId: post.cityId,
      description: `Создан пост #${post.id}: ${post.name}`,
      metadata: { postId: post.id, cityId: post.cityId, name: post.name },
    });

    return res.status(201).json({ data: sanitizePost(post) });
  } catch (error) {
    console.error("createDutyPost error:", error);
    return res.status(500).json({ message: "Внутрішня помилка сервера" });
  }
}

export async function updateDutyPost(req: Request, res: Response) {
  try {
    const postId = Number(req.params.id);
    if (!Number.isInteger(postId)) return res.status(400).json({ message: "Invalid post id" });

    const parsed = updateDutyPostSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.flatten() });

    const post = await prisma.dutyPost.findFirst({ where: { id: postId, deletedAt: null } });
    if (!post) return res.status(404).json({ message: "Пост не найден" });
    if (!(await canEditDepartmentData(req, post.departmentId))) return res.status(403).json({ message: "Недостатньо прав для поточного підрозділу" });

    const nextCityId = parsed.data.cityId ?? post.cityId;
    const nextDepartmentId = parsed.data.departmentId ?? post.departmentId;
    if (nextDepartmentId !== post.departmentId && !(await canEditDepartmentData(req, nextDepartmentId))) return res.status(403).json({ message: "Недостатньо прав для нового підрозділу" });

    const department = await validateDepartmentInCity({ cityId: nextCityId, departmentId: nextDepartmentId });
    if (!department) return res.status(404).json({ message: "Подразделение не найдено или неактивно" });

    const nextName = parsed.data.name?.trim() ?? post.name;
    const duplicate = await prisma.dutyPost.findFirst({ where: { cityId: nextCityId, name: nextName, deletedAt: null, NOT: { id: postId } } });
    if (duplicate) return res.status(409).json({ message: "Пост с таким названием уже существует в этом городе" });

    const mobileUser = await prisma.mobileUser.findFirst({ where: { dutyPostId: postId, userKind: MobileUserKind.POST } });
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

    const updated = await prisma.$transaction(async (tx) => {
      await tx.dutyPost.update({
        where: { id: postId },
        data: {
          cityId: parsed.data.cityId,
          departmentId: parsed.data.departmentId,
          name: parsed.data.name?.trim(),
          comment: parsed.data.comment === undefined ? undefined : parsed.data.comment?.trim() || null,
          isActive: parsed.data.isActive,
        },
      });

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

      return tx.dutyPost.findUniqueOrThrow({ where: { id: postId }, select: postSelect() });
    });

    return res.json({ data: sanitizePost(updated) });
  } catch (error) {
    console.error("updateDutyPost error:", error);
    return res.status(500).json({ message: "Внутрішня помилка сервера" });
  }
}

export async function deleteDutyPost(req: Request, res: Response) {
  try {
    const postId = Number(req.params.id);
    if (!Number.isInteger(postId)) return res.status(400).json({ message: "Invalid post id" });

    const post = await prisma.dutyPost.findFirst({ where: { id: postId, deletedAt: null } });
    if (!post) return res.status(404).json({ message: "Пост не найден" });
    if (!(await canEditDepartmentData(req, post.departmentId))) return res.status(403).json({ message: "Недостатньо прав для цього підрозділу" });

    await prisma.$transaction([
      prisma.dutyPost.update({ where: { id: postId }, data: { deletedAt: new Date(), isActive: false } }),
      prisma.mobileUser.updateMany({ where: { dutyPostId: postId, userKind: MobileUserKind.POST }, data: { deletedAt: new Date(), isActive: false } }),
    ]);

    return res.json({ message: "Пост отправлен в архив" });
  } catch (error) {
    console.error("deleteDutyPost error:", error);
    return res.status(500).json({ message: "Внутрішня помилка сервера" });
  }
}

export async function restoreDutyPost(req: Request, res: Response) {
  try {
    const postId = Number(req.params.id);
    if (!Number.isInteger(postId)) return res.status(400).json({ message: "Invalid post id" });

    const post = await prisma.dutyPost.findUnique({ where: { id: postId } });
    if (!post) return res.status(404).json({ message: "Пост не найден" });
    if (!(await canEditDepartmentData(req, post.departmentId))) return res.status(403).json({ message: "Недостатньо прав для цього підрозділу" });

    const restored = await prisma.$transaction(async (tx) => {
      await tx.dutyPost.update({ where: { id: postId }, data: { deletedAt: null, isActive: true } });
      await tx.mobileUser.updateMany({ where: { dutyPostId: postId, userKind: MobileUserKind.POST }, data: { deletedAt: null, isActive: true } });
      return tx.dutyPost.findUniqueOrThrow({ where: { id: postId }, select: postSelect() });
    });

    return res.json({ data: sanitizePost(restored) });
  } catch (error) {
    console.error("restoreDutyPost error:", error);
    return res.status(500).json({ message: "Внутрішня помилка сервера" });
  }
}
