import * as ExcelJS from 'exceljs';
import { neutraliseFormula, toCsvBuffer, toXlsxBuffer } from './incident-export.format';

describe('neutraliseFormula', () => {
  it.each(['=SUM(A1)', '+1+1', '-2+3', '@cmd', '\tcmd'])('prefixes %j', (value) => {
    expect(neutraliseFormula(value)).toBe(`'${value}`);
  });

  it('leaves ordinary text untouched', () => {
    expect(neutraliseFormula('Printer is offline')).toBe('Printer is offline');
    expect(neutraliseFormula('INC-2026-000001')).toBe('INC-2026-000001');
  });
});

describe('toCsvBuffer', () => {
  const csv = toCsvBuffer(['Number', 'Title'], [['INC-2026-000001', 'Say "hi", please'], ['INC-2026-000002', '=HYPERLINK("x")']]).toString('utf8');

  it('starts with a BOM and quotes every cell, doubling embedded quotes', () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"Say ""hi"", please"');
  });

  it('neutralises formulas in data rows', () => {
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });
});

describe('toXlsxBuffer', () => {
  it('produces a workbook that round-trips headers and values, with formulas neutralised', async () => {
    const buffer = await toXlsxBuffer(['Number', 'Title'], [['INC-2026-000001', '=1+1'], ['INC-2026-000002', 'Ünïcode ✓']]);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer); // exceljs's Buffer typing predates @types/node 22+
    const sheet = workbook.getWorksheet('Incidents')!;

    expect(sheet.getRow(1).values).toEqual([undefined, 'Number', 'Title']);
    expect(sheet.getRow(2).getCell(2).value).toBe("'=1+1"); // stored as text, not a formula object
    expect(sheet.getRow(3).getCell(2).value).toBe('Ünïcode ✓');
  });
});
