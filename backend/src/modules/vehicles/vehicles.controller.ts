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

const createVehicleSchema = z.object({
  cityId: z.number().int().positive(),
  departmentId: z.number().int().positive(),
  title: z.string().min(1, "Vehicle title is required"),
  licensePlate: z.string().optional().nullable(),
  startOdometer: z.number().int().nonnegative().optional().nullable(),
  comment: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

const updateVehicleSchema = z.object({
  cityId: z.number().int().positive().optional(),
  departmentId: z.number().int().positive().optional(),
  title: z.string().min(1, "Vehicle title is required").optional(),
  licensePlate: z.string().optional().nullable(),
  startOdometer: z.number().int().nonnegative().optional().nullable(),
  comment: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

function vehicleSelect() {
  return {
    id: true,
    cityId: true,
    departmentId: true,
    title: true,
    licensePlate: true,
    startOdometer: true,
    comment: true,
    isActive: true,
    deletedAt: true,
    createdAt: true,
    updatedAt: true,
    city: { select: { id: true, name: true } },
    department: { select: { id: true, name: true, type: true } },
  } as const;
}

export async function getVehicles(req: Request, res: Response) {
  try {
    const cityId = req.query.cityId ? Number(req.query.cityId) : undefined;
    const departmentId = req.query.departmentId ? Number(req.query.departmentId) : undefined;
    const includeInactive = req.query.includeInactive === "true";
    const archive = req.query.archive === "true";

    const allowedCityIds = await getAllowedCityIds(req);
    const allowedDepartmentIds = await getAllowedDepartmentIds(req);

    if (allowedCityIds !== null && cityId && !allowedCityIds.includes(cityId)) return res.json({ data: [] });
    if (allowedDepartmentIds !== null && departmentId && !allowedDepartmentIds.includes(departmentId)) return res.json({ data: [] });

    const vehicles = await prisma.vehicle.findMany({
      where: {
        ...(archive ? { deletedAt: { not: null } } : { deletedAt: null }),
        ...(cityId ? { cityId } : buildCityAccessWhere(allowedCityIds)),
        ...(departmentId ? { departmentId } : buildDepartmentAccessWhere(allowedDepartmentIds)),
        ...(includeInactive || archive ? {} : { isActive: true }),
      },
      orderBy: { title: "asc" },
      select: vehicleSelect(),
    });

    return res.json({ data: vehicles });
  } catch (error) {
    console.error("getVehicles error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function getVehicleById(req: Request, res: Response) {
  try {
    const vehicleId = Number(req.params.id);
    if (!Number.isInteger(vehicleId)) return res.status(400).json({ message: "Invalid vehicle id" });

    const allowedCityIds = await getAllowedCityIds(req);
    const allowedDepartmentIds = await getAllowedDepartmentIds(req);
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, deletedAt: null, ...buildCityAccessWhere(allowedCityIds), ...buildDepartmentAccessWhere(allowedDepartmentIds) },
      select: vehicleSelect(),
    });

    if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });
    return res.json({ data: vehicle });
  } catch (error) {
    console.error("getVehicleById error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function createVehicle(req: Request, res: Response) {
  try {
    const parsed = createVehicleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.flatten() });

    if (!(await canEditDepartmentData(req, parsed.data.departmentId))) return res.status(403).json({ message: "Недостаточно прав для этого подразделения" });

    const department = await validateDepartmentInCity({ cityId: parsed.data.cityId, departmentId: parsed.data.departmentId });
    if (!department) return res.status(404).json({ message: "Подразделение не найдено или неактивно" });

    if (parsed.data.licensePlate) {
      const existingVehicle = await prisma.vehicle.findFirst({ where: { licensePlate: parsed.data.licensePlate.trim(), deletedAt: null } });
      if (existingVehicle) return res.status(409).json({ message: "Автомобиль с таким номером уже существует" });
    }

    const vehicle = await prisma.vehicle.create({
      data: {
        cityId: parsed.data.cityId,
        departmentId: parsed.data.departmentId,
        title: parsed.data.title.trim(),
        licensePlate: parsed.data.licensePlate?.trim() || null,
        startOdometer: parsed.data.startOdometer ?? null,
        comment: parsed.data.comment?.trim() || null,
        isActive: parsed.data.isActive ?? true,
      },
      select: vehicleSelect(),
    });

    return res.status(201).json({ data: vehicle });
  } catch (error) {
    console.error("createVehicle error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function updateVehicle(req: Request, res: Response) {
  try {
    const vehicleId = Number(req.params.id);
    if (!Number.isInteger(vehicleId)) return res.status(400).json({ message: "Invalid vehicle id" });

    const parsed = updateVehicleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.flatten() });

    const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, deletedAt: null } });
    if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });

    if (!(await canEditDepartmentData(req, vehicle.departmentId))) return res.status(403).json({ message: "Недостаточно прав для текущего подразделения" });

    const nextCityId = parsed.data.cityId ?? vehicle.cityId;
    const nextDepartmentId = parsed.data.departmentId ?? vehicle.departmentId;

    if (nextDepartmentId !== vehicle.departmentId && !(await canEditDepartmentData(req, nextDepartmentId))) {
      return res.status(403).json({ message: "Недостаточно прав для нового подразделения" });
    }

    const department = await validateDepartmentInCity({ cityId: nextCityId, departmentId: nextDepartmentId });
    if (!department) return res.status(404).json({ message: "Подразделение не найдено или неактивно" });

    const plate = parsed.data.licensePlate?.trim();
    if (plate) {
      const existing = await prisma.vehicle.findFirst({ where: { licensePlate: plate, deletedAt: null, NOT: { id: vehicleId } } });
      if (existing) return res.status(409).json({ message: "Автомобиль с таким номером уже существует" });
    }

    const updated = await prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        cityId: parsed.data.cityId,
        departmentId: parsed.data.departmentId,
        title: parsed.data.title?.trim(),
        licensePlate: parsed.data.licensePlate === undefined ? undefined : plate || null,
        startOdometer: parsed.data.startOdometer,
        comment: parsed.data.comment === undefined ? undefined : parsed.data.comment?.trim() || null,
        isActive: parsed.data.isActive,
      },
      select: vehicleSelect(),
    });

    return res.json({ data: updated });
  } catch (error) {
    console.error("updateVehicle error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function deleteVehicle(req: Request, res: Response) {
  try {
    const vehicleId = Number(req.params.id);
    if (!Number.isInteger(vehicleId)) return res.status(400).json({ message: "Invalid vehicle id" });

    const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, deletedAt: null } });
    if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });
    if (!(await canEditDepartmentData(req, vehicle.departmentId))) return res.status(403).json({ message: "Недостаточно прав для этого подразделения" });

    await prisma.vehicle.update({ where: { id: vehicleId }, data: { deletedAt: new Date(), isActive: false } });
    return res.json({ message: "Vehicle archived successfully" });
  } catch (error) {
    console.error("deleteVehicle error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function restoreVehicle(req: Request, res: Response) {
  try {
    const vehicleId = Number(req.params.id);
    if (!Number.isInteger(vehicleId)) return res.status(400).json({ message: "Invalid vehicle id" });

    const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });
    if (!(await canEditDepartmentData(req, vehicle.departmentId))) return res.status(403).json({ message: "Недостаточно прав для этого подразделения" });

    const restored = await prisma.vehicle.update({ where: { id: vehicleId }, data: { deletedAt: null, isActive: true }, select: vehicleSelect() });
    return res.json({ data: restored });
  } catch (error) {
    console.error("restoreVehicle error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}
