import { http } from "./http";

export type Employee = {
  id: number;
  cityId: number;
  fullName: string;
  position: string | null;
  comment: string | null;
  isActive: boolean;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  city?: {
    id: number;
    name: string;
  };
};

export async function getEmployees(
  cityId?: number,
  archive = false
): Promise<Employee[]> {
  const response = await http.get<{ data: Employee[] }>("/api/admin/employees", {
    params: {
      includeInactive: true,
      archive,
      ...(cityId ? { cityId } : {}),
    },
  });

  return response.data.data;
}

export async function createEmployee(data: {
  cityId: number;
  fullName: string;
  position?: string | null;
  comment?: string | null;
  isActive?: boolean;
}): Promise<Employee> {
  const response = await http.post<{ data: Employee }>(
    "/api/admin/employees",
    data
  );

  return response.data.data;
}

export async function updateEmployee(
  id: number,
  data: {
    cityId?: number;
    fullName?: string;
    position?: string | null;
    comment?: string | null;
    isActive?: boolean;
  }
): Promise<Employee> {
  const response = await http.put<{ data: Employee }>(
    `/api/admin/employees/${id}`,
    data
  );

  return response.data.data;
}

export async function restoreEmployee(id: number): Promise<Employee> {
  const response = await http.patch<{ data: Employee }>(
    `/api/admin/employees/${id}/restore`
  );

  return response.data.data;
}

export async function deleteEmployee(id: number): Promise<void> {
  await http.delete(`/api/admin/employees/${id}`);
}