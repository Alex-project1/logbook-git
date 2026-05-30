import { http } from "./http";

export type PostDutyMember = {
  id: number;
  postDutyId: number;
  employeeId: number;
  hasWeapon: boolean;
  isDriver: boolean;
  comment: string | null;
  employee: {
    id: number;
    fullName: string;
  };
};

export type PostDuty = {
  id: number;
  cityId: number;
  postId: number;
  vehicleId: number | null;

  dutyDate: string;
  durationHours: number;
  shiftEquivalent: number;

  note: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;

  city: {
    id: number;
    name: string;
  };

  post: {
    id: number;
    name: string;
  };

  vehicle: {
    id: number;
    title: string;
    licensePlate: string | null;
  } | null;

  members: PostDutyMember[];
};

export type PostDutiesFilters = {
  page?: number;
  pageSize?: number;
  cityId?: number;
  postId?: number;
  vehicleId?: number;
  employeeId?: number;
  dateFrom?: string;
  dateTo?: string;
  archive?: boolean;
  search?: string;
};

export type PostDutiesResponse = {
  filters: PostDutiesFilters;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  data: PostDuty[];
};

export type PostDutyMemberInput = {
  employeeId: number;
  hasWeapon: boolean;
  isDriver: boolean;
  comment?: string | null;
};

export type SavePostDutyInput = {
  cityId: number;
  postId: number;
  vehicleId?: number | null;
  dutyDate: string;
  durationHours: number;
  note?: string | null;
  members: PostDutyMemberInput[];
};

function buildParams(filters: PostDutiesFilters) {
  const params: Record<string, string | number | boolean> = {};

  if (filters.page) params.page = filters.page;
  if (filters.pageSize) params.pageSize = filters.pageSize;
  if (filters.cityId) params.cityId = filters.cityId;
  if (filters.postId) params.postId = filters.postId;
  if (filters.vehicleId) params.vehicleId = filters.vehicleId;
  if (filters.employeeId) params.employeeId = filters.employeeId;
  if (filters.dateFrom) params.dateFrom = filters.dateFrom;
  if (filters.dateTo) params.dateTo = filters.dateTo;
  if (typeof filters.archive === "boolean") params.archive = filters.archive;
  if (filters.search?.trim()) params.search = filters.search.trim();

  return params;
}

export async function getPostDuties(
  filters: PostDutiesFilters
): Promise<PostDutiesResponse> {
  const response = await http.get<PostDutiesResponse>("/api/admin/post-duties", {
    params: buildParams(filters),
  });

  return response.data;
}

export async function createPostDuty(data: SavePostDutyInput) {
  const response = await http.post<{ message: string; data: PostDuty }>(
    "/api/admin/post-duties",
    data
  );

  return response.data;
}

export async function updatePostDuty(id: number, data: SavePostDutyInput) {
  const response = await http.put<{ message: string; data: PostDuty }>(
    `/api/admin/post-duties/${id}`,
    data
  );

  return response.data;
}

export async function deletePostDuty(id: number) {
  await http.delete(`/api/admin/post-duties/${id}`);
}

export async function restorePostDuty(id: number) {
  const response = await http.patch<{ message: string }>(
    `/api/admin/post-duties/${id}/restore`
  );

  return response.data;
}