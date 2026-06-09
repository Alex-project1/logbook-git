import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import { DepartmentType, MobileUserKind } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { signMobileToken } from "../../utils/jwt";

const mobileLoginSchema = z.object({
  login: z.string().min(1, "Login is required"),
  password: z.string().min(1, "Password is required"),
});

function buildMobileUserContext(mobileUser: any) {
  return {
    id: mobileUser.id,
    login: mobileUser.login,
    userKind: mobileUser.userKind,
    cityId: mobileUser.cityId,
    departmentId: mobileUser.departmentId,
    crewId: mobileUser.crewId,
    dutyPostId: mobileUser.dutyPostId,
    displayName:
      mobileUser.displayName ||
      mobileUser.crew?.name ||
      mobileUser.dutyPost?.name ||
      mobileUser.login,
    city: {
      id: mobileUser.city.id,
      name: mobileUser.city.name,
    },
    department: {
      id: mobileUser.department.id,
      name: mobileUser.department.name,
      type: mobileUser.department.type,
    },
    crew: mobileUser.crew
      ? {
          id: mobileUser.crew.id,
          name: mobileUser.crew.name,
        }
      : null,
    dutyPost: mobileUser.dutyPost
      ? {
          id: mobileUser.dutyPost.id,
          name: mobileUser.dutyPost.name,
        }
      : null,
  };
}

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
      where: { login },
      include: {
        city: true,
        department: true,
        crew: true,
        dutyPost: true,
      },
    });

    if (
      !mobileUser ||
      !mobileUser.isActive ||
      mobileUser.deletedAt ||
      !mobileUser.city.isActive ||
      mobileUser.city.deletedAt ||
      !mobileUser.department.isActive ||
      mobileUser.department.deletedAt
    ) {
      return res.status(401).json({ message: "Invalid login or password" });
    }

    if (mobileUser.userKind === MobileUserKind.CREW) {
      if (!mobileUser.crew || !mobileUser.crew.isActive || mobileUser.crew.deletedAt) {
        return res.status(401).json({ message: "Invalid login or password" });
      }
    }

    if (mobileUser.userKind === MobileUserKind.POST) {
      if (!mobileUser.dutyPost || !mobileUser.dutyPost.isActive || mobileUser.dutyPost.deletedAt) {
        return res.status(401).json({ message: "Invalid login or password" });
      }
    }

    const isPasswordValid = await bcrypt.compare(password, mobileUser.passwordHash);

    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid login or password" });
    }

    const accessToken = signMobileToken({
      mobileUserId: mobileUser.id,
      login: mobileUser.login,
      cityId: mobileUser.cityId,
      departmentId: mobileUser.departmentId,
      userKind: mobileUser.userKind,
      crewId: mobileUser.crewId,
      dutyPostId: mobileUser.dutyPostId,
    });

    return res.json({
      accessToken,
      user: buildMobileUserContext(mobileUser),
    });
  } catch (error) {
    console.error("mobileLogin error:", error);

    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function mobileBootstrap(req: Request, res: Response) {
  try {
    if (!req.mobileUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const cityId = req.mobileUser.cityId;
    const departmentId = req.mobileUser.departmentId;
    const userKind = req.mobileUser.userKind;

    const mobileUser = await prisma.mobileUser.findUnique({
      where: { id: req.mobileUser.id },
      include: {
        city: { select: { id: true, name: true, isActive: true, deletedAt: true } },
        department: { select: { id: true, name: true, type: true, isActive: true, deletedAt: true } },
        crew: { select: { id: true, name: true } },
        dutyPost: { select: { id: true, name: true } },
      },
    });

    if (!mobileUser || !mobileUser.city.isActive || mobileUser.city.deletedAt) {
      return res.status(404).json({ message: "City not found" });
    }

    const city = { id: mobileUser.city.id, name: mobileUser.city.name };

    const [
      employees,
      vehicles,
      crews,
      dutyPosts,
      tripGoals,
      additionalAlarmReasons,
      streets,
      unreadNotificationsCount,
    ] = await Promise.all([
      prisma.employee.findMany({
        where: { cityId, departmentId, deletedAt: null, isActive: true },
        orderBy: { fullName: "asc" },
        select: { id: true, fullName: true, position: true },
      }),

      prisma.vehicle.findMany({
        where: { cityId, departmentId, deletedAt: null, isActive: true },
        orderBy: { title: "asc" },
        select: { id: true, title: true, licensePlate: true },
      }),

      userKind === MobileUserKind.CREW
        ? prisma.crew.findMany({
            where: {
              cityId,
              departmentId,
              id: req.mobileUser.crewId ?? undefined,
              deletedAt: null,
              isActive: true,
            },
            orderBy: { name: "asc" },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),

      userKind === MobileUserKind.POST
        ? prisma.dutyPost.findMany({
            where: {
              cityId,
              departmentId,
              id: req.mobileUser.dutyPostId ?? undefined,
              deletedAt: null,
              isActive: true,
            },
            orderBy: { name: "asc" },
            select: { id: true, name: true, comment: true },
          })
        : Promise.resolve([]),

      prisma.tripGoal.findMany({
        where: { deletedAt: null, isActive: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true, systemCode: true, isSystem: true, sortOrder: true },
      }),

      prisma.additionalAlarmReason.findMany({
        where: { deletedAt: null, isActive: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true, isSystem: true, sortOrder: true },
      }),

      prisma.street.findMany({
        where: { cityId, deletedAt: null, isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),

      prisma.notificationRecipient.count({
        where: {
          mobileUserId: req.mobileUser.id,
          readAt: null,
          notification: { deletedAt: null },
        },
      }),
    ]);

    return res.json({
      city,
      mobileUser: buildMobileUserContext(mobileUser),
      permissions: {
        canUseObjects: mobileUser.department.type === DepartmentType.GBR && userKind === MobileUserKind.CREW,
      },
      employees,
      vehicles,
      crews,
      dutyPosts,
      tripGoals,
      additionalAlarmReasons,
      streets,
      settings: { offlineEnabled: true },
      notifications: { unreadCount: unreadNotificationsCount },
    });
  } catch (error) {
    console.error("mobileBootstrap error:", error);

    return res.status(500).json({ message: "Internal server error" });
  }
}
