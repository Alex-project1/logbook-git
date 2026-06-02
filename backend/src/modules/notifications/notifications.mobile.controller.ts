import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";

const replyNotificationSchema = z.object({
  replyText: z.string().min(1, "Введіть текст відповіді").max(5000),
});

function getRecipientStatus(recipient: {
  deliveredAt: Date | null;
  readAt: Date | null;
  repliedAt: Date | null;
}) {
  if (recipient.repliedAt) {
    return "REPLIED";
  }

  if (recipient.readAt) {
    return "READ";
  }

  if (recipient.deliveredAt) {
    return "DELIVERED";
  }

  return "SENT";
}

function mapMobileNotification(recipient: any) {
  return {
    id: recipient.notification.id,
    recipientId: recipient.id,

    title: recipient.notification.title,
    message: recipient.notification.message,

    city: recipient.notification.city,
    senderUser: recipient.notification.senderUser,

    createdAt: recipient.notification.createdAt,
    sentAt: recipient.sentAt,
    deliveredAt: recipient.deliveredAt,
    readAt: recipient.readAt,
    repliedAt: recipient.repliedAt,
    replyText: recipient.replyText,

    status: getRecipientStatus(recipient),
  };
}

export async function getMobileNotifications(req: Request, res: Response) {
  try {
    if (!req.mobileUser) {
      return res.status(401).json({
        message: "Не авторизовано",
      });
    }

    const page = Math.max(Number(req.query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize || 20), 1), 100);

    const where = {
      mobileUserId: req.mobileUser.id,
      notification: {
        deletedAt: null,
      },
    };

    await prisma.notificationRecipient.updateMany({
      where: {
        mobileUserId: req.mobileUser.id,
        deliveredAt: null,
        notification: {
          deletedAt: null,
        },
      },
      data: {
        deliveredAt: new Date(),
      },
    });

    const [total, recipients] = await Promise.all([
      prisma.notificationRecipient.count({ where }),
      prisma.notificationRecipient.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: {
          sentAt: "desc",
        },
        include: {
          notification: {
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
      data: recipients.map(mapMobileNotification),
    });
  } catch (error) {
    console.error("getMobileNotifications error:", error);

    return res.status(500).json({
      message: "Внутрішня помилка сервера",
    });
  }
}

export async function getMobileNotificationById(req: Request, res: Response) {
  try {
    if (!req.mobileUser) {
      return res.status(401).json({
        message: "Не авторизовано",
      });
    }

    const notificationId = Number(req.params.id);

    if (!Number.isInteger(notificationId) || notificationId <= 0) {
      return res.status(400).json({
        message: "Некоректний ID повідомлення",
      });
    }

    const recipient = await prisma.notificationRecipient.findFirst({
      where: {
        mobileUserId: req.mobileUser.id,
        notificationId,
        notification: {
          deletedAt: null,
        },
      },
      include: {
        notification: {
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
          },
        },
      },
    });

    if (!recipient) {
      return res.status(404).json({
        message: "Повідомлення не знайдено",
      });
    }

    const updatedRecipient = recipient.deliveredAt
      ? recipient
      : await prisma.notificationRecipient.update({
        where: {
          id: recipient.id,
        },
        data: {
          deliveredAt: new Date(),
        },
        include: {
          notification: {
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
            },
          },
        },
      });

    return res.json({
      data: mapMobileNotification(updatedRecipient),
    });
  } catch (error) {
    console.error("getMobileNotificationById error:", error);

    return res.status(500).json({
      message: "Внутрішня помилка сервера",
    });
  }
}

export async function markMobileNotificationAsRead(req: Request, res: Response) {
  try {
    if (!req.mobileUser) {
      return res.status(401).json({
        message: "Не авторизовано",
      });
    }

    const notificationId = Number(req.params.id);

    if (!Number.isInteger(notificationId) || notificationId <= 0) {
      return res.status(400).json({
        message: "Некоректний ID повідомлення",
      });
    }

    const recipient = await prisma.notificationRecipient.findFirst({
      where: {
        mobileUserId: req.mobileUser.id,
        notificationId,
        notification: {
          deletedAt: null,
        },
      },
      select: {
        id: true,
        readAt: true,
      },
    });

    if (!recipient) {
      return res.status(404).json({
        message: "Повідомлення не знайдено",
      });
    }

    const now = new Date();

    const updatedRecipient = await prisma.notificationRecipient.update({
      where: {
        id: recipient.id,
      },
      data: {
        deliveredAt: now,
        readAt: recipient.readAt ?? now,
      },
      include: {
        notification: {
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
          },
        },
      },
    });

    return res.json({
      data: mapMobileNotification(updatedRecipient),
    });
  } catch (error) {
    console.error("markMobileNotificationAsRead error:", error);

    return res.status(500).json({
      message: "Внутрішня помилка сервера",
    });
  }
}

export async function replyMobileNotification(req: Request, res: Response) {
  try {
    if (!req.mobileUser) {
      return res.status(401).json({
        message: "Не авторизовано",
      });
    }

    const notificationId = Number(req.params.id);

    if (!Number.isInteger(notificationId) || notificationId <= 0) {
      return res.status(400).json({
        message: "Некоректний ID повідомлення",
      });
    }

    const parsed = replyNotificationSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Помилка валідації",
        errors: parsed.error.flatten(),
      });
    }

    const recipient = await prisma.notificationRecipient.findFirst({
      where: {
        mobileUserId: req.mobileUser.id,
        notificationId,
        notification: {
          deletedAt: null,
        },
      },
      select: {
        id: true,
        readAt: true,
        repliedAt: true,
      },
    });

    if (!recipient) {
      return res.status(404).json({
        message: "Повідомлення не знайдено",
      });
    }

    if (recipient.repliedAt) {
      return res.status(400).json({
        message: "Відповідь на це повідомлення вже надіслана",
      });
    }

    const now = new Date();

    const updatedRecipient = await prisma.notificationRecipient.update({
      where: {
        id: recipient.id,
      },
      data: {
        deliveredAt: now,
        readAt: recipient.readAt ?? now,
        repliedAt: now,
        replyText: parsed.data.replyText.trim(),
      },
      include: {
        notification: {
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
          },
        },
      },
    });

    return res.json({
      data: mapMobileNotification(updatedRecipient),
    });
  } catch (error) {
    console.error("replyMobileNotification error:", error);

    return res.status(500).json({
      message: "Внутрішня помилка сервера",
    });
  }
}

export async function getMobileUnreadNotificationsCount(
  req: Request,
  res: Response
) {
  try {
    if (!req.mobileUser) {
      return res.status(401).json({
        message: "Не авторизовано",
      });
    }

    const unreadCount = await prisma.notificationRecipient.count({
      where: {
        mobileUserId: req.mobileUser.id,
        readAt: null,
        notification: {
          deletedAt: null,
        },
      },
    });

    return res.json({
      data: {
        unreadCount,
      },
    });
  } catch (error) {
    console.error("getMobileUnreadNotificationsCount error:", error);

    return res.status(500).json({
      message: "Внутрішня помилка сервера",
    });
  }
}