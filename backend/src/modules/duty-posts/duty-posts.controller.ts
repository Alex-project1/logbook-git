import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { createAdminActionLog } from "../../utils/admin-action-log";
import {
  buildCityAccessWhere,
  canEditCityData,
  getAllowedCityIds,
} from "../../utils/admin-access";

const createDutyPostSchema = z.object({
  cityId: z.number().int().positive(),
  name: z.string().min(1, "Post name is required"),
  comment: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

const updateDutyPostSchema = z.object({
  cityId: z.number().int().positive().optional(),
  name: z.string().min(1, "Post name is required").optional(),
  comment: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

export async function getDutyPosts(req: Request, res: Response) {
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

    const posts = await prisma.dutyPost.findMany({
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
        city: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return res.json({
      data: posts,
    });
  } catch (error) {
    console.error("getDutyPosts error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

export async function getDutyPostById(req: Request, res: Response) {
  try {
    const postId = Number(req.params.id);

    if (!Number.isInteger(postId)) {
      return res.status(400).json({
        message: "Invalid post id",
      });
    }

    const allowedCityIds = await getAllowedCityIds(req);

    const post = await prisma.dutyPost.findFirst({
      where: {
        id: postId,
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
        city: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!post) {
      return res.status(404).json({
        message: "Пост не найден",
      });
    }

    return res.json({
      data: post,
    });
  } catch (error) {
    console.error("getDutyPostById error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

export async function createDutyPost(req: Request, res: Response) {
  try {
    const parsed = createDutyPostSchema.safeParse(req.body);

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
      return res.status(404).json({
        message: "Город не найден или неактивен",
      });
    }

    const existingPost = await prisma.dutyPost.findFirst({
      where: {
        cityId: parsed.data.cityId,
        name: parsed.data.name.trim(),
      },
    });

    if (existingPost && !existingPost.deletedAt) {
      return res.status(409).json({
        message: "Пост с таким названием уже существует в этом городе",
      });
    }

    if (existingPost?.deletedAt) {
      return res.status(409).json({
        message: "Пост с таким названием находится в архиве. Восстановите его.",
      });
    }

    const post = await prisma.dutyPost.create({
      data: {
        cityId: parsed.data.cityId,
        name: parsed.data.name.trim(),
        comment: parsed.data.comment?.trim() || null,
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
      },
    });
    await createAdminActionLog(req, {
      action: "CREATE_DUTY_POST",
      entityType: "DUTY_POST",
      entityId: post.id,
      cityId: post.cityId,
      description: `Создан пост #${post.id}: ${post.name}`,
      metadata: {
        postId: post.id,
        cityId: post.cityId,
        name: post.name,
        comment: post.comment,
        isActive: post.isActive,
      },
    });
    return res.status(201).json({
      data: post,
    });
  } catch (error) {
    console.error("createDutyPost error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

export async function updateDutyPost(req: Request, res: Response) {
  try {
    const postId = Number(req.params.id);

    if (!Number.isInteger(postId)) {
      return res.status(400).json({
        message: "Invalid post id",
      });
    }

    const parsed = updateDutyPostSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation error",
        errors: parsed.error.flatten(),
      });
    }

    const post = await prisma.dutyPost.findFirst({
      where: {
        id: postId,
        deletedAt: null,
      },
    });

    if (!post) {
      return res.status(404).json({
        message: "Пост не найден",
      });
    }

    const canEditCurrentCity = await canEditCityData(req, post.cityId);

    if (!canEditCurrentCity) {
      return res.status(403).json({
        message: "Недостаточно прав для этого города",
      });
    }

    const newCityId = parsed.data.cityId ?? post.cityId;
    const newName = parsed.data.name?.trim() ?? post.name;

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
        return res.status(404).json({
          message: "Город не найден или неактивен",
        });
      }
    }

    const existingPost = await prisma.dutyPost.findFirst({
      where: {
        cityId: newCityId,
        name: newName,
        NOT: {
          id: postId,
        },
      },
    });

    if (existingPost && !existingPost.deletedAt) {
      return res.status(409).json({
        message: "Пост с таким названием уже существует в этом городе",
      });
    }

    const updatedPost = await prisma.dutyPost.update({
      where: {
        id: postId,
      },
      data: {
        cityId: parsed.data.cityId,
        name: parsed.data.name?.trim(),
        comment:
          typeof parsed.data.comment === "string"
            ? parsed.data.comment.trim() || null
            : parsed.data.comment,
        isActive: parsed.data.isActive,
      },
      select: {
        id: true,
        cityId: true,
        name: true,
        comment: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    await createAdminActionLog(req, {
      action: "UPDATE_DUTY_POST",
      entityType: "DUTY_POST",
      entityId: updatedPost.id,
      cityId: updatedPost.cityId,
      description: `Обновлен пост #${updatedPost.id}: ${updatedPost.name}`,
      metadata: {
        postId: updatedPost.id,
        oldCityId: post.cityId,
        newCityId: updatedPost.cityId,
        oldName: post.name,
        newName: updatedPost.name,
        isActive: updatedPost.isActive,
      },
    });
    return res.json({
      data: updatedPost,
    });
  } catch (error) {
    console.error("updateDutyPost error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

export async function deleteDutyPost(req: Request, res: Response) {
  try {
    const postId = Number(req.params.id);

    if (!Number.isInteger(postId)) {
      return res.status(400).json({
        message: "Invalid post id",
      });
    }

    const post = await prisma.dutyPost.findFirst({
      where: {
        id: postId,
        deletedAt: null,
      },
    });

    if (!post) {
      return res.status(404).json({
        message: "Пост не найден",
      });
    }

    const canEdit = await canEditCityData(req, post.cityId);

    if (!canEdit) {
      return res.status(403).json({
        message: "Недостаточно прав для этого города",
      });
    }

    await prisma.dutyPost.update({
      where: {
        id: postId,
      },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });
    await createAdminActionLog(req, {
      action: "DELETE_DUTY_POST",
      entityType: "DUTY_POST",
      entityId: postId,
      cityId: post.cityId,
      description: `Удален пост #${postId}: ${post.name}`,
      metadata: {
        postId,
        cityId: post.cityId,
        name: post.name,
      },
    });
    return res.json({
      message: "Пост удален",
    });
  } catch (error) {
    console.error("deleteDutyPost error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

export async function restoreDutyPost(req: Request, res: Response) {
  try {
    const postId = Number(req.params.id);

    if (!Number.isInteger(postId)) {
      return res.status(400).json({
        message: "Invalid post id",
      });
    }

    const post = await prisma.dutyPost.findUnique({
      where: {
        id: postId,
      },
    });

    if (!post) {
      return res.status(404).json({
        message: "Пост не найден",
      });
    }

    if (!post.deletedAt) {
      return res.status(400).json({
        message: "Пост не находится в архиве",
      });
    }

    const canEdit = await canEditCityData(req, post.cityId);

    if (!canEdit) {
      return res.status(403).json({
        message: "Недостаточно прав для этого города",
      });
    }

    const restoredPost = await prisma.dutyPost.update({
      where: {
        id: postId,
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
      },
    });
    await createAdminActionLog(req, {
      action: "RESTORE_DUTY_POST",
      entityType: "DUTY_POST",
      entityId: restoredPost.id,
      cityId: restoredPost.cityId,
      description: `Восстановлен пост #${restoredPost.id}: ${restoredPost.name}`,
      metadata: {
        postId: restoredPost.id,
        cityId: restoredPost.cityId,
        name: restoredPost.name,
      },
    });
    return res.json({
      message: "Пост восстановлен",
      data: restoredPost,
    });
  } catch (error) {
    console.error("restoreDutyPost error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}