import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { CrewDutyType, CrewTransportType } from "@prisma/client";
import {
  buildCityAccessWhere,
  canEditCityData,
  getAllowedCityIds,
} from "../../utils/admin-access";

const createCrewSchema = z.object({
  cityId: z.number().int().positive(),
  name: z.string().min(1, "Crew name is required"),
  comment: z.string().optional().nullable(),
  dutyType: z.nativeEnum(CrewDutyType).optional(),
  transportType: z.nativeEnum(CrewTransportType).optional(),
  durationHours: z.number().positive().max(24).optional(),
  isActive: z.boolean().optional(),
});

const updateCrewSchema = z.object({
  cityId: z.number().int().positive().optional(),
  name: z.string().min(1, "Crew name is required").optional(),
  comment: z.string().optional().nullable(),
  dutyType: z.nativeEnum(CrewDutyType).optional(),
  transportType: z.nativeEnum(CrewTransportType).optional(),
  durationHours: z.number().positive().max(24).optional(),
  isActive: z.boolean().optional(),
});
function normalizeCrewDurationHours(
  dutyType: CrewDutyType,
  durationHours?: number | null,
) {
  if (dutyType === CrewDutyType.FULL_DAY) {
    return 24;
  }

  const value = Number(durationHours);

  if (!Number.isFinite(value) || value <= 0 || value > 24) {
    throw new Error("Для дневного или ночного наряда укажите часы от 0 до 24");
  }

  return Number(value.toFixed(2));
}
export async function getCrews(req: Request, res: Response) {
  try {
    const cityId = req.query.cityId ? Number(req.query.cityId) : undefined;
    const includeInactive = req.query.includeInactive === "true";
    const archive = req.query.archive === "true";

    const allowedCityIds = await getAllowedCityIds(req);

    if (allowedCityIds !== null && cityId && !allowedCityIds.includes(cityId)) {
      return res.json({
        data: [],
      });
    }

    const crews = await prisma.crew.findMany({
      where: {
        ...(archive ? { deletedAt: { not: null } } : { deletedAt: null }),
        ...(cityId ? { cityId } : buildCityAccessWhere(allowedCityIds)),
        ...(includeInactive || archive ? {} : { isActive: true }),
      },
      orderBy: {
        name: "asc",
      },
      select: {
        id: true,
        cityId: true,
        name: true,
        comment: true,
        isActive: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
        dutyType: true,
        transportType: true,
        durationHours: true,
        city: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return res.json({ data: crews });
  } catch (error) {
    console.error("getCrews error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function getCrewById(req: Request, res: Response) {
  try {
    const crewId = Number(req.params.id);

    if (!Number.isInteger(crewId)) {
      return res.status(400).json({ message: "Invalid crew id" });
    }
    const allowedCityIds = await getAllowedCityIds(req);
    const crew = await prisma.crew.findFirst({
      where: {
        id: crewId,
        deletedAt: null,
        ...buildCityAccessWhere(allowedCityIds),
      },
      select: {
        id: true,
        cityId: true,
        name: true,
        comment: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        dutyType: true,
        transportType: true,
        durationHours: true,
        city: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!crew) {
      return res.status(404).json({ message: "Crew not found" });
    }

    return res.json({ data: crew });
  } catch (error) {
    console.error("getCrewById error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function createCrew(req: Request, res: Response) {
  try {
    const parsed = createCrewSchema.safeParse(req.body);

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

    const existingCrew = await prisma.crew.findFirst({
      where: {
        cityId: parsed.data.cityId,
        name: parsed.data.name,
        deletedAt: null,
      },
    });

    if (existingCrew) {
      return res.status(409).json({
        message: "Crew with this name already exists in this city",
      });
    }
    const dutyType = parsed.data.dutyType ?? CrewDutyType.FULL_DAY;
    const transportType = parsed.data.transportType ?? CrewTransportType.AUTO;

    let durationHours = 24;

    try {
      durationHours = normalizeCrewDurationHours(
        dutyType,
        parsed.data.durationHours,
      );
    } catch (error) {
      return res.status(400).json({
        message:
          error instanceof Error ? error.message : "Некорректная длительность",
      });
    }
    const crew = await prisma.crew.create({
      data: {
        cityId: parsed.data.cityId,
        name: parsed.data.name,
        comment: parsed.data.comment ?? null,
        dutyType,
        transportType,
        durationHours,
        isActive: parsed.data.isActive ?? true,
      },
      select: {
        id: true,
        cityId: true,
        name: true,
        comment: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        dutyType: true,
        transportType: true,
        durationHours: true,
      },
    });

    return res.status(201).json({ data: crew });
  } catch (error) {
    console.error("createCrew error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function updateCrew(req: Request, res: Response) {
  try {
    const crewId = Number(req.params.id);

    if (!Number.isInteger(crewId)) {
      return res.status(400).json({ message: "Invalid crew id" });
    }

    const parsed = updateCrewSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation error",
        errors: parsed.error.flatten(),
      });
    }

    const crew = await prisma.crew.findFirst({
      where: {
        id: crewId,
        deletedAt: null,
      },
    });

    if (!crew) {
      return res.status(404).json({ message: "Crew not found" });
    }
    const canEditCurrentCity = await canEditCityData(req, crew.cityId);

    if (!canEditCurrentCity) {
      return res.status(403).json({
        message: "Недостаточно прав для этого города",
      });
    }

    const newCityId = parsed.data.cityId ?? crew.cityId;
    const newName = parsed.data.name ?? crew.name;

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

    const existingCrew = await prisma.crew.findFirst({
      where: {
        cityId: newCityId,
        name: newName,
        deletedAt: null,
        NOT: {
          id: crewId,
        },
      },
    });

    if (existingCrew) {
      return res.status(409).json({
        message: "Crew with this name already exists in this city",
      });
    }
    const nextDutyType = parsed.data.dutyType ?? crew.dutyType;
    const nextTransportType = parsed.data.transportType ?? crew.transportType;

    let nextDurationHours = 24;

    try {
      nextDurationHours = normalizeCrewDurationHours(
        nextDutyType,
        parsed.data.durationHours ?? Number(crew.durationHours),
      );
    } catch (error) {
      return res.status(400).json({
        message:
          error instanceof Error ? error.message : "Некорректная длительность",
      });
    }
    const updatedCrew = await prisma.crew.update({
      where: {
        id: crewId,
      },
      data: {
        cityId: parsed.data.cityId,
        name: parsed.data.name,
        comment: parsed.data.comment,
        isActive: parsed.data.isActive,
        dutyType: nextDutyType,
        transportType: nextTransportType,
        durationHours: nextDurationHours,
      },
      select: {
        id: true,
        cityId: true,
        name: true,
        comment: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        dutyType: true,
        transportType: true,
        durationHours: true,
      },
    });

    return res.json({ data: updatedCrew });
  } catch (error) {
    console.error("updateCrew error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function deleteCrew(req: Request, res: Response) {
  try {
    const crewId = Number(req.params.id);

    if (!Number.isInteger(crewId)) {
      return res.status(400).json({ message: "Invalid crew id" });
    }

    const crew = await prisma.crew.findFirst({
      where: {
        id: crewId,
        deletedAt: null,
      },
    });

    if (!crew) {
      return res.status(404).json({ message: "Crew not found" });
    }
    const canEdit = await canEditCityData(req, crew.cityId);

    if (!canEdit) {
      return res.status(403).json({
        message: "Недостаточно прав для этого города",
      });
    }
    await prisma.crew.update({
      where: {
        id: crewId,
      },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });

    return res.json({ message: "Crew deleted successfully" });
  } catch (error) {
    console.error("deleteCrew error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function restoreCrew(req: Request, res: Response) {
  try {
    const crewId = Number(req.params.id);

    if (!Number.isInteger(crewId)) {
      return res.status(400).json({ message: "Invalid crew id" });
    }

    const crew = await prisma.crew.findUnique({
      where: {
        id: crewId,
      },
    });

    if (!crew) {
      return res.status(404).json({ message: "Crew not found" });
    }

    if (!crew.deletedAt) {
      return res.status(400).json({
        message: "Crew is not archived",
      });
    }
    const canEdit = await canEditCityData(req, crew.cityId);

    if (!canEdit) {
      return res.status(403).json({
        message: "Недостаточно прав для этого города",
      });
    }
    const restoredCrew = await prisma.crew.update({
      where: {
        id: crewId,
      },
      data: {
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        cityId: true,
        name: true,
        comment: true,
        isActive: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
        dutyType: true,
        transportType: true,
        durationHours: true,
      },
    });

    return res.json({
      message: "Crew restored successfully",
      data: restoredCrew,
    });
  } catch (error) {
    console.error("restoreCrew error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}
