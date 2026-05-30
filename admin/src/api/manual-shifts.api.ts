import { http } from "./http";

export type ManualTripEventInput = {
  eventCategory: "REGULAR_ALARM" | "ADDITIONAL_ALARM";

  alarmSource?: "OH" | "PARTNER";
  isCombat?: boolean;

  reasonId?: number | null;
  customReasonText?: string | null;

  ohCount?: number;
  partnerCount?: number;

  detainedCount?: number;
  transferredCount?: number;

  note?: string | null;
};

export type ManualTripInput = {
  fromLocation: string;
  departureTime: string;
  toLocation: string;
  arrivalTime: string;
  arrivalMinutes: number;
  distanceKm: number;
  goalId: number;
  note?: string | null;
  events?: ManualTripEventInput[];
};

export type CreateManualShiftInput = {
  cityId: number;
  crewId: number;
  vehicleId: number;
  driverEmployeeId: number;
  seniorEmployeeId: number;

  driverHasWeapon: boolean;
  seniorHasWeapon: boolean;

  shiftDate: string;
  submittedAt?: string;

  odometerStart: number;

  trips: ManualTripInput[];
};

export async function createManualShift(data: CreateManualShiftInput) {
  const response = await http.post<{ message: string; data: unknown }>(
    "/api/admin/manual-shifts",
    data
  );

  return response.data;
}

export async function deleteManualShift(id: number, reason: string) {
  await http.delete(`/api/admin/manual-shifts/${id}`, {
    data: {
      reason,
    },
  });
}

export type DeletedShiftArchiveFilters = {
  page?: number;
  pageSize?: number;
  cityId?: number;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
};

export type DeletedShiftArchiveRow = {
  id: number;

  city: {
    id: number;
    name: string;
  };

  crew: {
    id: number;
    name: string;
  };

  vehicle: {
    id: number;
    title: string;
    licensePlate: string | null;
  };

  driverEmployee: {
    id: number;
    fullName: string;
  };

  seniorEmployee: {
    id: number;
    fullName: string;
  };

  shiftDate: string;
  submittedAt: string | null;
  deletedAt: string | null;

  odometerStart: number;
  odometerEndCalculated: number;
  totalDistanceKm: number;

  tripsCount: number;
};

export type DeletedShiftArchiveResponse = {
  filters: DeletedShiftArchiveFilters;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  data: DeletedShiftArchiveRow[];
};

function buildDeletedShiftsParams(filters: DeletedShiftArchiveFilters) {
  const params: Record<string, string | number> = {};

  if (filters.page) params.page = filters.page;
  if (filters.pageSize) params.pageSize = filters.pageSize;
  if (filters.cityId) params.cityId = filters.cityId;
  if (filters.search?.trim()) params.search = filters.search.trim();

  if (filters.dateFrom) {
    params.dateFrom = `${filters.dateFrom}T00:00:00.000Z`;
  }

  if (filters.dateTo) {
    params.dateTo = `${filters.dateTo}T23:59:59.999Z`;
  }

  return params;
}

export async function getDeletedManualShifts(
  filters: DeletedShiftArchiveFilters
): Promise<DeletedShiftArchiveResponse> {
  const response = await http.get<DeletedShiftArchiveResponse>(
    "/api/admin/manual-shifts/archive",
    {
      params: buildDeletedShiftsParams(filters),
    }
  );

  return response.data;
}

export async function restoreManualShift(id: number) {
  await http.patch(`/api/admin/manual-shifts/${id}/restore`);
}

export type ManualShiftDetailsEvent = {
  id: number;
  eventCategory: "REGULAR_ALARM" | "ADDITIONAL_ALARM";

  alarmSource: "OH" | "PARTNER" | null;
  isCombat: boolean | null;

  reasonId: number | null;
  customReasonText: string | null;

  ohCount: number | null;
  partnerCount: number | null;
  countTotal: number | null;

  detainedCount: number | null;
  transferredCount: number | null;

  note: string | null;
};

export type ManualShiftDetailsTrip = {
  id: number;
  cityId: number;
  shiftId: number;
  goalId: number;

  fromLocation: string;
  departureTime: string;
  toLocation: string;
  arrivalTime: string;
  arrivalMinutes: number;
  distanceKm: number | string;
  note: string | null;

  goal: {
    id: number;
    name: string;
    systemCode: string | null;
  };

  events: ManualShiftDetailsEvent[];
};

export type ManualShiftDetails = {
  id: number;

  cityId: number;
  crewId: number;
  vehicleId: number;
  driverEmployeeId: number;
  seniorEmployeeId: number;

  driverHasWeapon: boolean;
  seniorHasWeapon: boolean;

  shiftDate: string;
  submittedAt: string | null;

  odometerStart: number;
  odometerEndCalculated: number;
  totalDistanceKm: number | string;

  trips: ManualShiftDetailsTrip[];
};

export async function getManualShiftById(id: number): Promise<ManualShiftDetails> {
  const response = await http.get<{ data: ManualShiftDetails }>(
    `/api/admin/manual-shifts/${id}`
  );

  return response.data.data;
}

export async function updateManualShift(
  id: number,
  data: CreateManualShiftInput
) {
  const response = await http.put<{ message: string; data: unknown }>(
    `/api/admin/manual-shifts/${id}`,
    data
  );

  return response.data;
}