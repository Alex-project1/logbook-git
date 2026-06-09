import { DepartmentType } from "@prisma/client";
import { prisma } from "../config/prisma";

export async function getDefaultDepartmentId(cityId: number, type: DepartmentType = DepartmentType.GBR) {
  const existing = await prisma.department.findFirst({
    where: {
      cityId,
      type,
      deletedAt: null,
      isActive: true,
    },
    orderBy: [{ isSystem: "desc" }, { id: "asc" }],
    select: { id: true },
  });

  if (existing) {
    return existing.id;
  }

  const created = await prisma.department.create({
    data: {
      cityId,
      name: type === DepartmentType.GBR ? "ГШР" : type === DepartmentType.POST ? "Пости" : "Інше",
      type,
      isSystem: type === DepartmentType.GBR,
      isActive: true,
    },
    select: { id: true },
  });

  return created.id;
}

export async function validateDepartmentInCity(params: {
  cityId: number;
  departmentId: number;
  requiredType?: DepartmentType;
}) {
  const department = await prisma.department.findFirst({
    where: {
      id: params.departmentId,
      cityId: params.cityId,
      deletedAt: null,
      isActive: true,
      ...(params.requiredType ? { type: params.requiredType } : {}),
    },
  });

  return department;
}
