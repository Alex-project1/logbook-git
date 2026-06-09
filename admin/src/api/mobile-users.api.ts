import { http } from "./http";

export type MobileUserKind = "CREW" | "POST";

export type MobileUser = {
  id: number;
  cityId: number;
  departmentId: number;
  userKind: MobileUserKind;
  crewId: number | null;
  dutyPostId: number | null;
  login: string;
  displayName: string | null;
  comment: string | null;
  isActive: boolean;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  city?: { id: number; name: string };
  department?: { id: number; name: string; type: "GBR" | "POST" | "OTHER" };
  crew?: { id: number; name: string } | null;
  dutyPost?: { id: number; name: string } | null;
};

export async function getMobileUsers(params?: {
  cityId?: number;
  departmentId?: number;
  userKind?: MobileUserKind;
  archive?: boolean;
  includeInactive?: boolean;
}): Promise<MobileUser[]> {
  const response = await http.get<{ data: MobileUser[] }>("/api/admin/mobile-users", {
    params: {
      includeInactive: params?.includeInactive ?? true,
      archive: params?.archive ?? false,
      ...(params?.cityId ? { cityId: params.cityId } : {}),
      ...(params?.departmentId ? { departmentId: params.departmentId } : {}),
      ...(params?.userKind ? { userKind: params.userKind } : {}),
    },
  });

  return response.data.data;
}
