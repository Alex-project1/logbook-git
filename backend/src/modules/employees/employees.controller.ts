import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import {
  buildCityAccessWhere,
  buildDepartmentAccessWhere,
  canEditDepartmentData,
  getAllowedCityIds,
  getAllowedDepartmentIds,
} from "../../utils/admin-access";
import { validateDepartmentInCity } from "../../utils/departments";

const createEmployeeSchema = z.object({
  cityId: z.number().int().positive(),
  departmentId: z.number().int().positive(),
  fullName: z.string().min(1, "Full name is required"),
  position: z.string().optional().nullable(),
  comment: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

const updateEmployeeSchema = z.object({
  cityId: z.number().int().positive().optional(),
  departmentId: z.number().int().positive().optional(),
  fullName: z.string().min(1, "Full name is required").optional(),
  position: z.string().optional().nullable(),
  comment: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

function employeeSelect() {
  return {
    id: true,
    cityId: true,
    departmentId: true,
    fullName: true,
    position: true,
    comment: true,
    isActive: true,
    deletedAt: true,
    createdAt: true,
    updatedAt: true,
    city: { select: { id: true, name: true } },
    department: { select: { id: true, name: true, type: true } },
  } as const;
}

export async function getEmployees(req: Request, res: Response) {
  try {
    const cityId = req.query.cityId ? Number(req.query.cityId) : undefined;
    const departmentId = req.query.departmentId ? Number(req.query.departmentId) : undefined;
    const includeInactive = req.query.includeInactive === "true";
    const archive = req.query.archive === "true";

    const allowedCityIds = await getAllowedCityIds(req);
    const allowedDepartmentIds = await getAllowedDepartmentIds(req);

    if (allowedCityIds !== null && cityId && !allowedCityIds.includes(cityId)) return res.json({ data: [] });
    if (allowedDepartmentIds !== null && departmentId && !allowedDepartmentIds.includes(departmentId)) return res.json({ data: [] });

    const employees = await prisma.employee.findMany({
      where: {
        ...(archive ? { deletedAt: { not: null } } : { deletedAt: null }),
        ...(cityId ? { cityId } : buildCityAccessWhere(allowedCityIds)),
        ...(departmentId ? { departmentId } : buildDepartmentAccessWhere(allowedDepartmentIds)),
        ...(includeInactive || archive ? {} : { isActive: true }),
      },
      orderBy: { fullName: "asc" },
      select: employeeSelect(),
    });

    return res.json({ data: employees });
  } catch (error) {
    console.error("getEmployees error:", error);
    return res.status(500).json({ message: "Внутрішня помилка сервера" });
  }
}

export async function getEmployeeById(req: Request, res: Response) {
  try {
    const employeeId = Number(req.params.id);
    if (!Number.isInteger(employeeId)) return res.status(400).json({ message: "Invalid employee id" });

    const allowedCityIds = await getAllowedCityIds(req);
    const allowedDepartmentIds = await getAllowedDepartmentIds(req);
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null, ...buildCityAccessWhere(allowedCityIds), ...buildDepartmentAccessWhere(allowedDepartmentIds) },
      select: employeeSelect(),
    });

    if (!employee) return res.status(404).json({ message: "Employee not found" });
    return res.json({ data: employee });
  } catch (error) {
    console.error("getEmployeeById error:", error);
    return res.status(500).json({ message: "Внутрішня помилка сервера" });
  }
}

export async function createEmployee(req: Request, res: Response) {
  try {
    const parsed = createEmployeeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.flatten() });

    if (!(await canEditDepartmentData(req, parsed.data.departmentId))) return res.status(403).json({ message: "Недостатньо прав для цього підрозділу" });

    const department = await validateDepartmentInCity({ cityId: parsed.data.cityId, departmentId: parsed.data.departmentId });
    if (!department) return res.status(404).json({ message: "Подразделение не найдено или неактивно" });

    const employee = await prisma.employee.create({
      data: {
        cityId: parsed.data.cityId,
        departmentId: parsed.data.departmentId,
        fullName: parsed.data.fullName.trim(),
        position: parsed.data.position?.trim() || null,
        comment: parsed.data.comment?.trim() || null,
        isActive: parsed.data.isActive ?? true,
      },
      select: employeeSelect(),
    });

    return res.status(201).json({ data: employee });
  } catch (error) {
    console.error("createEmployee error:", error);
    return res.status(500).json({ message: "Внутрішня помилка сервера" });
  }
}

export async function updateEmployee(req: Request, res: Response) {
  try {
    const employeeId = Number(req.params.id);
    if (!Number.isInteger(employeeId)) return res.status(400).json({ message: "Invalid employee id" });

    const parsed = updateEmployeeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.flatten() });

    const employee = await prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null } });
    if (!employee) return res.status(404).json({ message: "Employee not found" });

    if (!(await canEditDepartmentData(req, employee.departmentId))) return res.status(403).json({ message: "Недостатньо прав для поточного підрозділу" });

    const nextCityId = parsed.data.cityId ?? employee.cityId;
    const nextDepartmentId = parsed.data.departmentId ?? employee.departmentId;

    if (nextDepartmentId !== employee.departmentId && !(await canEditDepartmentData(req, nextDepartmentId))) {
      return res.status(403).json({ message: "Недостатньо прав для нового підрозділу" });
    }

    const department = await validateDepartmentInCity({ cityId: nextCityId, departmentId: nextDepartmentId });
    if (!department) return res.status(404).json({ message: "Подразделение не найдено или неактивно" });

    const updated = await prisma.employee.update({
      where: { id: employeeId },
      data: {
        cityId: parsed.data.cityId,
        departmentId: parsed.data.departmentId,
        fullName: parsed.data.fullName?.trim(),
        position: parsed.data.position === undefined ? undefined : parsed.data.position?.trim() || null,
        comment: parsed.data.comment === undefined ? undefined : parsed.data.comment?.trim() || null,
        isActive: parsed.data.isActive,
      },
      select: employeeSelect(),
    });

    return res.json({ data: updated });
  } catch (error) {
    console.error("updateEmployee error:", error);
    return res.status(500).json({ message: "Внутрішня помилка сервера" });
  }
}

export async function deleteEmployee(req: Request, res: Response) {
  try {
    const employeeId = Number(req.params.id);
    if (!Number.isInteger(employeeId)) return res.status(400).json({ message: "Invalid employee id" });

    const employee = await prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null } });
    if (!employee) return res.status(404).json({ message: "Employee not found" });
    if (!(await canEditDepartmentData(req, employee.departmentId))) return res.status(403).json({ message: "Недостатньо прав для цього підрозділу" });

    await prisma.employee.update({ where: { id: employeeId }, data: { deletedAt: new Date(), isActive: false } });
    return res.json({ message: "Employee archived successfully" });
  } catch (error) {
    console.error("deleteEmployee error:", error);
    return res.status(500).json({ message: "Внутрішня помилка сервера" });
  }
}

export async function restoreEmployee(req: Request, res: Response) {
  try {
    const employeeId = Number(req.params.id);
    if (!Number.isInteger(employeeId)) return res.status(400).json({ message: "Invalid employee id" });

    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) return res.status(404).json({ message: "Employee not found" });
    if (!(await canEditDepartmentData(req, employee.departmentId))) return res.status(403).json({ message: "Недостатньо прав для цього підрозділу" });

    const restored = await prisma.employee.update({ where: { id: employeeId }, data: { deletedAt: null, isActive: true }, select: employeeSelect() });
    return res.json({ data: restored });
  } catch (error) {
    console.error("restoreEmployee error:", error);
    return res.status(500).json({ message: "Внутрішня помилка сервера" });
  }
}
