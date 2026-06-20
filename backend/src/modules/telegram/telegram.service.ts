import { prisma } from "../../config/prisma";

type ShiftWithTelegram = Awaited<ReturnType<typeof getShiftForTelegram>>;
type PostDutyWithTelegram = Awaited<ReturnType<typeof getPostDutyForTelegram>>;

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDateTime(value: Date) {
  // Мобільний застосунок передає вибраний користувачем локальний час як ISO з Z:
  // 2026-06-19T10:33:00.000Z. У БД це зберігається як UTC-Date, але для
  // звіту потрібно показати саме введений у застосунку час 10:33, без
  // додавання +3 години таймзони Europe/Kyiv. Тому форматируем як UTC-clock.
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(value);
}

function formatNumber(value: unknown, maximumFractionDigits = 2) {
  const numberValue = Number(value ?? 0);

  return numberValue.toLocaleString("uk-UA", {
    maximumFractionDigits,
  });
}

function formatDistance(value: unknown) {
  return `${formatNumber(value)} км`;
}

function maskToken(token: string) {
  if (!token) return "";
  if (token.length <= 12) return `${token.slice(0, 4)}********`;

  return `${token.slice(0, 8)}********${token.slice(-4)}`;
}

export function toTelegramBotDto(bot: any) {
  return {
    ...bot,
    token: undefined,
    tokenMasked: maskToken(bot.token),
  };
}

async function sendTelegramMessage(params: {
  token: string;
  chatId: string;
  text: string;
}) {
  const response = await fetch(
    `https://api.telegram.org/bot${params.token}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: params.chatId,
        text: params.text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    }
  );

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.description || "Telegram sendMessage failed");
  }

  return payload.result as { message_id?: number | string };
}

async function getShiftForTelegram(shiftId: number) {
  return prisma.shift.findUnique({
    where: { id: shiftId },
    include: {
      city: { select: { id: true, name: true } },
      department: { select: { id: true, name: true, type: true } },
      crew: {
        include: {
          telegramChannel: {
            include: { bot: true },
          },
          telegramChannels: {
            include: {
              channel: {
                include: { bot: true },
              },
            },
          },
        },
      },
      vehicle: { select: { id: true, title: true, licensePlate: true } },
      driverEmployee: { select: { id: true, fullName: true } },
      seniorEmployee: { select: { id: true, fullName: true } },
      trips: {
        orderBy: { departureTime: "asc" },
        include: {
          goal: { select: { id: true, name: true, systemCode: true } },
          events: {
            include: {
              reason: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });
}

async function getPostDutyForTelegram(postDutyId: number) {
  return prisma.postDuty.findUnique({
    where: { id: postDutyId },
    include: {
      city: { select: { id: true, name: true } },
      department: { select: { id: true, name: true, type: true } },
      post: {
        include: {
          telegramChannel: {
            include: { bot: true },
          },
          telegramChannels: {
            include: {
              channel: {
                include: { bot: true },
              },
            },
          },
        },
      },
      vehicle: { select: { id: true, title: true, licensePlate: true } },
      members: {
        orderBy: { id: "asc" },
        include: {
          employee: { select: { id: true, fullName: true } },
        },
      },
    },
  });
}

type BreakdownTotals = {
  total: number;
  oh: number;
  partner: number;
};

type AlarmReasonTotals = BreakdownTotals & {
  label: string;
};

function createBreakdownTotals(): BreakdownTotals {
  return {
    total: 0,
    oh: 0,
    partner: 0,
  };
}

function addBreakdown(target: BreakdownTotals, total = 0, oh = 0, partner = 0) {
  target.total += total;
  target.oh += oh;
  target.partner += partner;
}

function getRegularAlarmBreakdown(event: any) {
  if (event.alarmSource === "OH") {
    return { oh: 1, partner: 0 };
  }

  if (event.alarmSource === "PARTNER") {
    return { oh: 0, partner: 1 };
  }

  return { oh: 0, partner: 0 };
}

function splitCountByAlarmCounts(total: number, ohCount: number, partnerCount: number) {
  if (!total) {
    return { oh: 0, partner: 0 };
  }

  const alarmTotal = ohCount + partnerCount;

  if (alarmTotal <= 0) {
    return { oh: 0, partner: 0 };
  }

  const oh = Math.round((total * ohCount) / alarmTotal);

  return {
    oh,
    partner: total - oh,
  };
}

function formatWithBreakdown(value: unknown, breakdown?: Pick<BreakdownTotals, "oh" | "partner">) {
  return `${formatNumber(value)} (${formatNumber(breakdown?.oh ?? 0)}/${formatNumber(
    breakdown?.partner ?? 0,
  )})`;
}

function buildShiftSummary(trips: NonNullable<ShiftWithTelegram>["trips"]) {
  const falseAlarms = createBreakdownTotals();
  const combatAlarms = createBreakdownTotals();
  const additionalAlarms = createBreakdownTotals();
  const detainedTotals = createBreakdownTotals();
  const transferredTotals = createBreakdownTotals();
  const additionalReasonMap = new Map<string, AlarmReasonTotals>();

  for (const trip of trips) {
    for (const event of trip.events) {
      if (event.eventCategory === "REGULAR_ALARM") {
        const source = getRegularAlarmBreakdown(event);

        if (event.isCombat) {
          addBreakdown(combatAlarms, 1, source.oh, source.partner);
        } else {
          addBreakdown(falseAlarms, 1, source.oh, source.partner);
        }

        const detainedCount = event.detainedCount ?? 0;
        const transferredCount = event.transferredCount ?? 0;

        addBreakdown(
          detainedTotals,
          detainedCount,
          source.oh ? detainedCount : 0,
          source.partner ? detainedCount : 0,
        );

        addBreakdown(
          transferredTotals,
          transferredCount,
          source.oh ? transferredCount : 0,
          source.partner ? transferredCount : 0,
        );
      }

      if (event.eventCategory === "ADDITIONAL_ALARM") {
        const oh = event.ohCount ?? 0;
        const partner = event.partnerCount ?? 0;
        const total = oh + partner;

        addBreakdown(additionalAlarms, total, oh, partner);

        const label = event.reason?.name || event.customReasonText || "Без причини";
        const current = additionalReasonMap.get(label) ?? {
          label,
          total: 0,
          oh: 0,
          partner: 0,
        };

        addBreakdown(current, total, oh, partner);
        additionalReasonMap.set(label, current);

        const detainedCount = event.detainedCount ?? 0;
        const transferredCount = event.transferredCount ?? 0;
        const detainedSplit = splitCountByAlarmCounts(detainedCount, oh, partner);
        const transferredSplit = splitCountByAlarmCounts(transferredCount, oh, partner);

        addBreakdown(
          detainedTotals,
          detainedCount,
          detainedSplit.oh,
          detainedSplit.partner,
        );

        addBreakdown(
          transferredTotals,
          transferredCount,
          transferredSplit.oh,
          transferredSplit.partner,
        );
      }
    }
  }

  const totalAlarms = {
    total: falseAlarms.total + combatAlarms.total + additionalAlarms.total,
    oh: falseAlarms.oh + combatAlarms.oh + additionalAlarms.oh,
    partner: falseAlarms.partner + combatAlarms.partner + additionalAlarms.partner,
  };

  return {
    totalAlarms,
    falseAlarms,
    combatAlarms,
    additionalAlarms,
    additionalReasons: Array.from(additionalReasonMap.values()).sort((a, b) =>
      a.label.localeCompare(b.label, "uk")
    ),
    detained: detainedTotals,
    transferred: transferredTotals,
  };
}

function buildShiftReportText(shift: NonNullable<ShiftWithTelegram>) {
  const summary = buildShiftSummary(shift.trips);
  const vehicleLabel = `${shift.vehicle.title}${
    shift.vehicle.licensePlate ? ` · ${shift.vehicle.licensePlate}` : ""
  }`;

  const additionalReasonLines = summary.additionalReasons.length
    ? summary.additionalReasons
        .map((reason) => `     ${escapeHtml(reason.label)}: ${formatWithBreakdown(reason.total, reason)}`)
        .join("\n")
    : "     —";

    return [
      "✅ <b>Звіт наряду ГШР</b>",
      "",
    
      `📍 <b>Місто:</b> ${escapeHtml(shift.city.name)}`,
      `🏢 <b>Підрозділ:</b> ${escapeHtml(shift.department?.name || "—")}`,
      `👥 <b>Наряд:</b> ${escapeHtml(shift.crew.name)}`,
      `📅 <b>Дата зміни:</b> ${formatDateTime(shift.shiftDate)}`,
      `🚓 <b>Авто:</b> ${escapeHtml(vehicleLabel)}`,
    
      "",
      "👤 <b>Екіпаж:</b>",
      `🚗 Водій: ${escapeHtml(shift.driverEmployee.fullName)}${shift.driverHasWeapon ? "☑️" : "✖️"}`,
      `🧑‍✈️ Старший: ${escapeHtml(shift.seniorEmployee.fullName)}${shift.seniorHasWeapon ? "☑️" : "✖️"}`,
    
      "",
      "📊 <b>Пробіг:</b>",
      `🟢 Початок: ${formatNumber(shift.odometerStart)}`,
      `🔴 Кінець: ${formatNumber(shift.odometerEndCalculated)}`,
      `📏 За добу: ${formatDistance(shift.totalDistanceKm)}`,
    
      "",
      `🚶 <b>Поїздок:</b> ${formatNumber(shift.trips.length)}`,
    
      "",
      `🚨 <b>Спрацювань:</b> ${formatWithBreakdown(summary.totalAlarms.total, summary.totalAlarms)}`,
      `   ⚠️ хибних: ${formatWithBreakdown(summary.falseAlarms.total, summary.falseAlarms)}`,
      `   🔥 бойових: ${formatWithBreakdown(summary.combatAlarms.total, summary.combatAlarms)}`,
      `   ➕ додатково: ${formatWithBreakdown(summary.additionalAlarms.total, summary.additionalAlarms)}`,
      additionalReasonLines,
    
      "",
      `⛓️ <b>Затримано:</b> ${formatWithBreakdown(summary.detained.total, summary.detained)}`,
      `👮 передано до поліції: ${formatWithBreakdown(summary.transferred.total, summary.transferred)}`,
    ].join("\n");
}

function buildPostDutyReportText(duty: NonNullable<PostDutyWithTelegram>) {
  const vehicleLabel = duty.vehicle
    ? `${duty.vehicle.title}${duty.vehicle.licensePlate ? ` · ${duty.vehicle.licensePlate}` : ""}`
    : "Без автомобіля";

  const membersText = duty.members.length
    ? duty.members
        .map((member) => {
          const details = [
            member.hasWeapon ? "☑️" : "✖️",
            member.isDriver ? "🚗 водій" : "",
            member.comment || "",
          ].filter(Boolean);

          return `• ${escapeHtml(member.employee.fullName)}${
            details.length ? ` · ${escapeHtml(details.join(" · "))}` : ""
          }`;
        })
        .join("\n")
    : "—";

  return [
    "📌 <b>Звіт поста</b>",
    "",

    `📍 <b>Місто:</b> ${escapeHtml(duty.city.name)}`,
    `🏢 <b>Підрозділ:</b> ${escapeHtml(duty.department?.name || "—")}`,
    `🛡️ <b>Пост:</b> ${escapeHtml(duty.post.name)}`,
    `📅 <b>Дата:</b> ${formatDateTime(duty.dutyDate)}`,

    "",
    "⏱️ <b>Час служби:</b>",
    `🕒 Тривалість: ${formatNumber(duty.durationHours)} год`,
    `📆 Еквівалент зміни: ${formatNumber(Number(duty.durationHours) / 24)}`,

    "",
    "👥 <b>Співробітники:</b>",
    membersText,

    "",
    `🚓 <b>Авто:</b> ${escapeHtml(vehicleLabel)}`,
    `📝 <b>Коментар:</b> ${escapeHtml(duty.note || "—")}`,
  ].join("\n");
}
async function saveReportLog(params: {
  reportType: "SHIFT" | "POST_DUTY";
  entityId: number;
  channelId?: number | null;
  chatId: string;
  status: "SENT" | "ERROR" | "SKIPPED";
  messageId?: string | number | null;
  errorMessage?: string | null;
}) {
  await prisma.telegramReportLog.create({
    data: {
      reportType: params.reportType,
      entityId: params.entityId,
      channelId: params.channelId ?? null,
      telegramChatId: params.chatId,
      status: params.status,
      messageId: params.messageId ? String(params.messageId) : null,
      errorMessage: params.errorMessage ?? null,
    },
  });
}

function getUniqueTelegramChannels(
  links: Array<{ channel: any }>,
  fallbackChannel?: any | null
) {
  const channelsById = new Map<number, any>();

  for (const link of links) {
    if (link.channel?.id) {
      channelsById.set(link.channel.id, link.channel);
    }
  }

  // Совместимость со старым одиночным каналом: если связи ещё не созданы,
  // но в старом поле telegramChannelId что-то есть — тоже отправим туда.
  if (fallbackChannel?.id && channelsById.size === 0) {
    channelsById.set(fallbackChannel.id, fallbackChannel);
  }

  return Array.from(channelsById.values());
}

async function sendReportToChannels(params: {
  reportType: "SHIFT" | "POST_DUTY";
  entityId: number;
  channels: any[];
  text: string;
}) {
  for (const channel of params.channels) {
    try {
      if (!channel.isActive || channel.deletedAt || !channel.bot?.isActive || channel.bot?.deletedAt) {
        await saveReportLog({
          reportType: params.reportType,
          entityId: params.entityId,
          channelId: channel.id,
          chatId: channel.chatId,
          status: "SKIPPED",
          errorMessage: "Telegram channel or bot is inactive",
        });
        continue;
      }

      const result = await sendTelegramMessage({
        token: channel.bot.token,
        chatId: channel.chatId,
        text: params.text,
      });

      await saveReportLog({
        reportType: params.reportType,
        entityId: params.entityId,
        channelId: channel.id,
        chatId: channel.chatId,
        status: "SENT",
        messageId: result.message_id,
      });
    } catch (error) {
      console.error("sendReportToChannels error:", error);

      await saveReportLog({
        reportType: params.reportType,
        entityId: params.entityId,
        channelId: channel.id,
        chatId: channel.chatId,
        status: "ERROR",
        errorMessage: error instanceof Error ? error.message : "Unknown Telegram error",
      }).catch(() => undefined);
    }
  }
}

export async function sendTelegramShiftReport(shiftId: number) {
  try {
    const shift = await getShiftForTelegram(shiftId);

    if (!shift || !shift.crew.telegramEnabled) {
      return;
    }

    const channels = getUniqueTelegramChannels(
      shift.crew.telegramChannels,
      shift.crew.telegramChannel
    );

    if (channels.length === 0) {
      return;
    }

    await sendReportToChannels({
      reportType: "SHIFT",
      entityId: shift.id,
      channels,
      text: buildShiftReportText(shift),
    });
  } catch (error) {
    console.error("sendTelegramShiftReport error:", error);

    await saveReportLog({
      reportType: "SHIFT",
      entityId: shiftId,
      chatId: "",
      status: "ERROR",
      errorMessage: error instanceof Error ? error.message : "Unknown Telegram error",
    }).catch(() => undefined);
  }
}

export async function sendTelegramPostDutyReport(postDutyId: number) {
  try {
    const duty = await getPostDutyForTelegram(postDutyId);

    if (!duty || !duty.post.telegramEnabled) {
      return;
    }

    const channels = getUniqueTelegramChannels(
      duty.post.telegramChannels,
      duty.post.telegramChannel
    );

    if (channels.length === 0) {
      return;
    }

    await sendReportToChannels({
      reportType: "POST_DUTY",
      entityId: duty.id,
      channels,
      text: buildPostDutyReportText(duty),
    });
  } catch (error) {
    console.error("sendTelegramPostDutyReport error:", error);

    await saveReportLog({
      reportType: "POST_DUTY",
      entityId: postDutyId,
      chatId: "",
      status: "ERROR",
      errorMessage: error instanceof Error ? error.message : "Unknown Telegram error",
    }).catch(() => undefined);
  }
}
