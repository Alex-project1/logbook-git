import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { createAdminActionLog } from "../../utils/admin-action-log";
import {
  buildCityAccessWhere,
  canEditCityData,
  getAllowedCityIds,
} from "../../utils/admin-access";

const memberSchema = z.object({
  employeeId: z.number().int().positive(),
  hasWeapon: z.boolean().optional(),
  isDriver: z.boolean().optional(),
  comment: z.string().optional().nullable(),
});

const createPostDutySchema = z.object({
  cityId: z.number().int().positive(),
  postId: z.number().int().positive(),
  vehicleId: z.number().int().positive().optional().nullable(),

  dutyDate: z.string().min(1),
  durationHours: z.number().positive().max(24),

  note: z.string().optional().nullable(),
  members: z.array(memberSchema).min(1, "Добавьте хотя бы одного сотрудника"),
});

const updatePostDutySchema = createPostDutySchema;

function parseNumberQuery(value: unknown) {
  if (!value) return undefined;

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return undefined;
  }

  return numberValue;
}

function parseDateValue(value: unknown) {
  if (!value || typeof value !== "string") {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function normalizeMembers(
  members: z.infer<typeof memberSchema>[],
  vehicleId?: number | null
) {
  const employeeIds = members.map((member) => member.employeeId);
  const uniqueEmployeeIds = new Set(employeeIds);

  if (uniqueEmployeeIds.size !== employeeIds.length) {
    throw new Error("Один сотрудник не может быть добавлен дважды");
  }

  const normalizedMembers = members.map((member) => ({
    employeeId: member.employeeId,
    hasWeapon: Boolean(member.hasWeapon),
    isDriver: vehicleId ? Boolean(member.isDriver) : false,
    comment: member.comment?.trim() || null,
  }));

  if (vehicleId) {
    const driversCount = normalizedMembers.filter((member) => member.isDriver).length;

    if (driversCount !== 1) {
      throw new Error("Если выбран автомобиль, должен быть ровно один водитель");
    }
  }

  return normalizedMembers;
}

async function validatePostDutyReferences(params: {
  cityId: number;
  postId: number;
  vehicleId?: number | null;
  employeeIds: number[];
}) {
  const city = await prisma.city.findFirst({
    where: {
      id: params.cityId,
      deletedAt: null,
      isActive: true,
    },
  });

  if (!city) {
    throw new Error("Город не найден или неактивен");
  }

  const post = await prisma.dutyPost.findFirst({
    where: {
      id: params.postId,
      cityId: params.cityId,
      deletedAt: null,
      isActive: true,
    },
  });

  if (!post) {
    throw new Error("Пост не найден в выбранном городе или неактивен");
  }

  if (params.vehicleId) {
    const vehicle = await prisma.vehicle.findFirst({
      where: {
        id: params.vehicleId,
        cityId: params.cityId,
        deletedAt: null,
        isActive: true,
      },
    });

    if (!vehicle) {
      throw new Error("Автомобиль не найден в выбранном городе или неактивен");
    }
  }

  const employeesCount = await prisma.employee.count({
    where: {
      id: {
        in: params.employeeIds,
      },
      cityId: params.cityId,
      deletedAt: null,
      isActive: true,
    },
  });

  if (employeesCount !== params.employeeIds.length) {
    throw new Error("Один или несколько сотрудников не найдены в выбранном городе или неактивны");
  }
}

export async function getPostDuties(req: Request, res: Response) {
  try {
    const page = Math.max(parseNumberQuery(req.query.page) ?? 1, 1);
    const pageSizeRaw = parseNumberQuery(req.query.pageSize) ?? 20;
    const pageSize = Math.min(Math.max(pageSizeRaw, 10), 100);

    const cityId = parseNumberQuery(req.query.cityId);
    const postId = parseNumberQuery(req.query.postId);
    const vehicleId = parseNumberQuery(req.query.vehicleId);
    const employeeId = parseNumberQuery(req.query.employeeId);

    const dateFrom = parseDateValue(req.query.dateFrom);
    const dateTo = parseDateValue(req.query.dateTo);

    const archive = req.query.archive === "true";
    const search = req.query.search ? String(req.query.search).trim() : "";

    const allowedCityIds = await getAllowedCityIds(req);

    if (
      allowedCityIds !== null &&
      cityId &&
      !allowedCityIds.includes(cityId)
    ) {
      return res.json({
        filters: {
          page,
          pageSize,
          cityId,
          postId: postId ?? null,
          vehicleId: vehicleId ?? null,
          employeeId: employeeId ?? null,
          dateFrom: dateFrom ?? null,
          dateTo: dateTo ?? null,
          archive,
          search,
        },
        pagination: {
          page,
          pageSize,
          total: 0,
          totalPages: 0,
        },
        data: [],
      });
    }

    const where: any = {
      ...(archive ? { deletedAt: { not: null } } : { deletedAt: null }),
      ...(cityId ? { cityId } : buildCityAccessWhere(allowedCityIds)),
      ...(postId ? { postId } : {}),
      ...(vehicleId ? { vehicleId } : {}),
      ...(employeeId
        ? {
            members: {
              some: {
                employeeId,
              },
            },
          }
        : {}),
      ...(dateFrom || dateTo
        ? {
            dutyDate: {
              ...(dateFrom ? { gte: dateFrom } : {}),
              ...(dateTo ? { lte: dateTo } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { note: { contains: search } },
              { city: { name: { contains: search } } },
              { post: { name: { contains: search } } },
              { vehicle: { title: { contains: search } } },
              { vehicle: { licensePlate: { contains: search } } },
              {
                members: {
                  some: {
                    employee: {
                      fullName: {
                        contains: search,
                      },
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [total, postDuties] = await Promise.all([
      prisma.postDuty.count({ where }),

      prisma.postDuty.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: {
          dutyDate: "desc",
        },
        include: {
          city: {
            select: {
              id: true,
              name: true,
            },
          },
          post: {
            select: {
              id: true,
              name: true,
            },
          },
          vehicle: {
            select: {
              id: true,
              title: true,
              licensePlate: true,
            },
          },
          members: {
            orderBy: {
              employee: {
                fullName: "asc",
              },
            },
            include: {
              employee: {
                select: {
                  id: true,
                  fullName: true,
                },
              },
            },
          },
        },
      }),
    ]);

    return res.json({
      filters: {
        page,
        pageSize,
        cityId: cityId ?? null,
        postId: postId ?? null,
        vehicleId: vehicleId ?? null,
        employeeId: employeeId ?? null,
        dateFrom: dateFrom ?? null,
        dateTo: dateTo ?? null,
        archive,
        search,
      },
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      data: postDuties.map((duty) => ({
        ...duty,
        durationHours: Number(duty.durationHours),
        shiftEquivalent: Number(duty.durationHours) / 24,
      })),
    });
  } catch (error) {
    console.error("getPostDuties error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

export async function getPostDutyById(req: Request, res: Response) {
  try {
    const dutyId = Number(req.params.id);

    if (!Number.isInteger(dutyId)) {
      return res.status(400).json({
        message: "Invalid duty id",
      });
    }

    const allowedCityIds = await getAllowedCityIds(req);

    const duty = await prisma.postDuty.findFirst({
      where: {
        id: dutyId,
        deletedAt: null,
        ...buildCityAccessWhere(allowedCityIds),
      },
      include: {
        city: true,
        post: true,
        vehicle: true,
        members: {
          include: {
            employee: true,
          },
        },
      },
    });

    if (!duty) {
      return res.status(404).json({
        message: "Постовое дежурство не найдено",
      });
    }

    return res.json({
      data: {
        ...duty,
        durationHours: Number(duty.durationHours),
        shiftEquivalent: Number(duty.durationHours) / 24,
      },
    });
  } catch (error) {
    console.error("getPostDutyById error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

export async function createPostDuty(req: Request, res: Response) {
  try {
    const parsed = createPostDutySchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation error",
        errors: parsed.error.flatten(),
      });
    }

    const dutyDate = parseDateValue(parsed.data.dutyDate);

    if (!dutyDate) {
      return res.status(400).json({
        message: "Некорректная дата дежурства",
      });
    }

    const canEdit = await canEditCityData(req, parsed.data.cityId);

    if (!canEdit) {
      return res.status(403).json({
        message: "Недостаточно прав для этого города",
      });
    }

    const vehicleId = parsed.data.vehicleId || null;
    const members = normalizeMembers(parsed.data.members, vehicleId);

    await validatePostDutyReferences({
      cityId: parsed.data.cityId,
      postId: parsed.data.postId,
      vehicleId,
      employeeIds: members.map((member) => member.employeeId),
    });

    const duty = await prisma.postDuty.create({
      data: {
        cityId: parsed.data.cityId,
        postId: parsed.data.postId,
        vehicleId,
        dutyDate,
        durationHours: parsed.data.durationHours,
        note: parsed.data.note?.trim() || null,

        members: {
          create: members,
        },
      },
      include: {
        city: true,
        post: true,
        vehicle: true,
        members: {
          include: {
            employee: true,
          },
        },
      },
    });
    await createAdminActionLog(req, {
      action: "CREATE_POST_DUTY",
      entityType: "POST_DUTY",
      entityId: duty.id,
      cityId: duty.cityId,
      description: `Создано постовое дежурство #${duty.id}: ${duty.post.name}`,
      metadata: {
        dutyId: duty.id,
        cityId: duty.cityId,
        postId: duty.postId,
        postName: duty.post.name,
        vehicleId: duty.vehicleId,
        dutyDate: duty.dutyDate,
        durationHours: Number(duty.durationHours),
        membersCount: duty.members.length,
      },
    });
    return res.status(201).json({
      message: "Постовое дежурство создано",
      data: {
        ...duty,
        durationHours: Number(duty.durationHours),
        shiftEquivalent: Number(duty.durationHours) / 24,
      },
    });
  } catch (error) {
    console.error("createPostDuty error:", error);

    if (error instanceof Error) {
      return res.status(400).json({
        message: error.message,
      });
    }

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

export async function updatePostDuty(req: Request, res: Response) {
  try {
    const dutyId = Number(req.params.id);

    if (!Number.isInteger(dutyId)) {
      return res.status(400).json({
        message: "Invalid duty id",
      });
    }

    const existingDuty = await prisma.postDuty.findFirst({
      where: {
        id: dutyId,
        deletedAt: null,
      },
    });

    if (!existingDuty) {
      return res.status(404).json({
        message: "Постовое дежурство не найдено",
      });
    }

    const canEditCurrentCity = await canEditCityData(req, existingDuty.cityId);

    if (!canEditCurrentCity) {
      return res.status(403).json({
        message: "Недостаточно прав для этого города",
      });
    }

    const parsed = updatePostDutySchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation error",
        errors: parsed.error.flatten(),
      });
    }

    const canEditNewCity = await canEditCityData(req, parsed.data.cityId);

    if (!canEditNewCity) {
      return res.status(403).json({
        message: "Недостаточно прав для нового города",
      });
    }

    const dutyDate = parseDateValue(parsed.data.dutyDate);

    if (!dutyDate) {
      return res.status(400).json({
        message: "Некорректная дата дежурства",
      });
    }

    const vehicleId = parsed.data.vehicleId || null;
    const members = normalizeMembers(parsed.data.members, vehicleId);

    await validatePostDutyReferences({
      cityId: parsed.data.cityId,
      postId: parsed.data.postId,
      vehicleId,
      employeeIds: members.map((member) => member.employeeId),
    });

    const updatedDuty = await prisma.$transaction(async (tx) => {
      await tx.postDutyMember.deleteMany({
        where: {
          postDutyId: dutyId,
        },
      });

      return tx.postDuty.update({
        where: {
          id: dutyId,
        },
        data: {
          cityId: parsed.data.cityId,
          postId: parsed.data.postId,
          vehicleId,
          dutyDate,
          durationHours: parsed.data.durationHours,
          note: parsed.data.note?.trim() || null,

          members: {
            create: members,
          },
        },
        include: {
          city: true,
          post: true,
          vehicle: true,
          members: {
            include: {
              employee: true,
            },
          },
        },
      });
    });
    await createAdminActionLog(req, {
      action: "UPDATE_POST_DUTY",
      entityType: "POST_DUTY",
      entityId: updatedDuty.id,
      cityId: updatedDuty.cityId,
      description: `Обновлено постовое дежурство #${updatedDuty.id}: ${updatedDuty.post.name}`,
      metadata: {
        dutyId: updatedDuty.id,
        oldCityId: existingDuty.cityId,
        newCityId: updatedDuty.cityId,
        oldPostId: existingDuty.postId,
        newPostId: updatedDuty.postId,
        postName: updatedDuty.post.name,
        oldVehicleId: existingDuty.vehicleId,
        newVehicleId: updatedDuty.vehicleId,
        dutyDate: updatedDuty.dutyDate,
        durationHours: Number(updatedDuty.durationHours),
        membersCount: updatedDuty.members.length,
      },
    });
    return res.json({
      message: "Постовое дежурство обновлено",
      data: {
        ...updatedDuty,
        durationHours: Number(updatedDuty.durationHours),
        shiftEquivalent: Number(updatedDuty.durationHours) / 24,
      },
    });
  } catch (error) {
    console.error("updatePostDuty error:", error);

    if (error instanceof Error) {
      return res.status(400).json({
        message: error.message,
      });
    }

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

export async function deletePostDuty(req: Request, res: Response) {
  try {
    const dutyId = Number(req.params.id);

    if (!Number.isInteger(dutyId)) {
      return res.status(400).json({
        message: "Invalid duty id",
      });
    }

    const duty = await prisma.postDuty.findFirst({
      where: {
        id: dutyId,
        deletedAt: null,
      },
    });

    if (!duty) {
      return res.status(404).json({
        message: "Постовое дежурство не найдено",
      });
    }

    const canEdit = await canEditCityData(req, duty.cityId);

    if (!canEdit) {
      return res.status(403).json({
        message: "Недостаточно прав для этого города",
      });
    }

    await prisma.postDuty.update({
      where: {
        id: dutyId,
      },
      data: {
        deletedAt: new Date(),
      },
    });
    await createAdminActionLog(req, {
      action: "DELETE_POST_DUTY",
      entityType: "POST_DUTY",
      entityId: dutyId,
      cityId: duty.cityId,
      description: `Удалено постовое дежурство #${dutyId}`,
      metadata: {
        dutyId,
        cityId: duty.cityId,
        postId: duty.postId,
        vehicleId: duty.vehicleId,
        dutyDate: duty.dutyDate,
        durationHours: Number(duty.durationHours),
      },
    });
    return res.json({
      message: "Постовое дежурство удалено",
    });
  } catch (error) {
    console.error("deletePostDuty error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

export async function restorePostDuty(req: Request, res: Response) {
  try {
    const dutyId = Number(req.params.id);

    if (!Number.isInteger(dutyId)) {
      return res.status(400).json({
        message: "Invalid duty id",
      });
    }

    const duty = await prisma.postDuty.findUnique({
      where: {
        id: dutyId,
      },
    });

    if (!duty) {
      return res.status(404).json({
        message: "Постовое дежурство не найдено",
      });
    }

    if (!duty.deletedAt) {
      return res.status(400).json({
        message: "Постовое дежурство не находится в архиве",
      });
    }

    const canEdit = await canEditCityData(req, duty.cityId);

    if (!canEdit) {
      return res.status(403).json({
        message: "Недостаточно прав для этого города",
      });
    }

    await prisma.postDuty.update({
      where: {
        id: dutyId,
      },
      data: {
        deletedAt: null,
      },
    });
    const restoredDuty = await prisma.postDuty.update({
      where: {
        id: dutyId,
      },
      data: {
        deletedAt: null,
      },
    });
    
    await createAdminActionLog(req, {
      action: "RESTORE_POST_DUTY",
      entityType: "POST_DUTY",
      entityId: dutyId,
      cityId: restoredDuty.cityId,
      description: `Восстановлено постовое дежурство #${dutyId}`,
      metadata: {
        dutyId,
        cityId: restoredDuty.cityId,
        postId: restoredDuty.postId,
        vehicleId: restoredDuty.vehicleId,
        dutyDate: restoredDuty.dutyDate,
        durationHours: Number(restoredDuty.durationHours),
      },
    });
    return res.json({
      message: "Постовое дежурство восстановлено",
    });
  } catch (error) {
    console.error("restorePostDuty error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}