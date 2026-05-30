import { http } from "./http";

export type TripGoal = {
  id: number;
  name: string;
  systemCode: string | null;
  isSystem: boolean;
  isActive: boolean;
  sortOrder: number;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function getTripGoals(archive = false): Promise<TripGoal[]> {
  const response = await http.get<{ data: TripGoal[] }>(
    "/api/admin/trip-goals",
    {
      params: {
        includeInactive: true,
        archive,
      },
    }
  );

  return response.data.data;
}

export async function createTripGoal(data: {
  name: string;
  sortOrder?: number;
  isActive?: boolean;
}): Promise<TripGoal> {
  const response = await http.post<{ data: TripGoal }>(
    "/api/admin/trip-goals",
    data
  );

  return response.data.data;
}

export async function updateTripGoal(
  id: number,
  data: {
    name?: string;
    sortOrder?: number;
    isActive?: boolean;
  }
): Promise<TripGoal> {
  const response = await http.put<{ data: TripGoal }>(
    `/api/admin/trip-goals/${id}`,
    data
  );

  return response.data.data;
}

export async function restoreTripGoal(id: number): Promise<TripGoal> {
  const response = await http.patch<{ data: TripGoal }>(
    `/api/admin/trip-goals/${id}/restore`
  );

  return response.data.data;
}

export async function deleteTripGoal(id: number): Promise<void> {
  await http.delete(`/api/admin/trip-goals/${id}`);
}