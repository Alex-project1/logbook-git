import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";

const mobilePostDutyMemberSchema = z.object({
  employeeId: z.number().int().positive(),
  hasWeapon: z.boolean().optional(),
  isDriver: z.boolean().optional(),
  comment: z.string().optional().nullable(),
});

const createMobilePostDutySchema = z.object({
  postId: z.number().int().positive(),
  vehicleId: z.number().int().positive().optional().nullable(),
  dutyDate: z.string().min(1),
  durationHours: z.number().positive().max(24),
  note: z.string().optional().nullable(),
  members: z
    .array(mobilePostDutyMemberSchema)
    .min(1, "Додайте хоча б одного співробітника"),
});

function parseDateValue(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function normalizeMobilePostDutyMembers(
  members: z.infer<typeof mobilePostDutyMemberSchema>[],
  vehicleId?: number | null
) {
  const employeeIds = members.map((member) => member.employeeId);
  const uniqueEmployeeIds = new Set(employeeIds);

  if (uniqueEmployeeIds.size !== employeeIds.length) {
    throw new Error("Один співробітник не може бути доданий двічі");
  }

  const normalizedMembers = members.map((member) => ({
    employeeId: member.employeeId,
    hasWeapon: Boolean(member.hasWeapon),
    isDriver: vehicleId ? Boolean(member.isDriver) : false,
    comment: member.comment?.trim() || null,
  }));

  if (vehicleId) {
    const driversCount = normalizedMembers.filter((member) => member.isDriver)
      .length;

    if (driversCount !== 1) {
      throw new Error("Якщо вибрано автомобіль, має бути рівно один водій");
    }
  }

  return normalizedMembers;
}

async function validateMobilePostDutyReferences(params: {
  cityId: number;
  postId: number;
  vehicleId?: number | null;
  employeeIds: number[];
}) {
  const post = await prisma.dutyPost.findFirst({
    where: {
      id: params.postId,
      cityId: params.cityId,
      deletedAt: null,
      isActive: true,
    },
  });

  if (!post) {
    throw new Error("Пост не знайдено або він неактивний");
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
      throw new Error("Автомобіль не знайдено або він неактивний");
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
    throw new Error("Один або декілька співробітників не знайдені або неактивні");
  }
}

export async function createMobilePostDuty(req: Request, res: Response) {
  try {
    if (!req.mobileUser) {
      return res.status(401).json({
        message: "Не авторизовано",
      });
    }

    const parsed = createMobilePostDutySchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Помилка валідації",
        errors: parsed.error.flatten(),
      });
    }

    const cityId = req.mobileUser.cityId;
    const dutyDate = parseDateValue(parsed.data.dutyDate);

    if (!dutyDate) {
      return res.status(400).json({
        message: "Некоректна дата чергування",
      });
    }

    const vehicleId = parsed.data.vehicleId || null;

    const members = normalizeMobilePostDutyMembers(
      parsed.data.members,
      vehicleId
    );

    await validateMobilePostDutyReferences({
      cityId,
      postId: parsed.data.postId,
      vehicleId,
      employeeIds: members.map((member) => member.employeeId),
    });

    const duty = await prisma.postDuty.create({
      data: {
        cityId,
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
    });

    return res.status(201).json({
      message: "Постове чергування створено",
      data: {
        ...duty,
        durationHours: Number(duty.durationHours),
        shiftEquivalent: Number(duty.durationHours) / 24,
      },
    });
  } catch (error) {
    console.error("createMobilePostDuty error:", error);

    if (error instanceof Error) {
      return res.status(400).json({
        message: error.message,
      });
    }

    return res.status(500).json({
      message: "Внутрішня помилка сервера",
    });
  }
}