import type { Request } from "express";
import { AdminAccessLevel } from "@prisma/client";
import { prisma } from "../config/prisma";

export type AdminRoleCode = "super_admin" | "admin" | "viewer";

export function getAuthAdmin(req: Request) {
  const requestAny = req as any;

  return (
    requestAny.admin ||
    requestAny.adminUser ||
    requestAny.user ||
    requestAny.auth ||
    null
  );
}

export function getAdminUserId(req: Request) {
  const admin = getAuthAdmin(req);

  return Number(admin?.id ?? admin?.userId ?? admin?.adminUserId) || null;
}

export function getAdminRoleCode(req: Request): AdminRoleCode | null {
  const admin = getAuthAdmin(req);

  return admin?.roleCode || admin?.role?.code || null;
}

export function isSuperAdmin(req: Request) {
  return getAdminRoleCode(req) === "super_admin";
}

export function isAdmin(req: Request) {
  return getAdminRoleCode(req) === "admin";
}

export function isViewer(req: Request) {
  return getAdminRoleCode(req) === "viewer";
}

export function canManageGlobalSettings(req: Request) {
  return isSuperAdmin(req);
}

export function canManageUsers(req: Request) {
  return isSuperAdmin(req);
}

export function canSeeActionLogs(req: Request) {
  return isSuperAdmin(req) || isAdmin(req);
}

export async function getAllowedCityIds(req: Request) {
  if (isSuperAdmin(req)) {
    return null;
  }

  const userId = getAdminUserId(req);

  if (!userId) {
    return [];
  }

  const rows = await prisma.adminCityAccess.findMany({
    where: {
      userId,
    },
    select: {
      cityId: true,
    },
  });

  return rows.map((row) => row.cityId);
}

export async function getCityAccess(req: Request, cityId: number) {
  if (isSuperAdmin(req)) {
    return {
      accessLevel: AdminAccessLevel.FULL,
      canAddShift: true,
      canDeleteShift: true,
    };
  }

  const userId = getAdminUserId(req);

  if (!userId || !cityId) {
    return null;
  }

  return prisma.adminCityAccess.findFirst({
    where: {
      userId,
      cityId,
    },
    select: {
      accessLevel: true,
      canAddShift: true,
      canDeleteShift: true,
    },
  });
}

export async function canViewCity(req: Request, cityId: number) {
  if (isSuperAdmin(req)) {
    return true;
  }

  const access = await getCityAccess(req, cityId);

  return Boolean(access);
}

export async function canEditCityData(req: Request, cityId: number) {
  if (isSuperAdmin(req)) {
    return true;
  }

  if (!isAdmin(req)) {
    return false;
  }

  const access = await getCityAccess(req, cityId);

  const accessLevel = String(access?.accessLevel ?? "");

  return accessLevel === "EDIT" || accessLevel === "FULL";
}

export async function canAddShiftInCity(req: Request, cityId: number) {
  if (isSuperAdmin(req)) {
    return true;
  }

  if (!isAdmin(req)) {
    return false;
  }

  const access = await getCityAccess(req, cityId);

  return Boolean(access?.canAddShift);
}

export async function canDeleteShiftInCity(req: Request, cityId: number) {
  if (isSuperAdmin(req)) {
    return true;
  }

  if (!isAdmin(req)) {
    return false;
  }

  const access = await getCityAccess(req, cityId);

  return Boolean(access?.canDeleteShift);
}
export function buildCityAccessWhere(allowedCityIds: number[] | null) {
  if (allowedCityIds === null) {
    return {};
  }

  return {
    cityId: {
      in: allowedCityIds,
    },
  };
}
export async function getAllowedDepartmentIds(req: Request) {
  if (isSuperAdmin(req)) {
    return null;
  }

  const userId = getAdminUserId(req);

  if (!userId) {
    return [];
  }

  const rows = await prisma.adminDepartmentAccess.findMany({
    where: { userId },
    select: { departmentId: true },
  });

  return rows.map((row) => row.departmentId);
}

export async function getDepartmentAccess(req: Request, departmentId: number) {
  if (isSuperAdmin(req)) {
    return {
      accessLevel: AdminAccessLevel.FULL,
      canAddShift: true,
      canDeleteShift: true,
    };
  }

  const userId = getAdminUserId(req);

  if (!userId || !departmentId) {
    return null;
  }

  const departmentAccess = await prisma.adminDepartmentAccess.findFirst({
    where: { userId, departmentId },
    select: {
      accessLevel: true,
      canAddShift: true,
      canDeleteShift: true,
    },
  });

  if (departmentAccess) {
    return departmentAccess;
  }

  const department = await prisma.department.findFirst({
    where: {
      id: departmentId,
      deletedAt: null,
    },
    select: {
      cityId: true,
    },
  });

  if (!department) {
    return null;
  }

  return getCityAccess(req, department.cityId);
}

export async function canViewDepartment(req: Request, departmentId: number) {
  if (isSuperAdmin(req)) {
    return true;
  }

  return Boolean(await getDepartmentAccess(req, departmentId));
}

export async function canEditDepartmentData(req: Request, departmentId: number) {
  if (isSuperAdmin(req)) {
    return true;
  }

  if (!isAdmin(req)) {
    return false;
  }

  const access = await getDepartmentAccess(req, departmentId);
  const accessLevel = String(access?.accessLevel ?? "");

  return accessLevel === "EDIT" || accessLevel === "FULL";
}

export function buildDepartmentAccessWhere(allowedDepartmentIds: number[] | null) {
  if (allowedDepartmentIds === null || allowedDepartmentIds.length === 0) {
    return {};
  }

  return {
    departmentId: {
      in: allowedDepartmentIds,
    },
  };
}

export function buildDepartmentEntityAccessWhere(allowedDepartmentIds: number[] | null) {
  if (allowedDepartmentIds === null || allowedDepartmentIds.length === 0) {
    return {};
  }

  return {
    id: {
      in: allowedDepartmentIds,
    },
  };
}
