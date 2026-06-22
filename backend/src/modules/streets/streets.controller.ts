import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";

const createStreetSchema = z.object({
  cityId: z.number().int().positive(),
  name: z.string().min(1, "Street name is required"),
  isActive: z.boolean().optional(),
});

const updateStreetSchema = z.object({
  cityId: z.number().int().positive().optional(),
  name: z.string().min(1, "Street name is required").optional(),
  isActive: z.boolean().optional(),
});

const bulkImportStreetsSchema = z.object({
  cityId: z.number().int().positive(),
  text: z.string().min(1, "Street list is required"),
  replaceExisting: z.boolean().optional(),
});

function normalizeStreetName(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseStreetList(text: string) {
  const seen = new Set<string>();
  const names: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const name = normalizeStreetName(rawLine);

    if (!name) {
      continue;
    }

    const key = name.toLocaleLowerCase("uk-UA");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    names.push(name);
  }

  return names;
}

export async function getStreets(req: Request, res: Response) {
  try {
    const cityId = req.query.cityId ? Number(req.query.cityId) : undefined;
    const includeInactive = req.query.includeInactive === "true";

    const streets = await prisma.street.findMany({
      where: {
        deletedAt: null,
        ...(cityId ? { cityId } : {}),
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: {
        name: "asc",
      },
      select: {
        id: true,
        cityId: true,
        name: true,
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

    return res.json({ data: streets });
  } catch (error) {
    console.error("getStreets error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function getStreetById(req: Request, res: Response) {
  try {
    const streetId = Number(req.params.id);

    if (!Number.isInteger(streetId)) {
      return res.status(400).json({ message: "Invalid street id" });
    }

    const street = await prisma.street.findFirst({
      where: {
        id: streetId,
        deletedAt: null,
      },
      select: {
        id: true,
        cityId: true,
        name: true,
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

    if (!street) {
      return res.status(404).json({ message: "Street not found" });
    }

    return res.json({ data: street });
  } catch (error) {
    console.error("getStreetById error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function createStreet(req: Request, res: Response) {
  try {
    const parsed = createStreetSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation error",
        errors: parsed.error.flatten(),
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

    const existingStreet = await prisma.street.findFirst({
      where: {
        cityId: parsed.data.cityId,
        name: parsed.data.name,
        deletedAt: null,
      },
    });

    if (existingStreet) {
      return res.status(409).json({
        message: "Street with this name already exists in this city",
      });
    }

    const street = await prisma.street.create({
      data: {
        cityId: parsed.data.cityId,
        name: parsed.data.name,
        isActive: parsed.data.isActive ?? true,
      },
      select: {
        id: true,
        cityId: true,
        name: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.status(201).json({ data: street });
  } catch (error) {
    console.error("createStreet error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function updateStreet(req: Request, res: Response) {
  try {
    const streetId = Number(req.params.id);

    if (!Number.isInteger(streetId)) {
      return res.status(400).json({ message: "Invalid street id" });
    }

    const parsed = updateStreetSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation error",
        errors: parsed.error.flatten(),
      });
    }

    const street = await prisma.street.findFirst({
      where: {
        id: streetId,
        deletedAt: null,
      },
    });

    if (!street) {
      return res.status(404).json({ message: "Street not found" });
    }

    const newCityId = parsed.data.cityId ?? street.cityId;
    const newName = parsed.data.name ?? street.name;

    if (parsed.data.cityId) {
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

    const existingStreet = await prisma.street.findFirst({
      where: {
        cityId: newCityId,
        name: newName,
        deletedAt: null,
        NOT: {
          id: streetId,
        },
      },
    });

    if (existingStreet) {
      return res.status(409).json({
        message: "Street with this name already exists in this city",
      });
    }

    const updatedStreet = await prisma.street.update({
      where: {
        id: streetId,
      },
      data: {
        cityId: parsed.data.cityId,
        name: parsed.data.name,
        isActive: parsed.data.isActive,
      },
      select: {
        id: true,
        cityId: true,
        name: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json({ data: updatedStreet });
  } catch (error) {
    console.error("updateStreet error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function bulkImportStreets(req: Request, res: Response) {
  try {
    const parsed = bulkImportStreetsSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation error",
        errors: parsed.error.flatten(),
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

    const names = parseStreetList(parsed.data.text);

    if (names.length === 0) {
      return res.status(400).json({ message: "Street list is empty" });
    }

    const existingStreets = await prisma.street.findMany({
      where: {
        cityId: parsed.data.cityId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
      },
    });

    const existingByName = new Map(
      existingStreets.map((street) => [street.name.toLocaleLowerCase("uk-UA"), street])
    );

    let created = 0;
    let skipped = 0;

    await prisma.$transaction(async (tx) => {
      if (parsed.data.replaceExisting) {
        await tx.street.updateMany({
          where: {
            cityId: parsed.data.cityId,
            deletedAt: null,
          },
          data: {
            deletedAt: new Date(),
            isActive: false,
          },
        });

        await tx.street.createMany({
          data: names.map((name) => ({
            cityId: parsed.data.cityId,
            name,
            isActive: true,
          })),
        });

        created = names.length;
        return;
      }

      const toCreate = names.filter((name) => {
        const exists = existingByName.has(name.toLocaleLowerCase("uk-UA"));

        if (exists) {
          skipped += 1;
        }

        return !exists;
      });

      if (toCreate.length > 0) {
        await tx.street.createMany({
          data: toCreate.map((name) => ({
            cityId: parsed.data.cityId,
            name,
            isActive: true,
          })),
        });
      }

      created = toCreate.length;
    });

    const total = await prisma.street.count({
      where: {
        cityId: parsed.data.cityId,
        deletedAt: null,
        isActive: true,
      },
    });

    return res.json({
      data: {
        parsed: names.length,
        created,
        skipped,
        total,
      },
    });
  } catch (error) {
    console.error("bulkImportStreets error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function deleteStreet(req: Request, res: Response) {
  try {
    const streetId = Number(req.params.id);

    if (!Number.isInteger(streetId)) {
      return res.status(400).json({ message: "Invalid street id" });
    }

    const street = await prisma.street.findFirst({
      where: {
        id: streetId,
        deletedAt: null,
      },
    });

    if (!street) {
      return res.status(404).json({ message: "Street not found" });
    }

    await prisma.street.update({
      where: {
        id: streetId,
      },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });

    return res.json({ message: "Street deleted successfully" });
  } catch (error) {
    console.error("deleteStreet error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}