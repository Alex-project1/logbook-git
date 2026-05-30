import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { signMobileToken } from "../../utils/jwt";

const mobileLoginSchema = z.object({
  login: z.string().min(1, "Login is required"),
  password: z.string().min(1, "Password is required"),
});

export async function mobileLogin(req: Request, res: Response) {
  try {
    const parsed = mobileLoginSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation error",
        errors: parsed.error.flatten(),
      });
    }

    const { login, password } = parsed.data;

    const mobileUser = await prisma.mobileUser.findUnique({
      where: {
        login,
      },
      include: {
        city: true,
      },
    });

    if (
      !mobileUser ||
      !mobileUser.isActive ||
      mobileUser.deletedAt ||
      !mobileUser.city.isActive ||
      mobileUser.city.deletedAt
    ) {
      return res.status(401).json({
        message: "Invalid login or password",
      });
    }

    const isPasswordValid = await bcrypt.compare(
      password,
      mobileUser.passwordHash
    );

    if (!isPasswordValid) {
      return res.status(401).json({
        message: "Invalid login or password",
      });
    }

    const accessToken = signMobileToken({
      mobileUserId: mobileUser.id,
      login: mobileUser.login,
      cityId: mobileUser.cityId,
    });

    return res.json({
      accessToken,
      user: {
        id: mobileUser.id,
        login: mobileUser.login,
        city: {
          id: mobileUser.city.id,
          name: mobileUser.city.name,
        },
      },
    });
  } catch (error) {
    console.error("mobileLogin error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

export async function mobileBootstrap(req: Request, res: Response) {
  try {
    if (!req.mobileUser) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    const cityId = req.mobileUser.cityId;

    const city = await prisma.city.findFirst({
      where: {
        id: cityId,
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
        message: "City not found",
      });
    }

    const [
      employees,
      vehicles,
      crews,
      tripGoals,
      additionalAlarmReasons,
      streets,
    ] = await Promise.all([
      prisma.employee.findMany({
        where: {
          cityId,
          deletedAt: null,
          isActive: true,
        },
        orderBy: {
          fullName: "asc",
        },
        select: {
          id: true,
          fullName: true,
          position: true,
        },
      }),

      prisma.vehicle.findMany({
        where: {
          cityId,
          deletedAt: null,
          isActive: true,
        },
        orderBy: {
          title: "asc",
        },
        select: {
          id: true,
          title: true,
          licensePlate: true,
        },
      }),

      prisma.crew.findMany({
        where: {
          cityId,
          deletedAt: null,
          isActive: true,
        },
        orderBy: {
          name: "asc",
        },
        select: {
          id: true,
          name: true,
        },
      }),

      prisma.tripGoal.findMany({
        where: {
          deletedAt: null,
          isActive: true,
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
          sortOrder: true,
        },
      }),

      prisma.additionalAlarmReason.findMany({
        where: {
          deletedAt: null,
          isActive: true,
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
          sortOrder: true,
        },
      }),

      prisma.street.findMany({
        where: {
          cityId,
          deletedAt: null,
          isActive: true,
        },
        orderBy: {
          name: "asc",
        },
        select: {
          id: true,
          name: true,
        },
      }),
    ]);

    return res.json({
      city,
      mobileUser: {
        id: req.mobileUser.id,
        login: req.mobileUser.login,
      },
      employees,
      vehicles,
      crews,
      tripGoals,
      additionalAlarmReasons,
      streets,
      settings: {
        offlineEnabled: true,
      },
    });
  } catch (error) {
    console.error("mobileBootstrap error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}