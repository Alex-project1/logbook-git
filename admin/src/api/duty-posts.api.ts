import { http } from "./http";

export type DutyPost = {
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
  telegramEnabled: boolean;
  telegramChannelId?: number | null;
  telegramChannelIds?: number[];
  telegramChannel?: { id: number; name: string; chatId: string; isActive: boolean } | null;
  telegramChannels?: { id: number; name: string; chatId: string; isActive: boolean }[];
  city?: { id: number; name: string };
  department?: { id: number; name: string; type: "GBR" | "POST" | "OTHER" };
  mobileUser?: { id: number; login: string; isActive: boolean; deletedAt?: string | null } | null;
};

export async function getDutyPosts(
  paramsOrCityId?: { cityId?: number; departmentId?: number; archive?: boolean; includeInactive?: boolean } | number,
  legacyArchive = false,
): Promise<DutyPost[]> {
  const params = typeof paramsOrCityId === "number" ? { cityId: paramsOrCityId || undefined, archive: legacyArchive, includeInactive: true } : paramsOrCityId;
  const response = await http.get<{ data: DutyPost[] }>("/api/admin/duty-posts", {
    params: {
      includeInactive: params?.includeInactive ?? true,
      archive: params?.archive ?? false,
      ...(params?.cityId ? { cityId: params.cityId } : {}),
      ...(params?.departmentId ? { departmentId: params.departmentId } : {}),
    },
  });

  return response.data.data;
}

export async function createDutyPost(data: {
  cityId: number;
  departmentId: number;
  name: string;
  login: string;
  password: string;
  confirmPassword: string;
  comment?: string | null;
  isActive?: boolean;
  telegramEnabled?: boolean;
  telegramChannelId?: number | null;
  telegramChannelIds?: number[];
}): Promise<DutyPost> {
  const response = await http.post<{ data: DutyPost }>("/api/admin/duty-posts", data);
  return response.data.data;
}

export async function updateDutyPost(
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
    telegramEnabled?: boolean;
    telegramChannelId?: number | null;
    telegramChannelIds?: number[];
  },
): Promise<DutyPost> {
  const response = await http.put<{ data: DutyPost }>(`/api/admin/duty-posts/${id}`, data);
  return response.data.data;
}

export async function restoreDutyPost(id: number): Promise<DutyPost> {
  const response = await http.patch<{ data: DutyPost }>(`/api/admin/duty-posts/${id}/restore`);
  return response.data.data;
}

export async function deleteDutyPost(id: number): Promise<void> {
  await http.delete(`/api/admin/duty-posts/${id}`);
}
