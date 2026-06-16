import type { Request, Response } from "express";
import ExcelJS from "exceljs";
import { buildCustomReportPayload } from "./reports.custom.controller";

type CustomReportPayload = Awaited<ReturnType<typeof buildCustomReportPayload>>;

function formatDateLabel(value: unknown) {
  if (!value) {
    return "—";
  }

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString("uk-UA");
}

function buildPeriodLabel(params: {
  dateFrom: unknown;
  dateTo: unknown;
}) {
  return `${formatDateLabel(params.dateFrom)} — ${formatDateLabel(params.dateTo)}`;
}

function roundNumber(value: number) {
  return Math.round(value * 100) / 100;
}

function styleSheet(sheet: ExcelJS.Worksheet) {
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };

  headerRow.eachCell((cell) => {
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  });

  sheet.columns.forEach((column) => {
    column.width = Math.max(column.width ?? 12, 14);
  });
}

function safeSheetName(value: string) {
  return value.replace(/[\\/*?:[\]]/g, " ").slice(0, 31);
}

function addReportTableSheet(params: {
  workbook: ExcelJS.Workbook;
  sheetName: string;
  title: string;
  periodLabel: string;
  table: CustomReportPayload["data"]["main"]["table"];
}) {
  const sheet = params.workbook.addWorksheet(safeSheetName(params.sheetName));

  sheet.addRow([params.title]);
  sheet.addRow(["Період", params.periodLabel]);
  sheet.addRow([]);

  const header = [
    "Показник",
    ...params.table.columns.map((column) => column.label),
  ];

  sheet.addRow(header);

  for (const row of params.table.rows) {
    sheet.addRow([
      `${row.level > 0 ? "  ↳ " : ""}${row.label}`,
      ...params.table.columns.map((column) =>
        roundNumber(
          column.key === "total" ? row.total : row.groups[column.key] ?? 0,
        ),
      ),
    ]);
  }

  sheet.getRow(1).font = { bold: true, size: 14 };
  sheet.getRow(4).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 4 }];

  const headerRow = sheet.getRow(4);
  headerRow.alignment = { vertical: "middle", horizontal: "center" };

  headerRow.eachCell((cell) => {
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  });

  sheet.columns.forEach((column, index) => {
    column.width = index === 0 ? 32 : 16;
  });

  return sheet;
}

function addPeriodComparisonSheet(
  workbook: ExcelJS.Workbook,
  payload: CustomReportPayload,
) {
  if (!payload.data.compare) {
    return;
  }

  const sheet = workbook.addWorksheet("Порівняння періодів");

  sheet.columns = [
    { header: "Показник", key: "label", width: 30 },
    { header: "Основний період", key: "main", width: 18 },
    { header: "Період порівняння", key: "compare", width: 18 },
    { header: "Різниця", key: "diff", width: 16 },
  ];

  payload.data.charts.periodComparison
    .filter((row) => row.compare !== null)
    .forEach((row) => {
      const compare = row.compare ?? 0;

      sheet.addRow({
        label: row.label,
        main: roundNumber(row.main),
        compare: roundNumber(compare),
        diff: roundNumber(row.main - compare),
      });
    });

  styleSheet(sheet);
}

function addAdditionalReasonsSheet(
  workbook: ExcelJS.Workbook,
  payload: CustomReportPayload,
) {
  const sheet = workbook.addWorksheet("Дод. спрацювання");

  sheet.columns = [
    { header: "Причина", key: "reasonName", width: 36 },
    { header: "Усього", key: "total", width: 14 },
  ];

  payload.data.charts.additionalReasons.forEach((row) => {
    sheet.addRow({
      reasonName: row.reasonName,
      total: roundNumber(row.total),
    });
  });

  styleSheet(sheet);
}

function addAlarmGroupsSheet(
  workbook: ExcelJS.Workbook,
  payload: CustomReportPayload,
) {
  const sheet = workbook.addWorksheet("Спрацювання за групами");

  sheet.columns = [
    { header: "Група", key: "name", width: 28 },
    { header: "Усього спрацювань", key: "totalAlarms", width: 18 },
    { header: "Хибні", key: "falseTotal", width: 14 },
    { header: "Бойові", key: "combatTotal", width: 14 },
    { header: "Додаткові", key: "additionalTotal", width: 18 },
    { header: "Зміни", key: "totalShifts", width: 14 },
  ];

  payload.data.charts.byGroups.forEach((group) => {
    sheet.addRow({
      name: group.name,
      totalAlarms: roundNumber(group.totalAlarms),
      falseTotal: roundNumber(group.falseTotal),
      combatTotal: roundNumber(group.combatTotal),
      additionalTotal: roundNumber(group.additionalTotal),
      totalShifts: roundNumber(group.totalShifts),
    });
  });

  styleSheet(sheet);
}

export async function exportCustomReportExcel(req: Request, res: Response) {
  try {
    const payload = await buildCustomReportPayload(req);

    const workbook = new ExcelJS.Workbook();

    workbook.creator = "Guard Journal";
    workbook.created = new Date();

    addReportTableSheet({
      workbook,
      sheetName: "Основний звіт",
      title: "Основний звіт",
      periodLabel: buildPeriodLabel({
        dateFrom: payload.filters.dateFrom,
        dateTo: payload.filters.dateTo,
      }),
      table: payload.data.main.table,
    });

    if (payload.data.compare) {
      addReportTableSheet({
        workbook,
        sheetName: "Порівняльний звіт",
        title: "Порівняльний звіт",
        periodLabel: buildPeriodLabel({
          dateFrom: payload.filters.compareDateFrom,
          dateTo: payload.filters.compareDateTo,
        }),
        table: payload.data.compare.table,
      });

      addPeriodComparisonSheet(workbook, payload);
    }

    addAlarmGroupsSheet(workbook, payload);
    addAdditionalReasonsSheet(workbook, payload);

    const from = formatDateLabel(payload.filters.dateFrom).replace(/\./g, "-");
    const to = formatDateLabel(payload.filters.dateTo).replace(/\./g, "-");
    const fileName = `custom-report-${from}-${to}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    const statusCode =
      error instanceof Error && "statusCode" in error
        ? Number((error as Error & { statusCode?: number }).statusCode)
        : 500;

    if (statusCode === 403) {
      return res.status(403).json({
        message:
          error instanceof Error
            ? error.message
            : "Недостатньо прав для обраного міста",
      });
    }

    console.error("exportCustomReportExcel error:", error);

    return res.status(500).json({
      message: "Внутрішня помилка сервера",
    });
  }
}
