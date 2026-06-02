import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging, type MulticastMessage } from "firebase-admin/messaging";
import { prisma } from "../config/prisma";

type PushDeviceToken = {
  mobileUserId: number;
  token: string;
};

type SendNotificationPushParams = {
  notificationId: number;
  title: string;
  message: string;
  tokens: PushDeviceToken[];
};

function isPushEnabled() {
  return process.env.PUSH_ENABLED === "true";
}

function truncatePushBody(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");

  if (normalized.length <= 160) {
    return normalized;
  }

  return `${normalized.slice(0, 157)}...`;
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function ensureFirebaseInitialized() {
  if (getApps().length > 0) {
    return;
  }

  initializeApp({
    credential: applicationDefault(),
    ...(process.env.FIREBASE_PROJECT_ID
      ? { projectId: process.env.FIREBASE_PROJECT_ID }
      : {}),
  });
}

function isInvalidTokenError(code: string | undefined) {
  return (
    code === "messaging/registration-token-not-registered" ||
    code === "messaging/invalid-registration-token"
  );
}

export async function sendNotificationPush(params: SendNotificationPushParams) {
  const uniqueTokens = Array.from(
    new Map(
      params.tokens
        .map((item) => ({
          mobileUserId: item.mobileUserId,
          token: item.token.trim(),
        }))
        .filter((item) => item.token)
        .map((item) => [item.token, item]),
    ).values(),
  );

  if (!isPushEnabled()) {
    return {
      enabled: false,
      tokensCount: uniqueTokens.length,
      successCount: 0,
      failureCount: 0,
      removedInvalidTokens: 0,
      message: "Push disabled",
    };
  }

  if (uniqueTokens.length === 0) {
    return {
      enabled: true,
      tokensCount: 0,
      successCount: 0,
      failureCount: 0,
      removedInvalidTokens: 0,
      message: "No device tokens",
    };
  }

  try {
    ensureFirebaseInitialized();

    let successCount = 0;
    let failureCount = 0;
    const invalidTokens: string[] = [];
    const errorCodes = new Set<string>();
    for (const chunk of chunkArray(uniqueTokens, 500)) {
      const message: MulticastMessage = {
        tokens: chunk.map((item) => item.token),
        notification: {
          title: params.title || "Нове повідомлення",
          body: truncatePushBody(params.message),
        },
        data: {
          type: "notification",
          notificationId: String(params.notificationId),
        },
        android: {
          priority: "high",
          notification: {
            channelId: "guard_notifications",
            clickAction: "OPEN_NOTIFICATION",
          },
        },
      };

      const response = await getMessaging().sendEachForMulticast(message);

      successCount += response.successCount;
      failureCount += response.failureCount;

      response.responses.forEach((item, index) => {
        if (!item.success) {
          if (item.error?.code) {
            errorCodes.add(item.error.code);
          }
          console.error("FCM token send error:", {
            mobileUserId: chunk[index].mobileUserId,
            tokenStart: `${chunk[index].token.slice(0, 12)}...`,
            code: item.error?.code,
            message: item.error?.message,
          });
        }
      
        if (!item.success && isInvalidTokenError(item.error?.code)) {
          invalidTokens.push(chunk[index].token);
          
        }
      });
    }

    if (invalidTokens.length > 0) {
      await prisma.mobileDeviceToken.deleteMany({
        where: {
          token: {
            in: invalidTokens,
          },
        },
      });
    }

    return {
      enabled: true,
      tokensCount: uniqueTokens.length,
      successCount,
      failureCount,
      removedInvalidTokens: invalidTokens.length,
      message:
        errorCodes.size > 0
          ? `Push processed: ${Array.from(errorCodes).join(", ")}`
          : "Push processed",
    };
  } catch (error) {
    console.error("sendNotificationPush error:", error);

    return {
      enabled: true,
      tokensCount: uniqueTokens.length,
      successCount: 0,
      failureCount: uniqueTokens.length,
      removedInvalidTokens: 0,
      message: "Push failed",
    };
  }
}