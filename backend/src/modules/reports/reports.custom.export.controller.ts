import type { Request, Response } from "express";
import ExcelJS from "exceljs";
import { buildCustomReportPayload } from "./reports.custom.controller";

type CustomReportPayload = Awaited<ReturnType<typeof buildCustomReportPayload>>;
type CustomReportTable = CustomReportPayload["data"]["main"]["table"];
type CustomReportTableColumn = CustomReportTable["columns"][number];
type CustomReportTableRow = CustomReportTable["rows"][number];

type ExcelFill = ExcelJS.Fill;

type ChangeDirection = "up" | "down" | "flat";

const BORDER_THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};

const FILLS = {
  header: {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE2E8F0" },
  } as ExcelFill,
  title: {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0F172A" },
  } as ExcelFill,
  group: {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFCCFBF1" },
  } as ExcelFill,
  total: {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF8FAFC" },
  } as ExcelFill,
  max: {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFBAE6FD" },
  } as ExcelFill,
  min: {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFEF3C7" },
  } as ExcelFill,
  up: {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE0F2FE" },
  } as ExcelFill,
  down: {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFF7ED" },
  } as ExcelFill,
  flat: {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF1F5F9" },
  } as ExcelFill,
};

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

function buildPeriodLabel(params: { dateFrom: unknown; dateTo: unknown }) {
  return `${formatDateLabel(params.dateFrom)} — ${formatDateLabel(params.dateTo)}`;
}

function roundNumber(value: number) {
  return Math.round(value * 100) / 100;
}

function safeNumber(value: unknown) {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function safeSheetName(value: string) {
  return value.replace(/[\\/*?:[\]]/g, " ").slice(0, 31);
}

function getGroupModeLabel(groupMode: string) {
  return groupMode === "crew" ? "нарядах" : "містах";
}

function getComparableColumns(table: CustomReportTable) {
  return table.columns.filter((column) => column.key !== "total");
}

function getTableCellValue(row: CustomReportTableRow, columnKey: string) {
  return roundNumber(
    columnKey === "total"
      ? safeNumber(row.total)
      : safeNumber(row.groups[columnKey]),
  );
}

function getRowExtremes(
  row: CustomReportTableRow,
  columns: CustomReportTableColumn[],
) {
  const values = columns.map((column) => getTableCellValue(row, column.key));

  if (values.length < 2) {
    return null;
  }

  const max = Math.max(...values);
  const min = Math.min(...values);

  if (max === min) {
    return null;
  }

  return {
    max,
    min,
  };
}

function getChangePercent(main: number, compare: number) {
  if (compare === 0) {
    if (main === 0) return 0;
    return main > 0 ? 100 : -100;
  }

  return roundNumber(((main - compare) / compare) * 100);
}

function getChangeDirection(diff: number): ChangeDirection {
  if (diff > 0) return "up";
  if (diff < 0) return "down";
  return "flat";
}

function getChangeFill(direction: ChangeDirection) {
  if (direction === "up") return FILLS.up;
  if (direction === "down") return FILLS.down;
  return FILLS.flat;
}

function applyHeaderStyle(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };

  row.eachCell((cell) => {
    cell.fill = FILLS.header;
    cell.border = BORDER_THIN;
  });
}

function styleSheet(sheet: ExcelJS.Worksheet) {
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const headerRow = sheet.getRow(1);
  applyHeaderStyle(headerRow);

  sheet.columns.forEach((column) => {
    column.width = Math.max(column.width ?? 12, 14);
  });
}

function applyDataBorders(sheet: ExcelJS.Worksheet, fromRow = 1) {
  for (let rowNumber = fromRow; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);

    row.eachCell((cell) => {
      cell.border = BORDER_THIN;
      cell.alignment = {
        vertical: "middle",
        wrapText: true,
      };
    });
  }
}

function addMetaSheet(
  workbook: ExcelJS.Workbook,
  payload: CustomReportPayload,
) {
  const sheet = workbook.addWorksheet("Параметри");

  sheet.columns = [
    { header: "Параметр", key: "label", width: 34 },
    { header: "Значення", key: "value", width: 48 },
  ];

  sheet.addRow({
    label: "Основний період",
    value: buildPeriodLabel({
      dateFrom: payload.filters.dateFrom,
      dateTo: payload.filters.dateTo,
    }),
  });

  sheet.addRow({
    label: "Порівняльний період",
    value: payload.data.compare
      ? buildPeriodLabel({
          dateFrom: payload.filters.compareDateFrom,
          dateTo: payload.filters.compareDateTo,
        })
      : "Не вибрано",
  });

  sheet.addRow({
    label: "Групування",
    value: payload.filters.groupMode === "crew" ? "За нарядами" : "За містами",
  });

  sheet.addRow({
    label: "Місто",
    value: payload.filters.cityId
      ? `ID ${payload.filters.cityId}`
      : "Усі доступні міста",
  });

  sheet.addRow({
    label: "Показники",
    value: payload.filters.metrics.join(", "),
  });

  sheet.addRow({
    label: "Цілі поїздок",
    value: payload.filters.tripGoalIds.length
      ? payload.filters.tripGoalIds.join(", ")
      : "Не вибрано",
  });

  styleSheet(sheet);
}

function addReportTableSheet(params: {
  workbook: ExcelJS.Workbook;
  sheetName: string;
  title: string;
  periodLabel: string;
  table: CustomReportTable;
}) {
  const sheet = params.workbook.addWorksheet(safeSheetName(params.sheetName));
  const comparableColumns = getComparableColumns(params.table);

  sheet.addRow([params.title]);
  sheet.addRow(["Період", params.periodLabel]);
  sheet.addRow([
    "Підсвітка",
    "макс — найбільше значення у рядку, мін — найменше значення у рядку",
  ]);
  sheet.addRow([]);

  const header = [
    "Показник",
    ...params.table.columns.map((column) => column.label),
  ];

  sheet.addRow(header);

  for (const row of params.table.rows) {
    const excelRow = sheet.addRow([
      `${row.level > 0 ? `${"  ".repeat(row.level)}↳ ` : ""}${row.label}`,
      ...params.table.columns.map((column) =>
        getTableCellValue(row, column.key),
      ),
    ]);

    if (row.level > 0) {
      excelRow.getCell(1).font = {
        italic: true,
        color: { argb: "FF475569" },
      };
    }

    const extremes = getRowExtremes(row, comparableColumns);

    params.table.columns.forEach((column, index) => {
      const cell = excelRow.getCell(index + 2);
      const value = getTableCellValue(row, column.key);

      cell.numFmt = "#,##0.##";

      if (column.key === "total") {
        cell.fill = FILLS.total;
        cell.font = { bold: true };
        return;
      }

      if (!extremes) return;

      if (value === extremes.max) {
        cell.fill = FILLS.max;
        cell.font = { bold: true, color: { argb: "FF075985" } };
      }

      if (value === extremes.min) {
        cell.fill = FILLS.min;
        cell.font = { bold: true, color: { argb: "FF92400E" } };
      }
    });
  }

  sheet.getRow(1).font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = FILLS.title;
  sheet.getRow(5).height = 24;
  applyHeaderStyle(sheet.getRow(5));
  sheet.views = [{ state: "frozen", ySplit: 5 }];
  sheet.autoFilter = {
    from: { row: 5, column: 1 },
    to: { row: 5, column: header.length },
  };

  sheet.columns.forEach((column, index) => {
    column.width = index === 0 ? 34 : 17;
  });

  applyDataBorders(sheet, 5);

  return sheet;
}

function addDynamicsSheet(
  workbook: ExcelJS.Workbook,
  payload: CustomReportPayload,
) {
  if (!payload.data.compare) {
    return;
  }

  const mainTable = payload.data.main.table;
  const compareTable = payload.data.compare.table;
  const columns = getComparableColumns(mainTable);

  if (columns.length === 0) {
    return;
  }

  const compareRowsByKey = new Map(
    compareTable.rows.map((row) => [row.key, row]),
  );

  const sheet = workbook.addWorksheet(
    safeSheetName(
      `Динаміка по ${getGroupModeLabel(payload.filters.groupMode)}`,
    ),
  );

  sheet.addRow([`Динаміка по ${getGroupModeLabel(payload.filters.groupMode)}`]);
  sheet.addRow([
    "Основний період",
    buildPeriodLabel({
      dateFrom: payload.filters.dateFrom,
      dateTo: payload.filters.dateTo,
    }),
  ]);
  sheet.addRow([
    "Порівняльний період",
    buildPeriodLabel({
      dateFrom: payload.filters.compareDateFrom,
      dateTo: payload.filters.compareDateTo,
    }),
  ]);
  sheet.addRow([
    "Правило %",
    "Якщо в періоді порівняння було 0, а в основному періоді стало більше — показуємо +100%",
  ]);
  sheet.addRow([]);

  sheet.addRow([
    "Група",
    "Показник",
    "Основний період",
    "Порівняльний період",
    "Різниця",
    "Зміна %",
  ]);

  let rowNumber = 7;

  columns.forEach((column) => {
    const groupHeaderRow = sheet.addRow([column.label]);
    const groupHeaderNumber = groupHeaderRow.number;

    sheet.mergeCells(groupHeaderNumber, 1, groupHeaderNumber, 6);
    groupHeaderRow.height = 22;
    groupHeaderRow.font = { bold: true, size: 12, color: { argb: "FF0F766E" } };
    groupHeaderRow.fill = FILLS.group;
    groupHeaderRow.alignment = { vertical: "middle" };

    groupHeaderRow.eachCell((cell) => {
      cell.border = {
        top: { style: "medium", color: { argb: "FF0F766E" } },
        left: { style: "thin" },
        bottom: { style: "thin", color: { argb: "FF0F766E" } },
        right: { style: "thin" },
      };
    });

    rowNumber += 1;

    mainTable.rows.forEach((row) => {
      const compareRow = compareRowsByKey.get(row.key);
      const main = getTableCellValue(row, column.key);
      const compare = compareRow
        ? getTableCellValue(compareRow, column.key)
        : 0;
      const diff = roundNumber(main - compare);
      const percent = getChangePercent(main, compare);
      const direction = getChangeDirection(diff);

      const excelRow = sheet.addRow([
        rowNumber === groupHeaderNumber + 1 ? column.label : "",
        `${row.level > 0 ? `${"  ".repeat(row.level)}↳ ` : ""}${row.label}`,
        main,
        compare,
        diff,
        percent / 100,
      ]);

      excelRow.getCell(2).alignment = {
        indent: row.level,
        vertical: "middle",
      };

      [3, 4].forEach((cellNumber) => {
        excelRow.getCell(cellNumber).numFmt = "#,##0.##";
      });

      excelRow.getCell(5).numFmt = "+#,##0.##;-#,##0.##;0";
      excelRow.getCell(6).numFmt = "+0.00%;-0.00%;0.00%";
      excelRow.getCell(5).fill = getChangeFill(direction);
      excelRow.getCell(6).fill = getChangeFill(direction);

      if (direction === "up") {
        excelRow.getCell(5).font = { bold: true, color: { argb: "FF075985" } };
        excelRow.getCell(6).font = { bold: true, color: { argb: "FF075985" } };
      }

      if (direction === "down") {
        excelRow.getCell(5).font = { bold: true, color: { argb: "FFB45309" } };
        excelRow.getCell(6).font = { bold: true, color: { argb: "FFB45309" } };
      }

      if (row.level > 0) {
        excelRow.getCell(2).font = {
          italic: true,
          color: { argb: "FF475569" },
        };
      }

      rowNumber += 1;
    });
  });

  sheet.getRow(1).font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = FILLS.title;
  applyHeaderStyle(sheet.getRow(6));
  sheet.views = [{ state: "frozen", ySplit: 6 }];
  sheet.autoFilter = {
    from: { row: 6, column: 1 },
    to: { row: 6, column: 6 },
  };

  sheet.columns = [
    { key: "group", width: 26 },
    { key: "metric", width: 34 },
    { key: "main", width: 18 },
    { key: "compare", width: 20 },
    { key: "diff", width: 16 },
    { key: "percent", width: 16 },
  ];

  applyDataBorders(sheet, 6);
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
    { header: "Період порівняння", key: "compare", width: 20 },
    { header: "Різниця", key: "diff", width: 16 },
    { header: "Зміна %", key: "percent", width: 16 },
  ];

  payload.data.charts.periodComparison
    .filter((row) => row.compare !== null)
    .forEach((row) => {
      const compare = safeNumber(row.compare);
      const main = safeNumber(row.main);
      const diff = roundNumber(main - compare);
      const percent = getChangePercent(main, compare);
      const direction = getChangeDirection(diff);
      const excelRow = sheet.addRow({
        label: row.label,
        main: roundNumber(main),
        compare: roundNumber(compare),
        diff,
        percent: percent / 100,
      });

      excelRow.getCell("diff").numFmt = "+#,##0.##;-#,##0.##;0";
      excelRow.getCell("percent").numFmt = "+0.00%;-0.00%;0.00%";
      excelRow.getCell("diff").fill = getChangeFill(direction);
      excelRow.getCell("percent").fill = getChangeFill(direction);
      excelRow.getCell("diff").font = { bold: true };
      excelRow.getCell("percent").font = { bold: true };
    });

  styleSheet(sheet);
}

function addAdditionalReasonsSheet(
  workbook: ExcelJS.Workbook,
  payload: CustomReportPayload,
) {
  const sheet = workbook.addWorksheet("Причини доп. спрацювань");

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
  const sheet = workbook.addWorksheet("Спрацювання по групах");

  sheet.columns = [
    { header: "Група", key: "name", width: 28 },
    { header: "Усього спрацювань", key: "totalAlarms", width: 20 },
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

    workbook.creator = "Route Master";
    workbook.created = new Date();

    addMetaSheet(workbook, payload);

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

      addDynamicsSheet(workbook, payload);
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
            : "Недостатньо прав для вибраного міста",
      });
    }

    console.error("exportCustomReportExcel error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}
