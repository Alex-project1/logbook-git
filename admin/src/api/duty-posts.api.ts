import { http } from "./http";

export type DutyPost = {
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

export async function getDutyPosts(
  cityId?: number,
  archive = false
): Promise<DutyPost[]> {
  const response = await http.get<{ data: DutyPost[] }>("/api/admin/duty-posts", {
    params: {
      cityId,
      archive,
      includeInactive: true,
    },
  });

  return response.data.data;
}

export async function createDutyPost(data: {
  cityId: number;
  name: string;
  comment?: string | null;
  isActive?: boolean;
}): Promise<DutyPost> {
  const response = await http.post<{ data: DutyPost }>(
    "/api/admin/duty-posts",
    data
  );

  return response.data.data;
}

export async function updateDutyPost(
  id: number,
  data: {
    cityId?: number;
    name?: string;
    comment?: string | null;
    isActive?: boolean;
  }
): Promise<DutyPost> {
  const response = await http.put<{ data: DutyPost }>(
    `/api/admin/duty-posts/${id}`,
    data
  );

  return response.data.data;
}

export async function restoreDutyPost(id: number): Promise<DutyPost> {
  const response = await http.patch<{ data: DutyPost }>(
    `/api/admin/duty-posts/${id}/restore`
  );

  return response.data.data;
}

export async function deleteDutyPost(id: number): Promise<void> {
  await http.delete(`/api/admin/duty-posts/${id}`);
}