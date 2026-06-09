import type { Request, Response } from "express";
import { z } from "zod";
import { DepartmentType } from "@prisma/client";
import { prisma } from "../../config/prisma";
import {
  buildCityAccessWhere,
  buildDepartmentAccessWhere,
  canEditCityData,
  canEditDepartmentData,
  getAllowedCityIds,
  getAllowedDepartmentIds,
  isSuperAdmin,
} from "../../utils/admin-access";

const createDepartmentSchema = z.object({
  cityId: z.number().int().positive(),
  name: z.string().min(1, "Department name is required"),
  type: z.nativeEnum(DepartmentType).default(DepartmentType.OTHER),
  comment: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

const updateDepartmentSchema = z.object({
  cityId: z.number().int().positive().optional(),
  name: z.string().min(1, "Department name is required").optional(),
  type: z.nativeEnum(DepartmentType).optional(),
  comment: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

function selectDepartment() {
  return {
    id: true,
    cityId: true,
    name: true,
    type: true,
    isSystem: true,
    isActive: true,
    comment: true,
    deletedAt: true,
    createdAt: true,
    updatedAt: true,
    city: {
      select: {
        id: true,
        name: true,
      },
    },
  } as const;
}

export async function getDepartments(req: Request, res: Response) {
  try {
    const cityId = req.query.cityId ? Number(req.query.cityId) : undefined;
    const type = req.query.type ? String(req.query.type) : undefined;
    const includeInactive = req.query.includeInactive === "true";
    const archive = req.query.archive === "true";

    const allowedCityIds = await getAllowedCityIds(req);
    const allowedDepartmentIds = await getAllowedDepartmentIds(req);

    if (allowedCityIds !== null && cityId && !allowedCityIds.includes(cityId)) {
      return res.json({ data: [] });
    }

    const departments = await prisma.department.findMany({
      where: {
        ...(archive ? { deletedAt: { not: null } } : { deletedAt: null }),
        ...(cityId ? { cityId } : buildCityAccessWhere(allowedCityIds)),
        ...buildDepartmentAccessWhere(allowedDepartmentIds),
        ...(includeInactive || archive ? {} : { isActive: true }),
        ...(type && Object.values(DepartmentType).includes(type as DepartmentType)
          ? { type: type as DepartmentType }
          : {}),
      },
      orderBy: [{ city: { name: "asc" } }, { type: "asc" }, { name: "asc" }],
      select: selectDepartment(),
    });

    return res.json({ data: departments });
  } catch (error) {
    console.error("getDepartments error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function getDepartmentById(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: "Invalid department id" });
    }

    const allowedCityIds = await getAllowedCityIds(req);
    const allowedDepartmentIds = await getAllowedDepartmentIds(req);

    const department = await prisma.department.findFirst({
      where: {
        id,
        deletedAt: null,
        ...buildCityAccessWhere(allowedCityIds),
        ...buildDepartmentAccessWhere(allowedDepartmentIds),
      },
      select: selectDepartment(),
    });

    if (!department) {
      return res.status(404).json({ message: "Подразделение не найдено" });
    }

    return res.json({ data: department });
  } catch (error) {
    console.error("getDepartmentById error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function createDepartment(req: Request, res: Response) {
  try {
    const parsed = createDepartmentSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ message: "Validation error", errors: parsed.error.flatten() });
    }

    const canEdit = await canEditCityData(req, parsed.data.cityId);
    if (!canEdit) {
      return res.status(403).json({ message: "Недостаточно прав для этого города" });
    }

    const city = await prisma.city.findFirst({
      where: { id: parsed.data.cityId, deletedAt: null, isActive: true },
    });

    if (!city) {
      return res.status(404).json({ message: "Город не найден или неактивен" });
    }

    const existing = await prisma.department.findFirst({
      where: { cityId: parsed.data.cityId, name: parsed.data.name.trim() },
    });

    if (existing && !existing.deletedAt) {
      return res.status(409).json({ message: "Подразделение с таким названием уже существует" });
    }

    if (existing?.deletedAt) {
      return res.status(409).json({ message: "Подразделение с таким названием находится в архиве. Восстановите его." });
    }

    const department = await prisma.department.create({
      data: {
        cityId: parsed.data.cityId,
        name: parsed.data.name.trim(),
        type: parsed.data.type,
        isSystem: false,
        isActive: parsed.data.isActive ?? true,
        comment: parsed.data.comment?.trim() || null,
      },
      select: selectDepartment(),
    });

    return res.status(201).json({ data: department });
  } catch (error) {
    console.error("createDepartment error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function updateDepartment(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: "Invalid department id" });
    }

    const parsed = updateDepartmentSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ message: "Validation error", errors: parsed.error.flatten() });
    }

    const department = await prisma.department.findFirst({ where: { id, deletedAt: null } });

    if (!department) {
      return res.status(404).json({ message: "Подразделение не найдено" });
    }

    const canEditCurrent = await canEditDepartmentData(req, department.id);
    if (!canEditCurrent) {
      return res.status(403).json({ message: "Недостаточно прав для этого подразделения" });
    }

    const nextCityId = parsed.data.cityId ?? department.cityId;
    const nextName = parsed.data.name?.trim() ?? department.name;

    if (department.isSystem && (parsed.data.cityId || parsed.data.type)) {
      return res.status(400).json({ message: "Системное подразделение нельзя переносить или менять тип" });
    }

    if (parsed.data.cityId && parsed.data.cityId !== department.cityId) {
      const canEditNewCity = await canEditCityData(req, parsed.data.cityId);
      if (!canEditNewCity) {
        return res.status(403).json({ message: "Недостаточно прав для нового города" });
      }
    }

    const duplicate = await prisma.department.findFirst({
      where: { cityId: nextCityId, name: nextName, deletedAt: null, NOT: { id } },
    });

    if (duplicate) {
      return res.status(409).json({ message: "Подразделение с таким названием уже существует" });
    }

    const updated = await prisma.department.update({
      where: { id },
      data: {
        cityId: parsed.data.cityId,
        name: parsed.data.name?.trim(),
        type: department.isSystem ? undefined : parsed.data.type,
        comment: parsed.data.comment === undefined ? undefined : parsed.data.comment?.trim() || null,
        isActive: parsed.data.isActive,
      },
      select: selectDepartment(),
    });

    return res.json({ data: updated });
  } catch (error) {
    console.error("updateDepartment error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function archiveDepartment(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: "Invalid department id" });
    }

    const department = await prisma.department.findFirst({ where: { id, deletedAt: null } });

    if (!department) {
      return res.status(404).json({ message: "Подразделение не найдено" });
    }

    if (department.isSystem) {
      return res.status(400).json({ message: "Системное подразделение нельзя отправить в архив" });
    }

    if (!(await canEditDepartmentData(req, department.id))) {
      return res.status(403).json({ message: "Недостаточно прав для этого подразделения" });
    }

    await prisma.department.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    return res.json({ message: "Подразделение отправлено в архив" });
  } catch (error) {
    console.error("archiveDepartment error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function restoreDepartment(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: "Invalid department id" });
    }

    const department = await prisma.department.findUnique({ where: { id } });

    if (!department) {
      return res.status(404).json({ message: "Подразделение не найдено" });
    }

    if (!(await canEditCityData(req, department.cityId))) {
      return res.status(403).json({ message: "Недостаточно прав для этого города" });
    }

    const restored = await prisma.department.update({
      where: { id },
      data: { deletedAt: null, isActive: true },
      select: selectDepartment(),
    });

    return res.json({ data: restored });
  } catch (error) {
    console.error("restoreDepartment error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}
