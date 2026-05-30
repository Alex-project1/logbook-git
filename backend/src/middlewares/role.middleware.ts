import { NextFunction, Request, Response } from "express";

export function requireSuperAdmin(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!req.user) {
    return res.status(401).json({
      message: "Unauthorized",
    });
  }

  if (req.user.roleCode !== "super_admin") {
    return res.status(403).json({
      message: "Only super admin can perform this action",
    });
  }

  next();
}