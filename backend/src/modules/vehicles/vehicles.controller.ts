import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import {
  buildCityAccessWhere,
  canEditCityData,
  getAllowedCityIds,
} from "../../utils/admin-access";

const createVehicleSchema = z.object({
  cityId: z.number().int().positive(),
  title: z.string().min(1, "Vehicle title is required"),
  licensePlate: z.string().optional().nullable(),
  startOdometer: z.number().int().nonnegative().optional().nullable(),
  comment: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

const updateVehicleSchema = z.object({
  cityId: z.number().int().positive().optional(),
  title: z.string().min(1, "Vehicle title is required").optional(),
  licensePlate: z.string().optional().nullable(),
  startOdometer: z.number().int().nonnegative().optional().nullable(),
  comment: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

export async function getVehicles(req: Request, res: Response) {
  try {
    const cityId = req.query.cityId ? Number(req.query.cityId) : undefined;
    const includeInactive = req.query.includeInactive === "true";
    const archive = req.query.archive === "true";

    const allowedCityIds = await getAllowedCityIds(req);

    if (
      allowedCityIds !== null &&
      cityId &&
      !allowedCityIds.includes(cityId)
    ) {
      return res.json({
        data: [],
      });
    }

    const vehicles = await prisma.vehicle.findMany({
      where: {
        ...(archive ? { deletedAt: { not: null } } : { deletedAt: null }),
        ...(cityId ? { cityId } : buildCityAccessWhere(allowedCityIds)),
        ...(includeInactive || archive ? {} : { isActive: true }),
      },
      orderBy: {
        title: "asc",
      },
      select: {
        id: true,
        cityId: true,
        title: true,
        licensePlate: true,
        startOdometer: true,
        comment: true,
        isActive: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
        city: {
          select: {
            id: true,
            name: true,
          },
        },
      },
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

    if (!Number.isInteger(vehicleId)) {
      return res.status(400).json({ message: "Invalid vehicle id" });
    }
    const allowedCityIds = await getAllowedCityIds(req);
    const vehicle = await prisma.vehicle.findFirst({
      where: {
        id: vehicleId,
        deletedAt: null,
        ...buildCityAccessWhere(allowedCityIds),
      },
      select: {
        id: true,
        cityId: true,
        title: true,
        licensePlate: true,
        startOdometer: true,
        comment: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        city: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!vehicle) {
      return res.status(404).json({ message: "Vehicle not found" });
    }

    return res.json({ data: vehicle });
  } catch (error) {
    console.error("getVehicleById error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function createVehicle(req: Request, res: Response) {
  try {
    const parsed = createVehicleSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation error",
        errors: parsed.error.flatten(),
      });
    }
    const canEdit = await canEditCityData(req, parsed.data.cityId);

    if (!canEdit) {
      return res.status(403).json({
        message: "Недостаточно прав для этого города",
      });
    }
    const city = await prisma.city.findFirst({
      where: {
        id: parsed.data.cityId,
        deletedAt: null,
        isActive: true,
      },
    });

    if (!city) {
      return res.status(404).json({ message: "City not found or inactive" });
    }

    if (parsed.data.licensePlate) {
      const existingVehicle = await prisma.vehicle.findFirst({
        where: {
          cityId: parsed.data.cityId,
          licensePlate: parsed.data.licensePlate,
          deletedAt: null,
        },
      });

      if (existingVehicle) {
        return res.status(409).json({
          message: "Vehicle with this license plate already exists in this city",
        });
      }
    }

    const vehicle = await prisma.vehicle.create({
      data: {
        cityId: parsed.data.cityId,
        title: parsed.data.title,
        licensePlate: parsed.data.licensePlate ?? null,
        startOdometer: parsed.data.startOdometer ?? null,
        comment: parsed.data.comment ?? null,
        isActive: parsed.data.isActive ?? true,
      },
      select: {
        id: true,
        cityId: true,
        title: true,
        licensePlate: true,
        startOdometer: true,
        comment: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
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

    if (!Number.isInteger(vehicleId)) {
      return res.status(400).json({ message: "Invalid vehicle id" });
    }

    const parsed = updateVehicleSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation error",
        errors: parsed.error.flatten(),
      });
    }

    const vehicle = await prisma.vehicle.findFirst({
      where: {
        id: vehicleId,
        deletedAt: null,
      },
    });

    if (!vehicle) {
      return res.status(404).json({ message: "Vehicle not found" });
    }
    const canEditCurrentCity = await canEditCityData(req, vehicle.cityId);

    if (!canEditCurrentCity) {
      return res.status(403).json({
        message: "Недостаточно прав для этого города",
      });
    }
    const newCityId = parsed.data.cityId ?? vehicle.cityId;
    const newLicensePlate = parsed.data.licensePlate ?? vehicle.licensePlate;

    if (parsed.data.cityId) {
      const canEditNewCity = await canEditCityData(req, parsed.data.cityId);

      if (!canEditNewCity) {
        return res.status(403).json({
          message: "Недостаточно прав для нового города",
        });
      }
      const city = await prisma.city.findFirst({
        where: {
          id: parsed.data.cityId,
          deletedAt: null,
          isActive: true,
        },
      });

      if (!city) {
        return res.status(404).json({ message: "City not found or inactive" });
      }
    }

    if (newLicensePlate) {
      const existingVehicle = await prisma.vehicle.findFirst({
        where: {
          cityId: newCityId,
          licensePlate: newLicensePlate,
          deletedAt: null,
          NOT: {
            id: vehicleId,
          },
        },
      });

      if (existingVehicle) {
        return res.status(409).json({
          message: "Vehicle with this license plate already exists in this city",
        });
      }
    }

    const updatedVehicle = await prisma.vehicle.update({
      where: {
        id: vehicleId,
      },
      data: {
        cityId: parsed.data.cityId,
        title: parsed.data.title,
        licensePlate: parsed.data.licensePlate,
        startOdometer: parsed.data.startOdometer,
        comment: parsed.data.comment,
        isActive: parsed.data.isActive,
      },
      select: {
        id: true,
        cityId: true,
        title: true,
        licensePlate: true,
        startOdometer: true,
        comment: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json({ data: updatedVehicle });
  } catch (error) {
    console.error("updateVehicle error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function deleteVehicle(req: Request, res: Response) {
  try {
    const vehicleId = Number(req.params.id);

    if (!Number.isInteger(vehicleId)) {
      return res.status(400).json({ message: "Invalid vehicle id" });
    }

    const vehicle = await prisma.vehicle.findFirst({
      where: {
        id: vehicleId,
        deletedAt: null,
      },
    });

    if (!vehicle) {
      return res.status(404).json({ message: "Vehicle not found" });
    }
    const canEdit = await canEditCityData(req, vehicle.cityId);

    if (!canEdit) {
      return res.status(403).json({
        message: "Недостаточно прав для этого города",
      });
    }
    await prisma.vehicle.update({
      where: {
        id: vehicleId,
      },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });

    return res.json({ message: "Vehicle deleted successfully" });
  } catch (error) {
    console.error("deleteVehicle error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function restoreVehicle(req: Request, res: Response) {
  try {
    const vehicleId = Number(req.params.id);

    if (!Number.isInteger(vehicleId)) {
      return res.status(400).json({ message: "Invalid vehicle id" });
    }

    const vehicle = await prisma.vehicle.findUnique({
      where: {
        id: vehicleId,
      },
    });

    if (!vehicle) {
      return res.status(404).json({ message: "Vehicle not found" });
    }

    if (!vehicle.deletedAt) {
      return res.status(400).json({
        message: "Vehicle is not archived",
      });
    }
    const canEdit = await canEditCityData(req, vehicle.cityId);

    if (!canEdit) {
      return res.status(403).json({
        message: "Недостаточно прав для этого города",
      });
    }
    const restoredVehicle = await prisma.vehicle.update({
      where: {
        id: vehicleId,
      },
      data: {
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        cityId: true,
        title: true,
        licensePlate: true,
        comment: true,
        isActive: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json({
      message: "Vehicle restored successfully",
      data: restoredVehicle,
    });
  } catch (error) {
    console.error("restoreVehicle error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}