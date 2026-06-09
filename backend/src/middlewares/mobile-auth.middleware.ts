import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prisma";
import { verifyMobileToken } from "../utils/jwt";

export async function requireMobileAuth(
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

    const payload = verifyMobileToken(token);

    const mobileUser = await prisma.mobileUser.findUnique({
      where: {
        id: payload.mobileUserId,
      },
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
      return res.status(401).json({
        message: "Mobile user is not active",
      });
    }

    req.mobileUser = {
      id: mobileUser.id,
      login: mobileUser.login,
      cityId: mobileUser.cityId,
      departmentId: mobileUser.departmentId,
      userKind: mobileUser.userKind,
      crewId: mobileUser.crewId,
      dutyPostId: mobileUser.dutyPostId,
      displayName:
        mobileUser.displayName ||
        mobileUser.crew?.name ||
        mobileUser.dutyPost?.name ||
        mobileUser.login,
      departmentType: mobileUser.department.type,
    };

    next();
  } catch (error) {
    return res.status(401).json({
      message: "Invalid or expired token",
    });
  }
}
