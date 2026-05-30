import { http } from "./http";

export type Vehicle = {
  id: number;
  cityId: number;
  title: string;
  licensePlate: string | null;
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

export async function getVehicles(
  cityId?: number,
  archive = false
): Promise<Vehicle[]> {
  const response = await http.get<{ data: Vehicle[] }>("/api/admin/vehicles", {
    params: {
      includeInactive: true,
      archive,
      ...(cityId ? { cityId } : {}),
    },
  });

  return response.data.data;
}

export async function createVehicle(data: {
  cityId: number;
  title: string;
  licensePlate?: string | null;
  isActive?: boolean;
}): Promise<Vehicle> {
  const response = await http.post<{ data: Vehicle }>(
    "/api/admin/vehicles",
    data
  );

  return response.data.data;
}

export async function updateVehicle(
  id: number,
  data: {
    cityId?: number;
    title?: string;
    licensePlate?: string | null;
    isActive?: boolean;
  }
): Promise<Vehicle> {
  const response = await http.put<{ data: Vehicle }>(
    `/api/admin/vehicles/${id}`,
    data
  );

  return response.data.data;
}

export async function restoreVehicle(id: number): Promise<Vehicle> {
  const response = await http.patch<{ data: Vehicle }>(
    `/api/admin/vehicles/${id}/restore`
  );

  return response.data.data;
}

export async function deleteVehicle(id: number): Promise<void> {
  await http.delete(`/api/admin/vehicles/${id}`);
}