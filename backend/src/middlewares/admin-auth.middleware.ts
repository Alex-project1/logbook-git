import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prisma";
import { verifyAdminToken } from "../utils/jwt";

export async function requireAdminAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        message: "Authorization header is required",
      });
    }

    const [type, token] = authHeader.split(" ");

    if (type !== "Bearer" || !token) {
      return res.status(401).json({
        message: "Invalid authorization format",
      });
    }

    const payload = verifyAdminToken(token);

    const user = await prisma.user.findUnique({
      where: {
        id: payload.userId,
      },
      include: {
        role: true,
      },
    });

    if (!user || !user.isActive || user.deletedAt) {
      return res.status(401).json({
        message: "User is not active",
      });
    }

    req.user = {
      id: user.id,
      login: user.login,
      name: user.name,
      roleCode: user.role.code,
    };

    next();
  } catch (error) {
    return res.status(401).json({
      message: "Invalid or expired token",
    });
  }
}