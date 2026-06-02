import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";

const registerDeviceTokenSchema = z.object({
  token: z.string().min(10, "Token is required"),
  platform: z.string().optional(),
  deviceName: z.string().optional(),
});

export async function registerMobileDeviceToken(req: Request, res: Response) {
  try {
    if (!req.mobileUser) {
      return res.status(401).json({
        message: "Не авторизовано",
      });
    }

    const parsed = registerDeviceTokenSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Помилка валідації",
        errors: parsed.error.flatten(),
      });
    }

    const token = parsed.data.token.trim();

    const savedToken = await prisma.mobileDeviceToken.upsert({
      where: {
        token,
      },
      update: {
        mobileUserId: req.mobileUser.id,
        platform: parsed.data.platform?.trim() || null,
        deviceName: parsed.data.deviceName?.trim() || null,
        lastSeenAt: new Date(),
      },
      create: {
        mobileUserId: req.mobileUser.id,
        token,
        platform: parsed.data.platform?.trim() || null,
        deviceName: parsed.data.deviceName?.trim() || null,
        lastSeenAt: new Date(),
      },
    });

    return res.json({
      data: {
        id: savedToken.id,
        platform: savedToken.platform,
        deviceName: savedToken.deviceName,
        lastSeenAt: savedToken.lastSeenAt,
      },
    });
  } catch (error) {
    console.error("registerMobileDeviceToken error:", error);

    return res.status(500).json({
      message: "Внутрішня помилка сервера",
    });
  }
}

export async function deleteMobileDeviceToken(req: Request, res: Response) {
  try {
    if (!req.mobileUser) {
      return res.status(401).json({
        message: "Не авторизовано",
      });
    }

    const token = String(req.body?.token || "").trim();

    if (!token) {
      return res.status(400).json({
        message: "Token is required",
      });
    }

    await prisma.mobileDeviceToken.deleteMany({
      where: {
        token,
        mobileUserId: req.mobileUser.id,
      },
    });

    return res.json({
      success: true,
    });
  } catch (error) {
    console.error("deleteMobileDeviceToken error:", error);

    return res.status(500).json({
      message: "Внутрішня помилка сервера",
    });
  }
}