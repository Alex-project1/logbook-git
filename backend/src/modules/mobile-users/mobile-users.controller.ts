import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import {
  buildCityAccessWhere,
  canEditCityData,
  getAllowedCityIds,
} from "../../utils/admin-access";

const createMobileUserSchema = z.object({
  cityId: z.number().int().positive(),
  login: z.string().min(1, "Login is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  comment: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

const updateMobileUserSchema = z.object({
  cityId: z.number().int().positive().optional(),
  login: z.string().min(1, "Login is required").optional(),
  password: z.string().min(6, "Password must be at least 6 characters").optional(),
  comment: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

export async function getMobileUsers(req: Request, res: Response) {
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

    const mobileUsers = await prisma.mobileUser.findMany({
      where: {
        ...(archive ? { deletedAt: { not: null } } : { deletedAt: null }),
        ...(cityId ? { cityId } : buildCityAccessWhere(allowedCityIds)),
        ...(includeInactive || archive ? {} : { isActive: true }),
      },
      orderBy: {
        login: "asc",
      },
      select: {
        id: true,
        cityId: true,
        login: true,
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

    return res.json({ data: mobileUsers });
  } catch (error) {
    console.error("getMobileUsers error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function getMobileUserById(req: Request, res: Response) {
  try {
    const mobileUserId = Number(req.params.id);

    if (!Number.isInteger(mobileUserId)) {
      return res.status(400).json({ message: "Invalid mobile user id" });
    }
    const allowedCityIds = await getAllowedCityIds(req);
    const mobileUser = await prisma.mobileUser.findFirst({
      where: {
        id: mobileUserId,
        deletedAt: null,
        ...buildCityAccessWhere(allowedCityIds),
      },
      select: {
        id: true,
        cityId: true,
        login: true,
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

    if (!mobileUser) {
      return res.status(404).json({ message: "Mobile user not found" });
    }

    return res.json({ data: mobileUser });
  } catch (error) {
    console.error("getMobileUserById error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function createMobileUser(req: Request, res: Response) {
  try {
    const parsed = createMobileUserSchema.safeParse(req.body);

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

    const existingUser = await prisma.mobileUser.findUnique({
      where: {
        login: parsed.data.login,
      },
    });

    if (existingUser && !existingUser.deletedAt) {
      return res.status(409).json({
        message: "Mobile user with this login already exists",
      });
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);

    const mobileUser = await prisma.mobileUser.create({
      data: {
        cityId: parsed.data.cityId,
        login: parsed.data.login,
        passwordHash,
        comment: parsed.data.comment ?? null,
        isActive: parsed.data.isActive ?? true,
      },
      select: {
        id: true,
        cityId: true,
        login: true,
        comment: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.status(201).json({ data: mobileUser });
  } catch (error) {
    console.error("createMobileUser error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function updateMobileUser(req: Request, res: Response) {
  try {
    const mobileUserId = Number(req.params.id);

    if (!Number.isInteger(mobileUserId)) {
      return res.status(400).json({ message: "Invalid mobile user id" });
    }

    const parsed = updateMobileUserSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation error",
        errors: parsed.error.flatten(),
      });
    }

    const mobileUser = await prisma.mobileUser.findFirst({
      where: {
        id: mobileUserId,
        deletedAt: null,
      },
    });

    if (!mobileUser) {
      return res.status(404).json({ message: "Mobile user not found" });
    }
    const canEditCurrentCity = await canEditCityData(req, mobileUser.cityId);

    if (!canEditCurrentCity) {
      return res.status(403).json({
        message: "Недостаточно прав для этого города",
      });
    }
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

    if (parsed.data.login && parsed.data.login !== mobileUser.login) {
      const existingUser = await prisma.mobileUser.findUnique({
        where: {
          login: parsed.data.login,
        },
      });

      if (existingUser && !existingUser.deletedAt) {
        return res.status(409).json({
          message: "Mobile user with this login already exists",
        });
      }
    }

    const passwordHash = parsed.data.password
      ? await bcrypt.hash(parsed.data.password, 10)
      : undefined;

    const updatedMobileUser = await prisma.mobileUser.update({
      where: {
        id: mobileUserId,
      },
      data: {
        cityId: parsed.data.cityId,
        login: parsed.data.login,
        passwordHash,
        comment: parsed.data.comment,
        isActive: parsed.data.isActive,
      },
      select: {
        id: true,
        cityId: true,
        login: true,
        comment: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
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

    if (!Number.isInteger(mobileUserId)) {
      return res.status(400).json({ message: "Invalid mobile user id" });
    }

    const mobileUser = await prisma.mobileUser.findFirst({
      where: {
        id: mobileUserId,
        deletedAt: null,
      },
    });

    if (!mobileUser) {
      return res.status(404).json({ message: "Mobile user not found" });
    }
    const canEdit = await canEditCityData(req, mobileUser.cityId);

    if (!canEdit) {
      return res.status(403).json({
        message: "Недостаточно прав для этого города",
      });
    }
    await prisma.mobileUser.update({
      where: {
        id: mobileUserId,
      },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });

    return res.json({ message: "Mobile user deleted successfully" });
  } catch (error) {
    console.error("deleteMobileUser error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function restoreMobileUser(req: Request, res: Response) {
  try {
    const mobileUserId = Number(req.params.id);

    if (!Number.isInteger(mobileUserId)) {
      return res.status(400).json({ message: "Invalid mobile user id" });
    }

    const mobileUser = await prisma.mobileUser.findUnique({
      where: {
        id: mobileUserId,
      },
    });

    if (!mobileUser) {
      return res.status(404).json({ message: "Mobile user not found" });
    }

    if (!mobileUser.deletedAt) {
      return res.status(400).json({
        message: "Mobile user is not archived",
      });
    }
    const canEdit = await canEditCityData(req, mobileUser.cityId);

    if (!canEdit) {
      return res.status(403).json({
        message: "Недостаточно прав для этого города",
      });
    }
    const restoredMobileUser = await prisma.mobileUser.update({
      where: {
        id: mobileUserId,
      },
      data: {
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        cityId: true,
        login: true,
        comment: true,
        isActive: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json({
      message: "Mobile user restored successfully",
      data: restoredMobileUser,
    });
  } catch (error) {
    console.error("restoreMobileUser error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}