import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";

const createReasonSchema = z.object({
  name: z.string().min(1, "Reason name is required"),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const updateReasonSchema = z.object({
  name: z.string().min(1, "Reason name is required").optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export async function getAdditionalAlarmReasons(req: Request, res: Response) {
  try {
    const includeInactive = req.query.includeInactive === "true";
    const archive = req.query.archive === "true";

    const reasons = await prisma.additionalAlarmReason.findMany({
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
        isSystem: true,
        isActive: true,
        sortOrder: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json({
      data: reasons,
    });
  } catch (error) {
    console.error("getAdditionalAlarmReasons error:", error);

    return res.status(500).json({
      message: "Внутрішня помилка сервера",
    });
  }
}
export async function getAdditionalAlarmReasonById(req: Request, res: Response) {
  try {
    const reasonId = Number(req.params.id);

    if (!Number.isInteger(reasonId)) {
      return res.status(400).json({
        message: "Invalid reason id",
      });
    }

    const reason = await prisma.additionalAlarmReason.findFirst({
      where: {
        id: reasonId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        isSystem: true,
        isActive: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!reason) {
      return res.status(404).json({
        message: "Reason not found",
      });
    }

    return res.json({
      data: reason,
    });
  } catch (error) {
    console.error("getAdditionalAlarmReasonById error:", error);

    return res.status(500).json({
      message: "Внутрішня помилка сервера",
    });
  }
}

export async function createAdditionalAlarmReason(req: Request, res: Response) {
  try {
    const parsed = createReasonSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation error",
        errors: parsed.error.flatten(),
      });
    }

    const existingReason = await prisma.additionalAlarmReason.findFirst({
      where: {
        name: parsed.data.name,
        deletedAt: null,
      },
    });

    if (existingReason) {
      return res.status(409).json({
        message: "Reason with this name already exists",
      });
    }

    const reason = await prisma.additionalAlarmReason.create({
      data: {
        name: parsed.data.name,
        isSystem: false,
        isActive: parsed.data.isActive ?? true,
        sortOrder: parsed.data.sortOrder ?? 100,
      },
      select: {
        id: true,
        name: true,
        isSystem: true,
        isActive: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.status(201).json({
      data: reason,
    });
  } catch (error) {
    console.error("createAdditionalAlarmReason error:", error);

    return res.status(500).json({
      message: "Внутрішня помилка сервера",
    });
  }
}

export async function updateAdditionalAlarmReason(req: Request, res: Response) {
  try {
    const reasonId = Number(req.params.id);

    if (!Number.isInteger(reasonId)) {
      return res.status(400).json({
        message: "Invalid reason id",
      });
    }

    const parsed = updateReasonSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation error",
        errors: parsed.error.flatten(),
      });
    }

    const reason = await prisma.additionalAlarmReason.findFirst({
      where: {
        id: reasonId,
        deletedAt: null,
      },
    });

    if (!reason) {
      return res.status(404).json({
        message: "Reason not found",
      });
    }

    if (parsed.data.name && parsed.data.name !== reason.name) {
      const existingReason = await prisma.additionalAlarmReason.findFirst({
        where: {
          name: parsed.data.name,
          deletedAt: null,
          NOT: {
            id: reasonId,
          },
        },
      });

      if (existingReason) {
        return res.status(409).json({
          message: "Reason with this name already exists",
        });
      }
    }

    const updatedReason = await prisma.additionalAlarmReason.update({
      where: {
        id: reasonId,
      },
      data: {
        name: parsed.data.name,
        sortOrder: parsed.data.sortOrder,
        isActive: parsed.data.isActive,
      },
      select: {
        id: true,
        name: true,
        isSystem: true,
        isActive: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json({
      data: updatedReason,
    });
  } catch (error) {
    console.error("updateAdditionalAlarmReason error:", error);

    return res.status(500).json({
      message: "Внутрішня помилка сервера",
    });
  }
}

export async function deleteAdditionalAlarmReason(req: Request, res: Response) {
  try {
    const reasonId = Number(req.params.id);

    if (!Number.isInteger(reasonId)) {
      return res.status(400).json({
        message: "Invalid reason id",
      });
    }

    const reason = await prisma.additionalAlarmReason.findFirst({
      where: {
        id: reasonId,
        deletedAt: null,
      },
    });

    if (!reason) {
      return res.status(404).json({
        message: "Reason not found",
      });
    }

    if (reason.isSystem) {
      return res.status(400).json({
        message: "System reason cannot be deleted. You can only deactivate it.",
      });
    }

    await prisma.additionalAlarmReason.update({
      where: {
        id: reasonId,
      },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });

    return res.json({
      message: "Reason deleted successfully",
    });
  } catch (error) {
    console.error("deleteAdditionalAlarmReason error:", error);

    return res.status(500).json({
      message: "Внутрішня помилка сервера",
    });
  }
}

export async function restoreAdditionalAlarmReason(req: Request, res: Response) {
  try {
    const reasonId = Number(req.params.id);

    if (!Number.isInteger(reasonId)) {
      return res.status(400).json({
        message: "Invalid reason id",
      });
    }

    const reason = await prisma.additionalAlarmReason.findUnique({
      where: {
        id: reasonId,
      },
    });

    if (!reason) {
      return res.status(404).json({
        message: "Reason not found",
      });
    }

    if (!reason.deletedAt) {
      return res.status(400).json({
        message: "Reason is not archived",
      });
    }

    if (reason.isSystem) {
      return res.status(400).json({
        message: "System reason cannot be restored from archive",
      });
    }

    const existingReason = await prisma.additionalAlarmReason.findFirst({
      where: {
        name: reason.name,
        deletedAt: null,
        NOT: {
          id: reasonId,
        },
      },
    });

    if (existingReason) {
      return res.status(409).json({
        message: "Active reason with this name already exists",
      });
    }

    const restoredReason = await prisma.additionalAlarmReason.update({
      where: {
        id: reasonId,
      },
      data: {
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        isSystem: true,
        isActive: true,
        sortOrder: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json({
      message: "Reason restored successfully",
      data: restoredReason,
    });
  } catch (error) {
    console.error("restoreAdditionalAlarmReason error:", error);

    return res.status(500).json({
      message: "Внутрішня помилка сервера",
    });
  }
}