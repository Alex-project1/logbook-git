import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import {
  buildCityAccessWhere,
  canEditCityData,
  getAllowedCityIds,
} from "../../utils/admin-access";

const createEmployeeSchema = z.object({
  cityId: z.number().int().positive(),
  fullName: z.string().min(1, "Full name is required"),
  position: z.string().optional().nullable(),
  comment: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

const updateEmployeeSchema = z.object({
  cityId: z.number().int().positive().optional(),
  fullName: z.string().min(1, "Full name is required").optional(),
  position: z.string().optional().nullable(),
  comment: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

export async function getEmployees(req: Request, res: Response) {
  try {
    const cityId = req.query.cityId ? Number(req.query.cityId) : undefined;
    const includeInactive = req.query.includeInactive === "true";
    const archive = req.query.archive === "true";

    const allowedCityIds = await getAllowedCityIds(req);

    if (
      allowedCityIds !== null &&
      cityId &&
      !allowedCityIds.includes(cityId)
    ) {
      return res.json({
        data: [],
      });
    }

    const employees = await prisma.employee.findMany({
      where: {
        ...(archive ? { deletedAt: { not: null } } : { deletedAt: null }),
        ...(cityId ? { cityId } : buildCityAccessWhere(allowedCityIds)),
        ...(includeInactive || archive ? {} : { isActive: true }),
      },
      orderBy: {
        fullName: "asc",
      },
      select: {
        id: true,
        cityId: true,
        fullName: true,
        position: true,
        comment: true,
        isActive: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
        city: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return res.json({
      data: employees,
    });
  } catch (error) {
    console.error("getEmployees error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

export async function getEmployeeById(req: Request, res: Response) {
  try {
    const employeeId = Number(req.params.id);

    if (!Number.isInteger(employeeId)) {
      return res.status(400).json({
        message: "Invalid employee id",
      });
    }
    const allowedCityIds = await getAllowedCityIds(req);
    const employee = await prisma.employee.findFirst({
      where: {
        id: employeeId,
        deletedAt: null,
        ...buildCityAccessWhere(allowedCityIds),
      },
      select: {
        id: true,
        cityId: true,
        fullName: true,
        position: true,
        comment: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        city: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!employee) {
      return res.status(404).json({
        message: "Employee not found",
      });
    }

    return res.json({
      data: employee,
    });
  } catch (error) {
    console.error("getEmployeeById error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

export async function createEmployee(req: Request, res: Response) {
  try {
    const parsed = createEmployeeSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation error",
        errors: parsed.error.flatten(),
      });
    }
    const canEdit = await canEditCityData(req, parsed.data.cityId);

    if (!canEdit) {
      return res.status(403).json({
        message: "Недостаточно прав для этого города",
      });
    }
    const city = await prisma.city.findFirst({
      where: {
        id: parsed.data.cityId,
        deletedAt: null,
        isActive: true,
      },
    });

    if (!city) {
      return res.status(404).json({
        message: "City not found or inactive",
      });
    }

    const employee = await prisma.employee.create({
      data: {
        cityId: parsed.data.cityId,
        fullName: parsed.data.fullName,
        position: parsed.data.position ?? null,
        comment: parsed.data.comment ?? null,
        isActive: parsed.data.isActive ?? true,
      },
      select: {
        id: true,
        cityId: true,
        fullName: true,
        position: true,
        comment: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.status(201).json({
      data: employee,
    });
  } catch (error) {
    console.error("createEmployee error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

export async function updateEmployee(req: Request, res: Response) {
  try {
    const employeeId = Number(req.params.id);

    if (!Number.isInteger(employeeId)) {
      return res.status(400).json({
        message: "Invalid employee id",
      });
    }

    const parsed = updateEmployeeSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation error",
        errors: parsed.error.flatten(),
      });
    }

    const employee = await prisma.employee.findFirst({
      where: {
        id: employeeId,
        deletedAt: null,
      },
    });

    if (!employee) {
      return res.status(404).json({
        message: "Employee not found",
      });
    }
    const canEditCurrentCity = await canEditCityData(req, employee.cityId);

    if (!canEditCurrentCity) {
      return res.status(403).json({
        message: "Недостаточно прав для этого города",
      });
    }

    if (parsed.data.cityId) {
      const canEditNewCity = await canEditCityData(req, parsed.data.cityId);

if (!canEditNewCity) {
  return res.status(403).json({
    message: "Недостаточно прав для нового города",
  });
}
      const city = await prisma.city.findFirst({
        where: {
          id: parsed.data.cityId,
          deletedAt: null,
          isActive: true,
        },
      });

      if (!city) {
        return res.status(404).json({
          message: "City not found or inactive",
        });
      }
    }

    const updatedEmployee = await prisma.employee.update({
      where: {
        id: employeeId,
      },
      data: {
        cityId: parsed.data.cityId,
        fullName: parsed.data.fullName,
        position: parsed.data.position,
        comment: parsed.data.comment,
        isActive: parsed.data.isActive,
      },
      select: {
        id: true,
        cityId: true,
        fullName: true,
        position: true,
        comment: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json({
      data: updatedEmployee,
    });
  } catch (error) {
    console.error("updateEmployee error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

export async function deleteEmployee(req: Request, res: Response) {
  try {
    const employeeId = Number(req.params.id);

    if (!Number.isInteger(employeeId)) {
      return res.status(400).json({
        message: "Invalid employee id",
      });
    }

    const employee = await prisma.employee.findFirst({
      where: {
        id: employeeId,
        deletedAt: null,
      },
    });

    if (!employee) {
      return res.status(404).json({
        message: "Employee not found",
      });
    }
    const canEdit = await canEditCityData(req, employee.cityId);

    if (!canEdit) {
      return res.status(403).json({
        message: "Недостаточно прав для этого города",
      });
    }
    await prisma.employee.update({
      where: {
        id: employeeId,
      },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });

    return res.json({
      message: "Employee deleted successfully",
    });
  } catch (error) {
    console.error("deleteEmployee error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

export async function restoreEmployee(req: Request, res: Response) {
  try {
    const employeeId = Number(req.params.id);

    if (!Number.isInteger(employeeId)) {
      return res.status(400).json({
        message: "Invalid employee id",
      });
    }

    const employee = await prisma.employee.findUnique({
      where: {
        id: employeeId,
      },
    });

    if (!employee) {
      return res.status(404).json({
        message: "Employee not found",
      });
    }

    if (!employee.deletedAt) {
      return res.status(400).json({
        message: "Employee is not archived",
      });
    }
    const canEdit = await canEditCityData(req, employee.cityId);

    if (!canEdit) {
      return res.status(403).json({
        message: "Недостаточно прав для этого города",
      });
    }
    const restoredEmployee = await prisma.employee.update({
      where: {
        id: employeeId,
      },
      data: {
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        cityId: true,
        fullName: true,
        position: true,
        comment: true,
        isActive: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json({
      message: "Employee restored successfully",
      data: restoredEmployee,
    });
  } catch (error) {
    console.error("restoreEmployee error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}