import { http } from "./http";

export type AdminRoleCode = "super_admin" | "admin" | "viewer";

export type AdminUser = {
  id: number;
  name: string;
  login: string;
  email: string | null;
  role: {
    code: AdminRoleCode;
    name: string;
  };
};

export type LoginResponse = {
  accessToken: string;
  user: AdminUser;
};

export async function loginAdmin(data: {
  login: string;
  password: string;
}): Promise<LoginResponse> {
  const response = await http.post<LoginResponse>("/api/admin/login", data);
  return response.data;
}

export async function getAdminMe(): Promise<{ user: AdminUser }> {
  const response = await http.get<{ user: AdminUser }>("/api/admin/me");
  return response.data;
}