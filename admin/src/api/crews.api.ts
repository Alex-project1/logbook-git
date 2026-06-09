import { http } from "./http";

export type CrewDutyType = "FULL_DAY" | "DAY" | "NIGHT";
export type CrewTransportType = "AUTO" | "MOTO";

export type Crew = {
  id: number;
  cityId: number;
  departmentId: number;
  name: string;
  login: string;
  comment: string | null;
  isActive: boolean;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  dutyType: CrewDutyType;
  transportType: CrewTransportType;
  durationHours: number;
  city?: { id: number; name: string };
  department?: { id: number; name: string; type: "GBR" | "POST" | "OTHER" };
  mobileUser?: { id: number; login: string; isActive: boolean; deletedAt?: string | null } | null;
};

export async function getCrews(
  paramsOrCityId?: { cityId?: number; departmentId?: number; archive?: boolean; includeInactive?: boolean } | number,
  legacyArchive = false,
): Promise<Crew[]> {
  const params = typeof paramsOrCityId === "number" ? { cityId: paramsOrCityId || undefined, archive: legacyArchive, includeInactive: true } : paramsOrCityId;
  const response = await http.get<{ data: Crew[] }>("/api/admin/crews", {
    params: {
      includeInactive: params?.includeInactive ?? true,
      archive: params?.archive ?? false,
      ...(params?.cityId ? { cityId: params.cityId } : {}),
      ...(params?.departmentId ? { departmentId: params.departmentId } : {}),
    },
  });

  return response.data.data;
}

export async function createCrew(data: {
  cityId: number;
  departmentId: number;
  name: string;
  login: string;
  password: string;
  confirmPassword: string;
  comment?: string | null;
  isActive?: boolean;
  dutyType?: CrewDutyType;
  transportType?: CrewTransportType;
  durationHours?: number;
}): Promise<Crew> {
  const response = await http.post<{ data: Crew }>("/api/admin/crews", data);
  return response.data.data;
}

export async function updateCrew(
  id: number,
  data: {
    cityId?: number;
    departmentId?: number;
    name?: string;
    login?: string;
    newPassword?: string;
    confirmNewPassword?: string;
    comment?: string | null;
    isActive?: boolean;
    dutyType?: CrewDutyType;
    transportType?: CrewTransportType;
    durationHours?: number;
  },
): Promise<Crew> {
  const response = await http.put<{ data: Crew }>(`/api/admin/crews/${id}`, data);
  return response.data.data;
}

export async function restoreCrew(id: number): Promise<Crew> {
  const response = await http.patch<{ data: Crew }>(`/api/admin/crews/${id}/restore`);
  return response.data.data;
}

export async function deleteCrew(id: number): Promise<void> {
  await http.delete(`/api/admin/crews/${id}`);
}
