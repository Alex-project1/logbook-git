import { http } from "./http";

export type NotificationRecipientStatus = "SENT" | "DELIVERED" | "READ" | "REPLIED";

export type NotificationMobileUser = {
  id: number;
  login: string;
  cityId: number;
  departmentId?: number;
  userKind?: "CREW" | "POST";
  department?: {
    id: number;
    name: string;
    type: "GBR" | "POST" | "OTHER";
  };
  city?: {
    id: number;
    name: string;
  };
};

export type NotificationSenderUser = {
  id: number;
  name: string;
  login: string;
} | null;

export type NotificationRecipient = {
  id: number;
  mobileUser: NotificationMobileUser;
  sentAt: string;
  deliveredAt: string | null;
  readAt: string | null;
  repliedAt: string | null;
  replyText: string | null;
  status: NotificationRecipientStatus;
};

export type AdminNotification = {
  id: number;
  city: {
    id: number;
    name: string;
  };
  department?: {
    id: number;
    name: string;
    type: "GBR" | "POST" | "OTHER";
  } | null;
  targetUserKind?: "CREW" | "POST" | null;
  senderUser: NotificationSenderUser;
  title: string;
  message: string;
  createdAt: string;

  push: {
  enabled: boolean;
  tokensCount: number;
  successCount: number;
  failureCount: number;
  removedInvalidTokens: number;
  message: string | null;
  processedAt: string | null;
};

  recipientsCount: number;
  readCount: number;
  repliedCount: number;

  recipients: NotificationRecipient[];
};

export type NotificationsFilters = {
  page?: number;
  pageSize?: number;
  cityId?: number;
  departmentId?: number;
  mobileUserId?: number;
  dateFrom?: string;
  dateTo?: string;
};

export type NotificationsResponse = {
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  data: AdminNotification[];
};

function buildNotificationParams(filters: NotificationsFilters) {
  const params: Record<string, string | number> = {};

  if (filters.page) params.page = filters.page;
  if (filters.pageSize) params.pageSize = filters.pageSize;
  if (filters.cityId) params.cityId = filters.cityId;
  if (filters.departmentId) params.departmentId = filters.departmentId;
  if (filters.mobileUserId) params.mobileUserId = filters.mobileUserId;

  if (filters.dateFrom) {
    params.dateFrom = `${filters.dateFrom}T00:00:00.000Z`;
  }

  if (filters.dateTo) {
    params.dateTo = `${filters.dateTo}T23:59:59.999Z`;
  }

  return params;
}

export async function createNotification(data: {
  cityId: number;
  departmentId?: number | null;
  targetUserKind?: "CREW" | "POST" | null;
  mobileUserIds: number[];
  title: string;
  message: string;
}): Promise<AdminNotification> {
  const response = await http.post<{ data: AdminNotification }>(
    "/api/admin/notifications",
    data
  );

  return response.data.data;
}

export async function getNotifications(
  filters: NotificationsFilters
): Promise<NotificationsResponse> {
  const response = await http.get<NotificationsResponse>(
    "/api/admin/notifications",
    {
      params: buildNotificationParams(filters),
    }
  );

  return response.data;
}

export async function getNotificationById(
  id: number
): Promise<AdminNotification> {
  const response = await http.get<{ data: AdminNotification }>(
    `/api/admin/notifications/${id}`
  );

  return response.data.data;
}