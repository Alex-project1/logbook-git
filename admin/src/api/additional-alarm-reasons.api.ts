import { http } from "./http";

export type AdditionalAlarmReason = {
  id: number;
  name: string;
  isSystem: boolean;
  isActive: boolean;
  sortOrder: number;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function getAdditionalAlarmReasons(
  archive = false
): Promise<AdditionalAlarmReason[]> {
  const response = await http.get<{ data: AdditionalAlarmReason[] }>(
    "/api/admin/additional-alarm-reasons",
    {
      params: {
        includeInactive: true,
        archive,
      },
    }
  );

  return response.data.data;
}

export async function createAdditionalAlarmReason(data: {
  name: string;
  sortOrder?: number;
  isActive?: boolean;
}): Promise<AdditionalAlarmReason> {
  const response = await http.post<{ data: AdditionalAlarmReason }>(
    "/api/admin/additional-alarm-reasons",
    data
  );

  return response.data.data;
}

export async function updateAdditionalAlarmReason(
  id: number,
  data: {
    name?: string;
    sortOrder?: number;
    isActive?: boolean;
  }
): Promise<AdditionalAlarmReason> {
  const response = await http.put<{ data: AdditionalAlarmReason }>(
    `/api/admin/additional-alarm-reasons/${id}`,
    data
  );

  return response.data.data;
}

export async function restoreAdditionalAlarmReason(
  id: number
): Promise<AdditionalAlarmReason> {
  const response = await http.patch<{ data: AdditionalAlarmReason }>(
    `/api/admin/additional-alarm-reasons/${id}/restore`
  );

  return response.data.data;
}

export async function deleteAdditionalAlarmReason(id: number): Promise<void> {
  await http.delete(`/api/admin/additional-alarm-reasons/${id}`);
}