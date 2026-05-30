import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { getAllowedCityIds } from "../../utils/admin-access";

const createCitySchema = z.object({
  name: z.string().min(1, "City name is required"),
  isActive: z.boolean().optional(),
});

const updateCitySchema = z.object({
  name: z.string().min(1, "City name is required").optional(),
  isActive: z.boolean().optional(),
});

export async function getCities(req: Request, res: Response) {
  try {
    const archive = req.query.archive === "true";
    const scope = req.query.scope ? String(req.query.scope) : "";

    const allowedCityIds =
      scope === "access" ? await getAllowedCityIds(req) : null;

      const cities = await prisma.city.findMany({
        where: {
          ...(archive ? { deletedAt: { not: null } } : { deletedAt: null }),
          ...(scope === "access" && allowedCityIds !== null
            ? {
                id: {
                  in: allowedCityIds,
                },
              }
            : {}),
        },
      orderBy: {
        name: "asc",
      },
      select: {
        id: true,
        name: true,
        isActive: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json({
      data: cities,
    });
  } catch (error) {
    console.error("getCities error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}
export async function getCityById(req: Request, res: Response) {
  try {
    const cityId = Number(req.params.id);

    if (!Number.isInteger(cityId)) {
      return res.status(400).json({
        message: "Invalid city id",
      });
    }

    const city = await prisma.city.findFirst({
      where: {
        id: cityId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!city) {
      return res.status(404).json({
        message: "City not found",
      });
    }

    return res.json({
      data: city,
    });
  } catch (error) {
    console.error("getCityById error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

export async function createCity(req: Request, res: Response) {
  try {
    const parsed = createCitySchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation error",
        errors: parsed.error.flatten(),
      });
    }

    const { name, isActive } = parsed.data;

    const existingCity = await prisma.city.findFirst({
      where: {
        name,
        deletedAt: null,
      },
    });

    if (existingCity) {
      return res.status(409).json({
        message: "City with this name already exists",
      });
    }

    const city = await prisma.city.create({
      data: {
        name,
        isActive: isActive ?? true,
      },
      select: {
        id: true,
        name: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.status(201).json({
      data: city,
    });
  } catch (error) {
    console.error("createCity error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

export async function updateCity(req: Request, res: Response) {
  try {
    const cityId = Number(req.params.id);

    if (!Number.isInteger(cityId)) {
      return res.status(400).json({
        message: "Invalid city id",
      });
    }

    const parsed = updateCitySchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation error",
        errors: parsed.error.flatten(),
      });
    }

    const city = await prisma.city.findFirst({
      where: {
        id: cityId,
        deletedAt: null,
      },
    });

    if (!city) {
      return res.status(404).json({
        message: "City not found",
      });
    }

    if (parsed.data.name && parsed.data.name !== city.name) {
      const existingCity = await prisma.city.findFirst({
        where: {
          name: parsed.data.name,
          deletedAt: null,
          NOT: {
            id: cityId,
          },
        },
      });

      if (existingCity) {
        return res.status(409).json({
          message: "City with this name already exists",
        });
      }
    }

    const updatedCity = await prisma.city.update({
      where: {
        id: cityId,
      },
      data: {
        name: parsed.data.name,
        isActive: parsed.data.isActive,
      },
      select: {
        id: true,
        name: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json({
      data: updatedCity,
    });
  } catch (error) {
    console.error("updateCity error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

export async function deleteCity(req: Request, res: Response) {
  try {
    const cityId = Number(req.params.id);

    if (!Number.isInteger(cityId)) {
      return res.status(400).json({
        message: "Invalid city id",
      });
    }

    const city = await prisma.city.findFirst({
      where: {
        id: cityId,
        deletedAt: null,
      },
    });

    if (!city) {
      return res.status(404).json({
        message: "City not found",
      });
    }

    await prisma.city.update({
      where: {
        id: cityId,
      },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });

    return res.json({
      message: "City deleted successfully",
    });
  } catch (error) {
    console.error("deleteCity error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

export async function restoreCity(req: Request, res: Response) {
  try {
    const cityId = Number(req.params.id);

    if (!Number.isInteger(cityId)) {
      return res.status(400).json({
        message: "Invalid city id",
      });
    }

    const city = await prisma.city.findUnique({
      where: {
        id: cityId,
      },
    });

    if (!city) {
      return res.status(404).json({
        message: "City not found",
      });
    }

    if (!city.deletedAt) {
      return res.status(400).json({
        message: "City is not archived",
      });
    }

    const existingActiveCity = await prisma.city.findFirst({
      where: {
        name: city.name,
        deletedAt: null,
        NOT: {
          id: cityId,
        },
      },
    });

    if (existingActiveCity) {
      return res.status(409).json({
        message: "Active city with this name already exists",
      });
    }

    const restoredCity = await prisma.city.update({
      where: {
        id: cityId,
      },
      data: {
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        isActive: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json({
      message: "City restored successfully",
      data: restoredCity,
    });
  } catch (error) {
    console.error("restoreCity error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}