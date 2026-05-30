import type { Request } from "express";
import { prisma } from "../config/prisma";

function getAdminInfoFromRequest(req: Request) {
  const requestAny = req as any;

  const admin =
    requestAny.admin ||
    requestAny.adminUser ||
    requestAny.user ||
    requestAny.auth ||
    {};

  return {
    adminUserId: Number(admin.id ?? admin.userId ?? admin.adminUserId) || null,
    adminLogin: admin.login ?? null,
    adminName: admin.name ?? null,
  };
}

export async function createAdminActionLog(
  req: Request,
  data: {
    action: string;
    entityType: string;
    entityId?: number | null;
    cityId?: number | null;
    description?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  try {
    const adminInfo = getAdminInfoFromRequest(req);

    await prisma.adminActionLog.create({
      data: {
        adminUserId: adminInfo.adminUserId,
        adminLogin: adminInfo.adminLogin,
        adminName: adminInfo.adminName,

        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId ?? null,
        cityId: data.cityId ?? null,

        description: data.description ?? null,
        metadata: data.metadata ?? {},
      } as any,
    });
  } catch (error) {
    console.error("createAdminActionLog error:", error);
  }
}