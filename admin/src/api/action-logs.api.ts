import { http } from "./http";

export type AdminActionLogFilters = {
  page?: number;
  pageSize?: number;
  cityId?: number;
  entityId?: number;
  action?: string;
  entityType?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
};

export type AdminActionLogRow = {
  id: number;
  adminUserId: number | null;
  adminLogin: string | null;
  adminName: string | null;

  action: string;
  entityType: string;
  entityId: number | null;
  cityId: number | null;

  description: string | null;
  metadata: unknown;

  createdAt: string;
};

export type AdminActionLogsResponse = {
  filters: AdminActionLogFilters;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  data: AdminActionLogRow[];
};

function buildActionLogsParams(filters: AdminActionLogFilters) {
  const params: Record<string, string | number> = {};

  if (filters.page) params.page = filters.page;
  if (filters.pageSize) params.pageSize = filters.pageSize;
  if (filters.cityId) params.cityId = filters.cityId;
  if (filters.entityId) params.entityId = filters.entityId;
  if (filters.action) params.action = filters.action;
  if (filters.entityType) params.entityType = filters.entityType;
  if (filters.search?.trim()) params.search = filters.search.trim();

  if (filters.dateFrom) {
    params.dateFrom = `${filters.dateFrom}T00:00:00.000Z`;
  }

  if (filters.dateTo) {
    params.dateTo = `${filters.dateTo}T23:59:59.999Z`;
  }

  return params;
}

export async function getAdminActionLogs(
  filters: AdminActionLogFilters
): Promise<AdminActionLogsResponse> {
  const response = await http.get<AdminActionLogsResponse>(
    "/api/admin/action-logs",
    {
      params: buildActionLogsParams(filters),
    }
  );

  return response.data;
}