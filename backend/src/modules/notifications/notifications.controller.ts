import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import {
  buildCityAccessWhere,
  getAllowedCityIds,
} from "../../utils/admin-access";
import { sendNotificationPush } from "../../services/push.service";
const createNotificationSchema = z.object({
  cityId: z.number().int().positive(),
  mobileUserIds: z.array(z.number().int().positive()).min(1),
  title: z.string().min(1, "Введите заголовок уведомления").max(255),
  message: z.string().min(1, "Введите текст уведомления").max(5000),
});

function parsePositiveNumber(value: unknown) {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    return undefined;
  }

  return numberValue;
}

function parseDate(value: unknown) {
  if (!value) return undefined;

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date;
}

function getRecipientStatus(recipient: {
  readAt: Date | null;
  repliedAt: Date | null;
}) {
  if (recipient.repliedAt) {
    return "REPLIED";
  }

  if (recipient.readAt) {
    return "READ";
  }

  return "SENT";
}

function mapNotificationListItem(notification: any) {
  const recipients = notification.recipients ?? [];

  const readCount = recipients.filter((item: any) => item.readAt).length;
  const repliedCount = recipients.filter((item: any) => item.repliedAt).length;

  return {
    id: notification.id,
    city: notification.city,
    senderUser: notification.senderUser,
    title: notification.title,
    message: notification.message,
    createdAt: notification.createdAt,

    push: {
      enabled: notification.pushEnabled,
      tokensCount: notification.pushTokensCount,
      successCount: notification.pushSuccessCount,
      failureCount: notification.pushFailureCount,
      removedInvalidTokens: notification.pushRemovedInvalidTokens,
      message: notification.pushMessage,
      processedAt: notification.pushProcessedAt,
    },

    recipientsCount: recipients.length,
    readCount,
    repliedCount,

    recipients: recipients.map((recipient: any) => ({
      id: recipient.id,
      mobileUser: recipient.mobileUser,
      sentAt: recipient.sentAt,
      deliveredAt: recipient.deliveredAt,
      readAt: recipient.readAt,
      repliedAt: recipient.repliedAt,
      replyText: recipient.replyText,
      status: getRecipientStatus(recipient),
    })),
  };
}

export async function createNotification(req: Request, res: Response) {
  try {
    const parsed = createNotificationSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation error",
        errors: parsed.error.flatten(),
      });
    }

    const allowedCityIds = await getAllowedCityIds(req);

    if (
      allowedCityIds !== null &&
      !allowedCityIds.includes(parsed.data.cityId)
    ) {
      return res.status(403).json({
        message: "Недостаточно прав для выбранного города",
      });
    }

    const city = await prisma.city.findFirst({
      where: {
        id: parsed.data.cityId,
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!city) {
      return res.status(404).json({
        message: "Город не найден или неактивен",
      });
    }

    const mobileUserIds = Array.from(new Set(parsed.data.mobileUserIds));

    const mobileUsers = await prisma.mobileUser.findMany({
      where: {
        id: {
          in: mobileUserIds,
        },
        cityId: parsed.data.cityId,
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        login: true,
        cityId: true,
      },
    });

    if (mobileUsers.length !== mobileUserIds.length) {
      return res.status(400).json({
        message:
          "Один или несколько пользователей не найдены в выбранном городе или неактивны",
      });
    }

    const notification = await prisma.notification.create({
      data: {
        cityId: parsed.data.cityId,
        senderUserId: req.user?.id ?? null,
        title: parsed.data.title.trim(),
        message: parsed.data.message.trim(),
        recipients: {
          create: mobileUserIds.map((mobileUserId) => ({
            mobileUserId,
          })),
        },
      },
      include: {
        city: {
          select: {
            id: true,
            name: true,
          },
        },
        senderUser: {
          select: {
            id: true,
            name: true,
            login: true,
          },
        },
        recipients: {
          include: {
            mobileUser: {
              select: {
                id: true,
                login: true,
                cityId: true,
                city: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
          orderBy: {
            id: "asc",
          },
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user?.id ?? null,
        action: "CREATE_NOTIFICATION",
        entityType: "notification",
        entityId: notification.id,
        newValue: {
          cityId: parsed.data.cityId,
          recipientsCount: mobileUserIds.length,
          mobileUserIds,
        },
      },
    });
    const deviceTokens = await prisma.mobileDeviceToken.findMany({
      where: {
        mobileUserId: {
          in: mobileUserIds,
        },
      },
      select: {
        mobileUserId: true,
        token: true,
      },
    });

    const pushResult = await sendNotificationPush({
      notificationId: notification.id,
      title: notification.title,
      message: notification.message,
      tokens: deviceTokens,
    });
    const notificationWithPushStats = await prisma.notification.update({
      where: {
        id: notification.id,
      },
      data: {
        pushEnabled: pushResult.enabled,
        pushTokensCount: pushResult.tokensCount,
        pushSuccessCount: pushResult.successCount,
        pushFailureCount: pushResult.failureCount,
        pushRemovedInvalidTokens: pushResult.removedInvalidTokens,
        pushMessage: pushResult.message,
        pushProcessedAt: new Date(),
      },
      include: {
        city: {
          select: {
            id: true,
            name: true,
          },
        },
        senderUser: {
          select: {
            id: true,
            name: true,
            login: true,
          },
        },
        recipients: {
          include: {
            mobileUser: {
              select: {
                id: true,
                login: true,
                cityId: true,
                city: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
          orderBy: {
            id: "asc",
          },
        },
      },
    });
    return res.status(201).json({
      data: mapNotificationListItem(notificationWithPushStats),
      push: pushResult,
    });
  } catch (error) {
    console.error("createNotification error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

export async function getNotifications(req: Request, res: Response) {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const pageSize = Math.min(
      Math.max(Number(req.query.pageSize || 20), 1),
      100,
    );

    const cityId = parsePositiveNumber(req.query.cityId);
    const mobileUserId = parsePositiveNumber(req.query.mobileUserId);
    const dateFrom = parseDate(req.query.dateFrom);
    const dateTo = parseDate(req.query.dateTo);

    const allowedCityIds = await getAllowedCityIds(req);

    if (allowedCityIds !== null && cityId && !allowedCityIds.includes(cityId)) {
      return res.status(403).json({
        message: "Недостаточно прав для выбранного города",
      });
    }

    const where = {
      deletedAt: null,
      ...(cityId ? { cityId } : buildCityAccessWhere(allowedCityIds)),
      ...(dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom ? { gte: dateFrom } : {}),
              ...(dateTo ? { lte: dateTo } : {}),
            },
          }
        : {}),
      ...(mobileUserId
        ? {
            recipients: {
              some: {
                mobileUserId,
              },
            },
          }
        : {}),
    };

    const [total, notifications] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: {
          createdAt: "desc",
        },
        include: {
          city: {
            select: {
              id: true,
              name: true,
            },
          },
          senderUser: {
            select: {
              id: true,
              name: true,
              login: true,
            },
          },
          recipients: {
            include: {
              mobileUser: {
                select: {
                  id: true,
                  login: true,
                  cityId: true,
                  city: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
            orderBy: {
              id: "asc",
            },
          },
        },
      }),
    ]);

    return res.json({
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(Math.ceil(total / pageSize), 1),
      },
      data: notifications.map(mapNotificationListItem),
    });
  } catch (error) {
    console.error("getNotifications error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

export async function getNotificationById(req: Request, res: Response) {
  try {
    const notificationId = Number(req.params.id);

    if (!Number.isInteger(notificationId) || notificationId <= 0) {
      return res.status(400).json({
        message: "Invalid notification id",
      });
    }

    const allowedCityIds = await getAllowedCityIds(req);

    const notification = await prisma.notification.findFirst({
      where: {
        id: notificationId,
        deletedAt: null,
        ...buildCityAccessWhere(allowedCityIds),
      },
      include: {
        city: {
          select: {
            id: true,
            name: true,
          },
        },
        senderUser: {
          select: {
            id: true,
            name: true,
            login: true,
          },
        },
        recipients: {
          include: {
            mobileUser: {
              select: {
                id: true,
                login: true,
                cityId: true,
                city: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
          orderBy: {
            id: "asc",
          },
        },
      },
    });

    if (!notification) {
      return res.status(404).json({
        message: "Уведомление не найдено",
      });
    }

    return res.json({
      data: mapNotificationListItem(notification),
    });
  } catch (error) {
    console.error("getNotificationById error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}
