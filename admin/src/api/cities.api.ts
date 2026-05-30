import { http } from "./http";

export type City = {
  id: number;
  name: string;
  isActive: boolean;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function getCities(archive = false): Promise<City[]> {
  const response = await http.get<{ data: City[] }>("/api/admin/cities", {
    params: {
      archive,
    },
  });

  return response.data.data;
}

export async function getAccessibleCities(archive = false): Promise<City[]> {
  const response = await http.get<{ data: City[] }>("/api/admin/cities", {
    params: {
      archive,
      scope: "access",
    },
  });

  return response.data.data;
}

export async function createCity(data: {
  name: string;
  isActive?: boolean;
}): Promise<City> {
  const response = await http.post<{ data: City }>("/api/admin/cities", data);
  return response.data.data;
}

export async function updateCity(
  id: number,
  data: {
    name?: string;
    isActive?: boolean;
  }
): Promise<City> {
  const response = await http.put<{ data: City }>(
    `/api/admin/cities/${id}`,
    data
  );

  return response.data.data;
}

export async function restoreCity(id: number): Promise<City> {
  const response = await http.patch<{ data: City }>(
    `/api/admin/cities/${id}/restore`
  );

  return response.data.data;
}

export async function deleteCity(id: number): Promise<void> {
  await http.delete(`/api/admin/cities/${id}`);
}