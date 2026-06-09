import { http } from "./http";

export type Employee = {
  id: number;
  cityId: number;
  departmentId: number;
  fullName: string;
  position: string | null;
  comment: string | null;
  isActive: boolean;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  city?: { id: number; name: string };
  department?: { id: number; name: string; type: "GBR" | "POST" | "OTHER" };
};

export async function getEmployees(
  paramsOrCityId?: { cityId?: number; departmentId?: number; archive?: boolean; includeInactive?: boolean } | number,
  legacyArchive = false,
): Promise<Employee[]> {
  const params = typeof paramsOrCityId === "number" ? { cityId: paramsOrCityId || undefined, archive: legacyArchive, includeInactive: true } : paramsOrCityId;
  const response = await http.get<{ data: Employee[] }>("/api/admin/employees", {
    params: {
      includeInactive: params?.includeInactive ?? true,
      archive: params?.archive ?? false,
      ...(params?.cityId ? { cityId: params.cityId } : {}),
      ...(params?.departmentId ? { departmentId: params.departmentId } : {}),
    },
  });

  return response.data.data;
}

export async function createEmployee(data: {
  cityId: number;
  departmentId: number;
  fullName: string;
  position?: string | null;
  comment?: string | null;
  isActive?: boolean;
}): Promise<Employee> {
  const response = await http.post<{ data: Employee }>("/api/admin/employees", data);
  return response.data.data;
}

export async function updateEmployee(
  id: number,
  data: {
    cityId?: number;
    departmentId?: number;
    fullName?: string;
    position?: string | null;
    comment?: string | null;
    isActive?: boolean;
  },
): Promise<Employee> {
  const response = await http.put<{ data: Employee }>(`/api/admin/employees/${id}`, data);
  return response.data.data;
}

export async function restoreEmployee(id: number): Promise<Employee> {
  const response = await http.patch<{ data: Employee }>(`/api/admin/employees/${id}/restore`);
  return response.data.data;
}

export async function deleteEmployee(id: number): Promise<void> {
  await http.delete(`/api/admin/employees/${id}`);
}
