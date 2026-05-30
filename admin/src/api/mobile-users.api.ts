import { http } from "./http";

export type MobileUser = {
  id: number;
  cityId: number;
  login: string;
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

export async function getMobileUsers(
  cityId?: number,
  archive = false
): Promise<MobileUser[]> {
  const response = await http.get<{ data: MobileUser[] }>(
    "/api/admin/mobile-users",
    {
      params: {
        includeInactive: true,
        archive,
        ...(cityId ? { cityId } : {}),
      },
    }
  );

  return response.data.data;
}

export async function createMobileUser(data: {
  cityId: number;
  login: string;
  password: string;
  isActive?: boolean;
}): Promise<MobileUser> {
  const response = await http.post<{ data: MobileUser }>(
    "/api/admin/mobile-users",
    data
  );

  return response.data.data;
}

export async function updateMobileUser(
  id: number,
  data: {
    cityId?: number;
    login?: string;
    password?: string;
    isActive?: boolean;
  }
): Promise<MobileUser> {
  const response = await http.put<{ data: MobileUser }>(
    `/api/admin/mobile-users/${id}`,
    data
  );

  return response.data.data;
}

export async function restoreMobileUser(id: number): Promise<MobileUser> {
  const response = await http.patch<{ data: MobileUser }>(
    `/api/admin/mobile-users/${id}/restore`
  );

  return response.data.data;
}

export async function deleteMobileUser(id: number): Promise<void> {
  await http.delete(`/api/admin/mobile-users/${id}`);
}