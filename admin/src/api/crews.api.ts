import { http } from "./http";

export type Crew = {
  id: number;
  cityId: number;
  name: string;
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

export async function getCrews(
  cityId?: number,
  archive = false
): Promise<Crew[]> {
  const response = await http.get<{ data: Crew[] }>("/api/admin/crews", {
    params: {
      includeInactive: true,
      archive,
      ...(cityId ? { cityId } : {}),
    },
  });

  return response.data.data;
}

export async function createCrew(data: {
  cityId: number;
  name: string;
  isActive?: boolean;
}): Promise<Crew> {
  const response = await http.post<{ data: Crew }>("/api/admin/crews", data);
  return response.data.data;
}

export async function updateCrew(
  id: number,
  data: {
    cityId?: number;
    name?: string;
    isActive?: boolean;
  }
): Promise<Crew> {
  const response = await http.put<{ data: Crew }>(
    `/api/admin/crews/${id}`,
    data
  );

  return response.data.data;
}

export async function restoreCrew(id: number): Promise<Crew> {
  const response = await http.patch<{ data: Crew }>(
    `/api/admin/crews/${id}/restore`
  );

  return response.data.data;
}

export async function deleteCrew(id: number): Promise<void> {
  await http.delete(`/api/admin/crews/${id}`);
}