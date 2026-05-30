import type { Request, Response } from "express";
import { prisma } from "../../config/prisma";

function parseNumberQuery(value: unknown) {
  if (!value) return undefined;

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return undefined;
  }

  return numberValue;
}

function parseDateQuery(value: unknown) {
  if (!value || typeof value !== "string") {
    return undefined;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date;
}

export async function getAdminActionLogs(req: Request, res: Response) {
  try {
    const page = Math.max(parseNumberQuery(req.query.page) ?? 1, 1);
    const pageSizeRaw = parseNumberQuery(req.query.pageSize) ?? 20;
    const pageSize = Math.min(Math.max(pageSizeRaw, 10), 100);

    const cityId = parseNumberQuery(req.query.cityId);
    const entityId = parseNumberQuery(req.query.entityId);

    const action = req.query.action ? String(req.query.action) : "";
    const entityType = req.query.entityType ? String(req.query.entityType) : "";
    const search = req.query.search ? String(req.query.search).trim() : "";

    const dateFrom = parseDateQuery(req.query.dateFrom);
    const dateTo = parseDateQuery(req.query.dateTo);

    const where: any = {
      ...(cityId ? { cityId } : {}),
      ...(entityId ? { entityId } : {}),
      ...(action ? { action } : {}),
      ...(entityType ? { entityType } : {}),
      ...(dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom ? { gte: dateFrom } : {}),
              ...(dateTo ? { lte: dateTo } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { adminLogin: { contains: search } },
              { adminName: { contains: search } },
              { action: { contains: search } },
              { entityType: { contains: search } },
              { description: { contains: search } },
            ],
          }
        : {}),
    };

    const [total, logs] = await Promise.all([
      prisma.adminActionLog.count({ where }),

      prisma.adminActionLog.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: {
          createdAt: "desc",
        },
      }),
    ]);

    return res.json({
      filters: {
        page,
        pageSize,
        cityId: cityId ?? null,
        entityId: entityId ?? null,
        action,
        entityType,
        search,
        dateFrom: dateFrom ?? null,
        dateTo: dateTo ?? null,
      },
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      data: logs,
    });
  } catch (error) {
    console.error("getAdminActionLogs error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}