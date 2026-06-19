import { http } from "./http";

export type TelegramBot = {
  id: number;
  name: string;
  tokenMasked: string;
  isActive: boolean;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  channelsCount?: number;
};

export type TelegramChannel = {
  id: number;
  botId: number;
  name: string;
  chatId: string;
  isActive: boolean;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  bot?: TelegramBot;
};

export async function getTelegramBots(): Promise<TelegramBot[]> {
  const response = await http.get<{ data: TelegramBot[] }>("/api/admin/telegram/bots");
  return response.data.data;
}

export async function createTelegramBot(data: {
  name: string;
  token: string;
  isActive?: boolean;
}): Promise<TelegramBot> {
  const response = await http.post<{ data: TelegramBot }>("/api/admin/telegram/bots", data);
  return response.data.data;
}

export async function updateTelegramBot(
  id: number,
  data: {
    name?: string;
    token?: string;
    isActive?: boolean;
  },
): Promise<TelegramBot> {
  const response = await http.put<{ data: TelegramBot }>(`/api/admin/telegram/bots/${id}`, data);
  return response.data.data;
}

export async function deleteTelegramBot(id: number): Promise<void> {
  await http.delete(`/api/admin/telegram/bots/${id}`);
}

export async function getTelegramChannels(params?: {
  activeOnly?: boolean;
}): Promise<TelegramChannel[]> {
  const response = await http.get<{ data: TelegramChannel[] }>("/api/admin/telegram/channels", {
    params: {
      ...(params?.activeOnly ? { activeOnly: true } : {}),
    },
  });

  return response.data.data;
}

export async function createTelegramChannel(data: {
  botId: number;
  name: string;
  chatId: string;
  isActive?: boolean;
}): Promise<TelegramChannel> {
  const response = await http.post<{ data: TelegramChannel }>("/api/admin/telegram/channels", data);
  return response.data.data;
}

export async function updateTelegramChannel(
  id: number,
  data: {
    botId?: number;
    name?: string;
    chatId?: string;
    isActive?: boolean;
  },
): Promise<TelegramChannel> {
  const response = await http.put<{ data: TelegramChannel }>(`/api/admin/telegram/channels/${id}`, data);
  return response.data.data;
}

export async function deleteTelegramChannel(id: number): Promise<void> {
  await http.delete(`/api/admin/telegram/channels/${id}`);
}
