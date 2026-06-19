import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { toTelegramBotDto } from "./telegram.service";

const createBotSchema = z.object({
  name: z.string().min(1, "Вкажіть назву бота"),
  token: z.string().min(10, "Вкажіть токен Telegram-бота"),
  isActive: z.boolean().optional(),
});

const updateBotSchema = z.object({
  name: z.string().min(1, "Вкажіть назву бота").optional(),
  token: z.string().min(10, "Вкажіть токен Telegram-бота").optional(),
  isActive: z.boolean().optional(),
});

const createChannelSchema = z.object({
  botId: z.number().int().positive(),
  name: z.string().min(1, "Вкажіть назву каналу"),
  chatId: z.string().min(1, "Вкажіть chat ID каналу"),
  isActive: z.boolean().optional(),
});

const updateChannelSchema = z.object({
  botId: z.number().int().positive().optional(),
  name: z.string().min(1, "Вкажіть назву каналу").optional(),
  chatId: z.string().min(1, "Вкажіть chat ID каналу").optional(),
  isActive: z.boolean().optional(),
});

export async function getTelegramBots(_req: Request, res: Response) {
  try {
    const bots = await prisma.telegramBot.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      include: {
        channels: {
          where: { deletedAt: null },
          select: { id: true },
        },
      },
    });

    return res.json({
      data: bots.map((bot) => ({
        ...toTelegramBotDto(bot),
        channelsCount: bot.channels.length,
      })),
    });
  } catch (error) {
    console.error("getTelegramBots error:", error);
    return res.status(500).json({ message: "Внутрішня помилка сервера" });
  }
}

export async function createTelegramBot(req: Request, res: Response) {
  try {
    const parsed = createBotSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Validation error", errors: parsed.error.flatten() });
    }

    const bot = await prisma.telegramBot.create({
      data: {
        name: parsed.data.name.trim(),
        token: parsed.data.token.trim(),
        isActive: parsed.data.isActive ?? true,
      },
    });

    return res.status(201).json({ data: toTelegramBotDto(bot) });
  } catch (error) {
    console.error("createTelegramBot error:", error);
    return res.status(500).json({ message: "Внутрішня помилка сервера" });
  }
}

export async function updateTelegramBot(req: Request, res: Response) {
  try {
    const botId = Number(req.params.id);
    if (!Number.isInteger(botId)) {
      return res.status(400).json({ message: "Invalid bot id" });
    }

    const parsed = updateBotSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Validation error", errors: parsed.error.flatten() });
    }

    const bot = await prisma.telegramBot.update({
      where: { id: botId },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name.trim() } : {}),
        ...(parsed.data.token !== undefined ? { token: parsed.data.token.trim() } : {}),
        ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
      },
    });

    return res.json({ data: toTelegramBotDto(bot) });
  } catch (error) {
    console.error("updateTelegramBot error:", error);
    return res.status(500).json({ message: "Внутрішня помилка сервера" });
  }
}

export async function deleteTelegramBot(req: Request, res: Response) {
  try {
    const botId = Number(req.params.id);
    if (!Number.isInteger(botId)) {
      return res.status(400).json({ message: "Invalid bot id" });
    }

    await prisma.telegramBot.update({
      where: { id: botId },
      data: {
        deletedAt: new Date(),
        isActive: false,
        channels: {
          updateMany: {
            where: { deletedAt: null },
            data: { deletedAt: new Date(), isActive: false },
          },
        },
      },
    });

    return res.status(204).send();
  } catch (error) {
    console.error("deleteTelegramBot error:", error);
    return res.status(500).json({ message: "Внутрішня помилка сервера" });
  }
}

export async function getTelegramChannels(req: Request, res: Response) {
  try {
    const activeOnly = req.query.activeOnly === "true";

    const channels = await prisma.telegramChannel.findMany({
      where: {
        deletedAt: null,
        ...(activeOnly ? { isActive: true, bot: { isActive: true, deletedAt: null } } : {}),
      },
      orderBy: { name: "asc" },
      include: {
        bot: true,
      },
    });

    return res.json({
      data: channels.map((channel) => ({
        ...channel,
        bot: toTelegramBotDto(channel.bot),
      })),
    });
  } catch (error) {
    console.error("getTelegramChannels error:", error);
    return res.status(500).json({ message: "Внутрішня помилка сервера" });
  }
}

export async function createTelegramChannel(req: Request, res: Response) {
  try {
    const parsed = createChannelSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Validation error", errors: parsed.error.flatten() });
    }

    const bot = await prisma.telegramBot.findFirst({
      where: { id: parsed.data.botId, deletedAt: null },
    });

    if (!bot) {
      return res.status(404).json({ message: "Бот не знайдено" });
    }

    const channel = await prisma.telegramChannel.create({
      data: {
        botId: parsed.data.botId,
        name: parsed.data.name.trim(),
        chatId: parsed.data.chatId.trim(),
        isActive: parsed.data.isActive ?? true,
      },
      include: { bot: true },
    });

    return res.status(201).json({
      data: {
        ...channel,
        bot: toTelegramBotDto(channel.bot),
      },
    });
  } catch (error) {
    console.error("createTelegramChannel error:", error);
    return res.status(500).json({ message: "Внутрішня помилка сервера" });
  }
}

export async function updateTelegramChannel(req: Request, res: Response) {
  try {
    const channelId = Number(req.params.id);
    if (!Number.isInteger(channelId)) {
      return res.status(400).json({ message: "Invalid channel id" });
    }

    const parsed = updateChannelSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Validation error", errors: parsed.error.flatten() });
    }

    if (parsed.data.botId) {
      const bot = await prisma.telegramBot.findFirst({
        where: { id: parsed.data.botId, deletedAt: null },
      });

      if (!bot) {
        return res.status(404).json({ message: "Бот не знайдено" });
      }
    }

    const channel = await prisma.telegramChannel.update({
      where: { id: channelId },
      data: {
        ...(parsed.data.botId !== undefined ? { botId: parsed.data.botId } : {}),
        ...(parsed.data.name !== undefined ? { name: parsed.data.name.trim() } : {}),
        ...(parsed.data.chatId !== undefined ? { chatId: parsed.data.chatId.trim() } : {}),
        ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
      },
      include: { bot: true },
    });

    return res.json({
      data: {
        ...channel,
        bot: toTelegramBotDto(channel.bot),
      },
    });
  } catch (error) {
    console.error("updateTelegramChannel error:", error);
    return res.status(500).json({ message: "Внутрішня помилка сервера" });
  }
}

export async function deleteTelegramChannel(req: Request, res: Response) {
  try {
    const channelId = Number(req.params.id);
    if (!Number.isInteger(channelId)) {
      return res.status(400).json({ message: "Invalid channel id" });
    }

    await prisma.telegramChannel.update({
      where: { id: channelId },
      data: { deletedAt: new Date(), isActive: false },
    });

    return res.status(204).send();
  } catch (error) {
    console.error("deleteTelegramChannel error:", error);
    return res.status(500).json({ message: "Внутрішня помилка сервера" });
  }
}
