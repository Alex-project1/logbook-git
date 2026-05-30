import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { signAdminToken } from "../../utils/jwt";

const loginSchema = z.object({
  login: z.string().min(1, "Login is required"),
  password: z.string().min(1, "Password is required"),
});

export async function adminLogin(req: Request, res: Response) {
  try {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation error",
        errors: parsed.error.flatten(),
      });
    }

    const { login, password } = parsed.data;

    const user = await prisma.user.findUnique({
      where: {
        login,
      },
      include: {
        role: true,
      },
    });

    if (!user || !user.isActive || user.deletedAt) {
      return res.status(401).json({
        message: "Invalid login or password",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      return res.status(401).json({
        message: "Invalid login or password",
      });
    }

    const accessToken = signAdminToken({
      userId: user.id,
      login: user.login,
      roleCode: user.role.code,
    });

    return res.json({
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        login: user.login,
        email: user.email,
        role: {
          code: user.role.code,
          name: user.role.name,
        },
      },
    });
  } catch (error) {
    console.error("adminLogin error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

export async function adminMe(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    const user = await prisma.user.findUnique({
      where: {
        id: req.user.id,
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

    return res.json({
      user: {
        id: user.id,
        name: user.name,
        login: user.login,
        email: user.email,
        role: {
          code: user.role.code,
          name: user.role.name,
        },
      },
    });
  } catch (error) {
    console.error("adminMe error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}