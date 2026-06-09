import { http } from "./http";

export type Vehicle = {
  id: number;
  cityId: number;
  departmentId: number;
  title: string;
  licensePlate: string | null;
  startOdometer: number | null;
  comment: string | null;
  isActive: boolean;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  city?: { id: number; name: string };
  department?: { id: number; name: string; type: "GBR" | "POST" | "OTHER" };
};

export async function getVehicles(
  paramsOrCityId?: { cityId?: number; departmentId?: number; archive?: boolean; includeInactive?: boolean } | number,
  legacyArchive = false,
): Promise<Vehicle[]> {
  const params = typeof paramsOrCityId === "number" ? { cityId: paramsOrCityId || undefined, archive: legacyArchive, includeInactive: true } : paramsOrCityId;
  const response = await http.get<{ data: Vehicle[] }>("/api/admin/vehicles", {
    params: {
      includeInactive: params?.includeInactive ?? true,
      archive: params?.archive ?? false,
      ...(params?.cityId ? { cityId: params.cityId } : {}),
      ...(params?.departmentId ? { departmentId: params.departmentId } : {}),
    },
  });

  return response.data.data;
}

export async function createVehicle(data: {
  cityId: number;
  departmentId: number;
  title: string;
  licensePlate?: string | null;
  startOdometer?: number | null;
  comment?: string | null;
  isActive?: boolean;
}): Promise<Vehicle> {
  const response = await http.post<{ data: Vehicle }>("/api/admin/vehicles", data);
  return response.data.data;
}

export async function updateVehicle(
  id: number,
  data: {
    cityId?: number;
    departmentId?: number;
    title?: string;
    licensePlate?: string | null;
    startOdometer?: number | null;
    comment?: string | null;
    isActive?: boolean;
  },
): Promise<Vehicle> {
  const response = await http.put<{ data: Vehicle }>(`/api/admin/vehicles/${id}`, data);
  return response.data.data;
}

export async function restoreVehicle(id: number): Promise<Vehicle> {
  const response = await http.patch<{ data: Vehicle }>(`/api/admin/vehicles/${id}/restore`);
  return response.data.data;
}

export async function deleteVehicle(id: number): Promise<void> {
  await http.delete(`/api/admin/vehicles/${id}`);
}
