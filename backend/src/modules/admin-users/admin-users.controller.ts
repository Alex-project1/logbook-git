import type { Request, Response } from "express";
import { AdminAccessLevel } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { prisma } from "../../config/prisma";
import {
  canManageUsers,
  getAdminUserId,
} from "../../utils/admin-access";

type AdminUserRoleCode = "admin" | "viewer";

type CityAccessInput = {
  cityId: number;
};

function parseNumberQuery(value: unknown) {
  if (!value) return undefined;

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return undefined;
  }

  return numberValue;
}

function normalizeRoleCode(value: unknown): AdminUserRoleCode | null {
  if (value === "admin" || value === "viewer") {
    return value;
  }

  return null;
}

function normalizeCityIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "number") {
        return item;
      }

      const cityAccess = item as Partial<CityAccessInput>;
      return Number(cityAccess.cityId);
    })
    .filter((cityId) => Number.isInteger(cityId) && cityId > 0);
}

function getAccessDefaults(roleCode: AdminUserRoleCode) {
  if (roleCode === "admin") {
    return {
      accessLevel: AdminAccessLevel.FULL,
      canAddShift: true,
      canDeleteShift: true,
    };
  }

  return {
    accessLevel: AdminAccessLevel.VIEW,
    canAddShift: false,
    canDeleteShift: false,
  };
}

function sanitizeUser(user: any) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    login: user.login,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    deletedAt: user.deletedAt,
    role: user.role,
    cityAccesses: user.adminCityAccesses ?? [],
  };
}

export async function getAdminUsers(req: Request, res: Response) {
  try {
    if (!canManageUsers(req)) {
      return res.status(403).json({
        message: "Недостатньо прав",
      });
    }

    const page = Math.max(parseNumberQuery(req.query.page) ?? 1, 1);
    const pageSizeRaw = parseNumberQuery(req.query.pageSize) ?? 20;
    const pageSize = Math.min(Math.max(pageSizeRaw, 10), 100);

    const roleCode = req.query.roleCode ? String(req.query.roleCode) : "";
    const cityId = parseNumberQuery(req.query.cityId);
    const search = req.query.search ? String(req.query.search).trim() : "";
    const includeArchived = req.query.includeArchived === "true";

    const where: any = {
      ...(includeArchived ? {} : { deletedAt: null }),
      ...(roleCode ? { role: { code: roleCode } } : {}),
      ...(cityId
        ? {
            adminCityAccesses: {
              some: {
                cityId,
              },
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              {
                name: {
                  contains: search,
                },
              },
              {
                login: {
                  contains: search,
                },
              },
              {
                email: {
                  contains: search,
                },
              },
            ],
          }
        : {}),
    };

    const [total, users] = await Promise.all([
      prisma.user.count({
        where,
      }),

      prisma.user.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: {
          createdAt: "desc",
        },
        include: {
          role: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          adminCityAccesses: {
            include: {
              city: {
                select: {
                  id: true,
                  name: true,
                  isActive: true,
                },
              },
            },
            orderBy: {
              city: {
                name: "asc",
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
        roleCode,
        cityId: cityId ?? null,
        search,
        includeArchived,
      },
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      data: users.map(sanitizeUser),
    });
  } catch (error) {
    console.error("getAdminUsers error:", error);

    return res.status(500).json({
      message: "Внутрішня помилка сервера",
    });
  }
}

export async function createAdminUser(req: Request, res: Response) {
  try {
    if (!canManageUsers(req)) {
      return res.status(403).json({
        message: "Недостатньо прав",
      });
    }

    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const login =
      typeof req.body.login === "string" ? req.body.login.trim() : "";
    const email =
      typeof req.body.email === "string" && req.body.email.trim()
        ? req.body.email.trim()
        : null;
    const password =
      typeof req.body.password === "string" ? req.body.password : "";

    const roleCode = normalizeRoleCode(req.body.roleCode);
    const cityIds = normalizeCityIds(req.body.cityIds);

    if (!name) {
      return res.status(400).json({
        message: "Укажите имя пользователя",
      });
    }

    if (!login) {
      return res.status(400).json({
        message: "Укажите логин",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: "Пароль должен быть минимум 6 символов",
      });
    }

    if (!roleCode) {
      return res.status(400).json({
        message: "Выберите роль: Администратор или Наблюдатель",
      });
    }

    if (cityIds.length === 0) {
      return res.status(400).json({
        message: "Выберите хотя бы один город доступа",
      });
    }

    const role = await prisma.role.findUnique({
      where: {
        code: roleCode,
      },
    });

    if (!role) {
      return res.status(400).json({
        message: "Роль не найдена",
      });
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          {
            login,
          },
          ...(email
            ? [
                {
                  email,
                },
              ]
            : []),
        ],
      },
    });

    if (existingUser) {
      return res.status(409).json({
        message: "Користувача з таким логіном або email уже існує",
      });
    }

    const citiesCount = await prisma.city.count({
      where: {
        id: {
          in: cityIds,
        },
        deletedAt: null,
      },
    });

    if (citiesCount !== cityIds.length) {
      return res.status(400).json({
        message: "Один или несколько городов не найдены",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const accessDefaults = getAccessDefaults(roleCode);

    const user = await prisma.user.create({
      data: {
        name,
        login,
        email,
        passwordHash,
        roleId: role.id,
        isActive: true,

        adminCityAccesses: {
          create: cityIds.map((cityId) => ({
            cityId,
            accessLevel: accessDefaults.accessLevel,
            canAddShift: accessDefaults.canAddShift,
            canDeleteShift: accessDefaults.canDeleteShift,
          })),
        },
      },
      include: {
        role: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        adminCityAccesses: {
          include: {
            city: {
              select: {
                id: true,
                name: true,
                isActive: true,
              },
            },
          },
        },
      },
    });

    return res.status(201).json({
      message: "Користувача створено",
      data: sanitizeUser(user),
    });
  } catch (error) {
    console.error("createAdminUser error:", error);

    return res.status(500).json({
      message: "Внутрішня помилка сервера",
    });
  }
}

export async function updateAdminUser(req: Request, res: Response) {
  try {
    if (!canManageUsers(req)) {
      return res.status(403).json({
        message: "Недостатньо прав",
      });
    }

    const userId = Number(req.params.id);

    if (!Number.isInteger(userId)) {
      return res.status(400).json({
        message: "Invalid user id",
      });
    }

    const currentAdminUserId = getAdminUserId(req);

    const existingUser = await prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
      },
      include: {
        role: true,
      },
    });

    if (!existingUser) {
      return res.status(404).json({
        message: "Користувача не знайдено",
      });
    }

    if (existingUser.role.code === "super_admin") {
      return res.status(400).json({
        message: "Супер администратора нельзя менять через этот раздел",
      });
    }

    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const login =
      typeof req.body.login === "string" ? req.body.login.trim() : "";
    const email =
      typeof req.body.email === "string" && req.body.email.trim()
        ? req.body.email.trim()
        : null;
    const password =
      typeof req.body.password === "string" ? req.body.password : "";
    const isActive =
      typeof req.body.isActive === "boolean" ? req.body.isActive : true;

    const roleCode = normalizeRoleCode(req.body.roleCode);
    const cityIds = normalizeCityIds(req.body.cityIds);

    if (!name) {
      return res.status(400).json({
        message: "Укажите имя пользователя",
      });
    }

    if (!login) {
      return res.status(400).json({
        message: "Укажите логин",
      });
    }

    if (!roleCode) {
      return res.status(400).json({
        message: "Выберите роль: Администратор или Наблюдатель",
      });
    }

    if (cityIds.length === 0) {
      return res.status(400).json({
        message: "Выберите хотя бы один город доступа",
      });
    }

    if (currentAdminUserId === userId && !isActive) {
      return res.status(400).json({
        message: "Нельзя отключить самого себя",
      });
    }

    const role = await prisma.role.findUnique({
      where: {
        code: roleCode,
      },
    });

    if (!role) {
      return res.status(400).json({
        message: "Роль не найдена",
      });
    }

    const duplicateUser = await prisma.user.findFirst({
      where: {
        id: {
          not: userId,
        },
        OR: [
          {
            login,
          },
          ...(email
            ? [
                {
                  email,
                },
              ]
            : []),
        ],
      },
    });

    if (duplicateUser) {
      return res.status(409).json({
        message: "Користувача з таким логіном або email уже існує",
      });
    }

    const citiesCount = await prisma.city.count({
      where: {
        id: {
          in: cityIds,
        },
        deletedAt: null,
      },
    });

    if (citiesCount !== cityIds.length) {
      return res.status(400).json({
        message: "Один или несколько городов не найдены",
      });
    }

    const accessDefaults = getAccessDefaults(roleCode);

    const passwordData =
      password.trim().length > 0
        ? {
            passwordHash: await bcrypt.hash(password, 10),
          }
        : {};

    const user = await prisma.$transaction(async (tx) => {
      await tx.adminCityAccess.deleteMany({
        where: {
          userId,
        },
      });

      return tx.user.update({
        where: {
          id: userId,
        },
        data: {
          name,
          login,
          email,
          roleId: role.id,
          isActive,
          ...passwordData,

          adminCityAccesses: {
            create: cityIds.map((cityId) => ({
              cityId,
              accessLevel: accessDefaults.accessLevel,
              canAddShift: accessDefaults.canAddShift,
              canDeleteShift: accessDefaults.canDeleteShift,
            })),
          },
        },
        include: {
          role: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          adminCityAccesses: {
            include: {
              city: {
                select: {
                  id: true,
                  name: true,
                  isActive: true,
                },
              },
            },
          },
        },
      });
    });

    return res.json({
      message: "Користувача оновлено",
      data: sanitizeUser(user),
    });
  } catch (error) {
    console.error("updateAdminUser error:", error);

    return res.status(500).json({
      message: "Внутрішня помилка сервера",
    });
  }
}

export async function deleteAdminUser(req: Request, res: Response) {
  try {
    if (!canManageUsers(req)) {
      return res.status(403).json({
        message: "Недостатньо прав",
      });
    }

    const userId = Number(req.params.id);

    if (!Number.isInteger(userId)) {
      return res.status(400).json({
        message: "Invalid user id",
      });
    }

    const currentAdminUserId = getAdminUserId(req);

    if (currentAdminUserId === userId) {
      return res.status(400).json({
        message: "Нельзя удалить самого себя",
      });
    }

    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
      },
      include: {
        role: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        message: "Користувача не знайдено",
      });
    }

    if (user.role.code === "super_admin") {
      return res.status(400).json({
        message: "Супер администратора нельзя удалить через этот раздел",
      });
    }

    await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        isActive: false,
        deletedAt: new Date(),
      },
    });

    return res.json({
      message: "Користувача видалено",
    });
  } catch (error) {
    console.error("deleteAdminUser error:", error);

    return res.status(500).json({
      message: "Внутрішня помилка сервера",
    });
  }
}