import { http } from "./http";
import type { City } from "./cities.api";

export type Street = {
  id: number;
  cityId: number;
  name: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  city?: Pick<City, "id" | "name">;
};

export type BulkImportStreetsResult = {
  parsed: number;
  created: number;
  skipped: number;
  total: number;
};

export async function getStreets(params?: {
  cityId?: number;
  includeInactive?: boolean;
}) {
  const response = await http.get<{ data: Street[] }>("/api/admin/streets", {
    params,
  });

  return response.data.data;
}

export async function createStreet(payload: {
  cityId: number;
  name: string;
  isActive?: boolean;
}) {
  const response = await http.post<{ data: Street }>("/api/admin/streets", payload);

  return response.data.data;
}

export async function updateStreet(
  id: number,
  payload: { cityId?: number; name?: string; isActive?: boolean },
) {
  const response = await http.put<{ data: Street }>(`/api/admin/streets/${id}`, payload);

  return response.data.data;
}

export async function deleteStreet(id: number) {
  await http.delete(`/api/admin/streets/${id}`);
}

export async function bulkImportStreets(payload: {
  cityId: number;
  text: string;
  replaceExisting?: boolean;
}) {
  const response = await http.post<{ data: BulkImportStreetsResult }>(
    "/api/admin/streets/bulk",
    payload,
  );

  return response.data.data;
}
