import { http } from "./http";

export type DepartmentType = "GBR" | "POST" | "OTHER";

export type Department = {
  id: number;
  cityId: number;
  name: string;
  type: DepartmentType;
  isSystem: boolean;
  isActive: boolean;
  comment: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  city?: {
    id: number;
    name: string;
  };
};

export async function getDepartments(params?: {
  cityId?: number;
  type?: DepartmentType;
  archive?: boolean;
  includeInactive?: boolean;
}): Promise<Department[]> {
  const response = await http.get<{ data: Department[] }>("/api/admin/departments", {
    params: {
      includeInactive: params?.includeInactive ?? true,
      archive: params?.archive ?? false,
      ...(params?.cityId ? { cityId: params.cityId } : {}),
      ...(params?.type ? { type: params.type } : {}),
    },
  });

  return response.data.data;
}

export async function createDepartment(data: {
  cityId: number;
  name: string;
  type: DepartmentType;
  comment?: string | null;
  isActive?: boolean;
}): Promise<Department> {
  const response = await http.post<{ data: Department }>("/api/admin/departments", data);
  return response.data.data;
}

export async function updateDepartment(
  id: number,
  data: {
    cityId?: number;
    name?: string;
    type?: DepartmentType;
    comment?: string | null;
    isActive?: boolean;
  },
): Promise<Department> {
  const response = await http.put<{ data: Department }>(`/api/admin/departments/${id}`, data);
  return response.data.data;
}

export async function archiveDepartment(id: number): Promise<void> {
  await http.delete(`/api/admin/departments/${id}`);
}

export async function restoreDepartment(id: number): Promise<Department> {
  const response = await http.patch<{ data: Department }>(`/api/admin/departments/${id}/restore`);
  return response.data.data;
}
