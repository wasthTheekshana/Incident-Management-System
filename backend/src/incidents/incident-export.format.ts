import * as ExcelJS from 'exceljs';

/**
 * Spreadsheet apps execute cells beginning with = + - @ as formulas. Reporter-controlled text such as
 * titles must therefore be neutralised before it lands in an export (CSV injection).
 */
export function neutraliseFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

const safeRows = (rows: string[][]): string[][] => rows.map((row) => row.map(neutraliseFormula));

/** UTF-8 with BOM so Excel opens non-ASCII text correctly. */
export function toCsvBuffer(columns: readonly string[], rows: string[][]): Buffer {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [columns.map(escape).join(','), ...safeRows(rows).map((row) => row.map(escape).join(','))];
  return Buffer.from('﻿' + lines.join('\r\n'), 'utf8');
}

export async function toXlsxBuffer(columns: readonly string[], rows: string[][], sheetName = 'Incidents'): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.addRow([...columns]).font = { bold: true };
  // Values are written as plain strings so a cell can never be interpreted as a formula by ExcelJS either.
  safeRows(rows).forEach((row) => sheet.addRow(row));
  sheet.columns.forEach((c) => (c.width = 22));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
