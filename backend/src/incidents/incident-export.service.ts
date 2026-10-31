import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { AuthUser } from '../common/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { SlaConfigService } from '../sla/sla-config.service';
import { IncidentFilterDto } from './incidents.dto';
import { IncidentsService } from './incidents.service';
import { incidentSlaStatus } from './sla.calculator';

const MAX_ROWS = 50_000;
const COLUMNS = [
  'Number', 'Title', 'Company', 'Template', 'Priority', 'Stage', 'Reporter', 'Assignee',
  'Created (Asia/Colombo)', 'Response due', 'Resolution due', 'SLA status',
] as const;

const COLOMBO = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Colombo', dateStyle: 'short', timeStyle: 'medium' });

/**
 * Spreadsheet apps execute cells beginning with = + - @ as formulas. Reporter-controlled text such as
 * titles must therefore be neutralised before it lands in an export (CSV injection).
 */
export function neutraliseFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

@Injectable()
export class IncidentExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly incidents: IncidentsService,
    private readonly sla: SlaConfigService,
  ) {}

  /** FR-37. Uses the same visibility filter as the list, so an export can never expose more than the screen. */
  async export(user: AuthUser, filter: IncidentFilterDto, format: 'csv' | 'xlsx'): Promise<{ buffer: Buffer; mime: string; filename: string }> {
    const [rows, windows] = await Promise.all([
      this.prisma.incident.findMany({
        where: this.incidents.buildWhere(user, filter),
        orderBy: { createdAt: 'desc' },
        take: MAX_ROWS,
        include: {
          company: { select: { name: true } },
          template: { select: { name: true } },
          reporter: { select: { name: true } },
          assignee: { select: { name: true } },
        },
      }),
      this.sla.getAll(),
    ]);

    const now = new Date();
    const table = rows.map((r) => [
      r.number,
      r.title,
      r.company.name,
      r.template.name,
      r.priority,
      r.stage,
      r.reporter.name,
      r.assignee?.name ?? '',
      COLOMBO.format(r.createdAt),
      COLOMBO.format(r.responseDueAt),
      COLOMBO.format(r.resolutionDueAt),
      incidentSlaStatus(r, windows[r.priority], now),
    ].map((cell) => neutraliseFormula(String(cell))));

    const stamp = now.toISOString().slice(0, 10);
    if (format === 'csv') {
      const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
      const csv = [COLUMNS.map(escape).join(','), ...table.map((row) => row.map(escape).join(','))].join('\r\n');
      return { buffer: Buffer.from('﻿' + csv, 'utf8'), mime: 'text/csv; charset=utf-8', filename: `incidents-${stamp}.csv` };
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Incidents');
    sheet.addRow([...COLUMNS]).font = { bold: true };
    table.forEach((row) => sheet.addRow(row));
    sheet.columns.forEach((c) => (c.width = 22));
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    return { buffer, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename: `incidents-${stamp}.xlsx` };
  }
}
