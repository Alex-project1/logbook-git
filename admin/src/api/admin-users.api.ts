import { http } from "./http";

export type AdminUserRoleCode = "admin" | "viewer";

export type AdminUserFilters = {
  page?: number;
  pageSize?: number;
  roleCode?: string;
  cityId?: number;
  search?: string;
  includeArchived?: boolean;
};

export type AdminUserCityAccess = {
  id: number;
  userId: number;
  cityId: number;
  accessLevel: "VIEW" | "EDIT" | "FULL";
  canAddShift: boolean;
  canDeleteShift: boolean;
  city: {
    id: number;
    name: string;
    isActive: boolean;
  };
};

export type AdminUserRow = {
  id: number;
  name: string;
  email: string | null;
  login: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  role: {
    id: number;
    code: string;
    name: string;
  };
  cityAccesses: AdminUserCityAccess[];
};

export type AdminUsersResponse = {
  filters: AdminUserFilters;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  data: AdminUserRow[];
};

export type CreateAdminUserInput = {
  name: string;
  login: string;
  email?: string | null;
  password: string;
  roleCode: AdminUserRoleCode;
  cityIds: number[];
};

export type UpdateAdminUserInput = {
  name: string;
  login: string;
  email?: string | null;
  password?: string;
  roleCode: AdminUserRoleCode;
  cityIds: number[];
  isActive: boolean;
};

function buildAdminUsersParams(filters: AdminUserFilters) {
  const params: Record<string, string | number | boolean> = {};

  if (filters.page) params.page = filters.page;
  if (filters.pageSize) params.pageSize = filters.pageSize;
  if (filters.roleCode) params.roleCode = filters.roleCode;
  if (filters.cityId) params.cityId = filters.cityId;
  if (filters.search?.trim()) params.search = filters.search.trim();

  if (typeof filters.includeArchived === "boolean") {
    params.includeArchived = filters.includeArchived;
  }

  return params;
}

export async function getAdminUsers(
  filters: AdminUserFilters
): Promise<AdminUsersResponse> {
  const response = await http.get<AdminUsersResponse>(
    "/api/admin/admin-users",
    {
      params: buildAdminUsersParams(filters),
    }
  );

  return response.data;
}

export async function createAdminUser(data: CreateAdminUserInput) {
  const response = await http.post<{ message: string; data: AdminUserRow }>(
    "/api/admin/admin-users",
    data
  );

  return response.data;
}

export async function updateAdminUser(
  id: number,
  data: UpdateAdminUserInput
) {
  const response = await http.put<{ message: string; data: AdminUserRow }>(
    `/api/admin/admin-users/${id}`,
    data
  );

  return response.data;
}

export async function deleteAdminUser(id: number) {
  await http.delete(`/api/admin/admin-users/${id}`);
}