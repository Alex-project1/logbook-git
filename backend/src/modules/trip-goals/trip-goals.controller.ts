import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";

const createTripGoalSchema = z.object({
  name: z.string().min(1, "Trip goal name is required"),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const updateTripGoalSchema = z.object({
  name: z.string().min(1, "Trip goal name is required").optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export async function getTripGoals(req: Request, res: Response) {
  try {
    const includeInactive = req.query.includeInactive === "true";
    const archive = req.query.archive === "true";

    const tripGoals = await prisma.tripGoal.findMany({
      where: {
        ...(archive ? { deletedAt: { not: null } } : { deletedAt: null }),
        ...(includeInactive || archive ? {} : { isActive: true }),
      },
      orderBy: [
        {
          sortOrder: "asc",
        },
        {
          name: "asc",
        },
      ],
      select: {
        id: true,
        name: true,
        systemCode: true,
        isSystem: true,
        isActive: true,
        sortOrder: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json({
      data: tripGoals,
    });
  } catch (error) {
    console.error("getTripGoals error:", error);

    return res.status(500).json({
      message: "Внутрішня помилка сервера",
    });
  }
}

export async function getTripGoalById(req: Request, res: Response) {
  try {
    const tripGoalId = Number(req.params.id);

    if (!Number.isInteger(tripGoalId)) {
      return res.status(400).json({
        message: "Invalid trip goal id",
      });
    }

    const tripGoal = await prisma.tripGoal.findFirst({
      where: {
        id: tripGoalId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        systemCode: true,
        isSystem: true,
        isActive: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!tripGoal) {
      return res.status(404).json({
        message: "Trip goal not found",
      });
    }

    return res.json({
      data: tripGoal,
    });
  } catch (error) {
    console.error("getTripGoalById error:", error);

    return res.status(500).json({
      message: "Внутрішня помилка сервера",
    });
  }
}

export async function createTripGoal(req: Request, res: Response) {
  try {
    const parsed = createTripGoalSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation error",
        errors: parsed.error.flatten(),
      });
    }

    const existingTripGoal = await prisma.tripGoal.findFirst({
      where: {
        name: parsed.data.name,
        systemCode: null,
        deletedAt: null,
      },
    });

    if (existingTripGoal) {
      return res.status(409).json({
        message: "Trip goal with this name already exists",
      });
    }

    const tripGoal = await prisma.tripGoal.create({
      data: {
        name: parsed.data.name,
        systemCode: null,
        isSystem: false,
        isActive: parsed.data.isActive ?? true,
        sortOrder: parsed.data.sortOrder ?? 100,
      },
      select: {
        id: true,
        name: true,
        systemCode: true,
        isSystem: true,
        isActive: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.status(201).json({
      data: tripGoal,
    });
  } catch (error) {
    console.error("createTripGoal error:", error);

    return res.status(500).json({
      message: "Внутрішня помилка сервера",
    });
  }
}

export async function updateTripGoal(req: Request, res: Response) {
  try {
    const tripGoalId = Number(req.params.id);

    if (!Number.isInteger(tripGoalId)) {
      return res.status(400).json({
        message: "Invalid trip goal id",
      });
    }

    const parsed = updateTripGoalSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation error",
        errors: parsed.error.flatten(),
      });
    }

    const tripGoal = await prisma.tripGoal.findFirst({
      where: {
        id: tripGoalId,
        deletedAt: null,
      },
    });

    if (!tripGoal) {
      return res.status(404).json({
        message: "Trip goal not found",
      });
    }

    if (parsed.data.name && parsed.data.name !== tripGoal.name) {
      const existingTripGoal = await prisma.tripGoal.findFirst({
        where: {
          name: parsed.data.name,
          systemCode: tripGoal.isSystem ? tripGoal.systemCode : null,
          deletedAt: null,
          NOT: {
            id: tripGoalId,
          },
        },
      });

      if (existingTripGoal) {
        return res.status(409).json({
          message: "Trip goal with this name already exists",
        });
      }
    }

    const updatedTripGoal = await prisma.tripGoal.update({
      where: {
        id: tripGoalId,
      },
      data: {
        name: parsed.data.name,
        sortOrder: parsed.data.sortOrder,
        isActive: parsed.data.isActive,
      },
      select: {
        id: true,
        name: true,
        systemCode: true,
        isSystem: true,
        isActive: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json({
      data: updatedTripGoal,
    });
  } catch (error) {
    console.error("updateTripGoal error:", error);

    return res.status(500).json({
      message: "Внутрішня помилка сервера",
    });
  }
}

export async function deleteTripGoal(req: Request, res: Response) {
  try {
    const tripGoalId = Number(req.params.id);

    if (!Number.isInteger(tripGoalId)) {
      return res.status(400).json({
        message: "Invalid trip goal id",
      });
    }

    const tripGoal = await prisma.tripGoal.findFirst({
      where: {
        id: tripGoalId,
        deletedAt: null,
      },
    });

    if (!tripGoal) {
      return res.status(404).json({
        message: "Trip goal not found",
      });
    }

    if (tripGoal.isSystem) {
      return res.status(400).json({
        message: "System trip goal cannot be deleted. You can only deactivate it.",
      });
    }

    await prisma.tripGoal.update({
      where: {
        id: tripGoalId,
      },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });

    return res.json({
      message: "Trip goal deleted successfully",
    });
  } catch (error) {
    console.error("deleteTripGoal error:", error);

    return res.status(500).json({
      message: "Внутрішня помилка сервера",
    });
  }
}

export async function restoreTripGoal(req: Request, res: Response) {
  try {
    const tripGoalId = Number(req.params.id);

    if (!Number.isInteger(tripGoalId)) {
      return res.status(400).json({
        message: "Invalid trip goal id",
      });
    }

    const tripGoal = await prisma.tripGoal.findUnique({
      where: {
        id: tripGoalId,
      },
    });

    if (!tripGoal) {
      return res.status(404).json({
        message: "Trip goal not found",
      });
    }

    if (!tripGoal.deletedAt) {
      return res.status(400).json({
        message: "Trip goal is not archived",
      });
    }

    if (tripGoal.isSystem) {
      return res.status(400).json({
        message: "System trip goal cannot be restored from archive",
      });
    }

    const existingTripGoal = await prisma.tripGoal.findFirst({
      where: {
        name: tripGoal.name,
        deletedAt: null,
        NOT: {
          id: tripGoalId,
        },
      },
    });

    if (existingTripGoal) {
      return res.status(409).json({
        message: "Active trip goal with this name already exists",
      });
    }

    const restoredTripGoal = await prisma.tripGoal.update({
      where: {
        id: tripGoalId,
      },
      data: {
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        systemCode: true,
        isSystem: true,
        isActive: true,
        sortOrder: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json({
      message: "Trip goal restored successfully",
      data: restoredTripGoal,
    });
  } catch (error) {
    console.error("restoreTripGoal error:", error);

    return res.status(500).json({
      message: "Внутрішня помилка сервера",
    });
  }
}