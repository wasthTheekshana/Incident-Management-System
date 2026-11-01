import { Injectable } from '@nestjs/common';
import { Prisma, Priority, Stage } from '@prisma/client';
import { AccessPolicy } from '../common/access-policy.service';
import { AuthUser } from '../common/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { SlaConfigService } from '../sla/sla-config.service';
import { averageMinutes, buildTrend, slaCompliance, topCounts } from './dashboard.calculator';
import { incidentSlaStatus } from './sla.calculator';

const OPEN_STAGES: Stage[] = [Stage.NEW, Stage.ASSIGNED, Stage.IN_PROGRESS, Stage.PENDING];
const DAY_MS = 86_400_000;
const ATTENTION_LIMIT = 8;

const SELECT = {
  id: true,
  number: true,
  title: true,
  priority: true,
  stage: true,
  companyId: true,
  templateId: true,
  assigneeId: true,
  rootCauseId: true,
  createdAt: true,
  respondedAt: true,
  resolvedAt: true,
  pausedAt: true,
  responseDueAt: true,
  resolutionDueAt: true,
  slaPausedMinutes: true,
} satisfies Prisma.IncidentSelect;

const nameMap = (list: { id: string; name: string }[]) => new Map(list.map((x) => [x.id, x.name]));

function countBy<T>(items: T[], key: (item: T) => string | null): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    if (k) map.set(k, (map.get(k) ?? 0) + 1);
  }
  return map;
}

/** Read-only analytics for Super Admin / Admin, scoped through the same AccessPolicy as every other query. */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessPolicy,
    private readonly slaConfig: SlaConfigService,
  ) {}

  async build(user: AuthUser, days: number, companyId?: string) {
    if (companyId) this.access.assertCompanyAccess(user, companyId);
    const now = new Date();
    const since = new Date(now.getTime() - days * DAY_MS);
    const previousSince = new Date(since.getTime() - days * DAY_MS);

    const scope: Prisma.IncidentWhereInput = {
      AND: [this.access.incidentWhere(user), companyId ? { companyId } : {}],
    };
    // Everything currently open, plus whatever was created or resolved in this or the previous period.
    const rows = await this.prisma.incident.findMany({
      where: {
        AND: [
          scope,
          {
            OR: [
              { stage: { in: OPEN_STAGES } },
              { createdAt: { gte: previousSince } },
              { resolvedAt: { gte: since } },
            ],
          },
        ],
      },
      select: SELECT,
    });

    const windows = await this.slaConfig.getAll();
    const open = rows.filter((r) => OPEN_STAGES.includes(r.stage));
    const openWithSla = open.map((r) => ({ ...r, slaStatus: incidentSlaStatus(r, windows[r.priority], now) }));
    const inPeriod = rows.filter((r) => r.createdAt >= since);
    const resolvedInPeriod = rows.filter(
      (r): r is typeof r & { resolvedAt: Date } => r.resolvedAt !== null && r.resolvedAt >= since,
    );

    const [companies, templates, rootCauses, users] = await Promise.all([
      this.prisma.company.findMany({ where: this.access.companyWhere(user), select: { id: true, name: true } }),
      this.prisma.incidentTemplate.findMany({ select: { id: true, name: true } }),
      this.prisma.rootCause.findMany({ select: { id: true, name: true } }),
      this.prisma.user.findMany({ select: { id: true, name: true } }),
    ]);
    const companyNames = nameMap(companies);
    const templateNames = nameMap(templates);
    const rootCauseNames = nameMap(rootCauses);
    const userNames = nameMap(users);

    const byStage = Object.fromEntries(Object.values(Stage).map((s) => [s, 0])) as Record<Stage, number>;
    const openByPriority = Object.fromEntries(Object.values(Priority).map((p) => [p, 0])) as Record<Priority, number>;
    for (const r of open) {
      byStage[r.stage] += 1;
      openByPriority[r.priority] += 1;
    }
    // Resolved and Closed count what reached that stage within the period, so the bar reflects current activity.
    for (const r of resolvedInPeriod) if (!OPEN_STAGES.includes(r.stage)) byStage[r.stage] += 1;

    const workload = new Map<string, { open: number; breached: number }>();
    for (const r of openWithSla) {
      if (!r.assigneeId) continue;
      const w = workload.get(r.assigneeId) ?? { open: 0, breached: 0 };
      w.open += 1;
      if (r.slaStatus === 'BREACHED') w.breached += 1;
      workload.set(r.assigneeId, w);
    }

    const severity = { BREACHED: 0, DUE_SOON: 1, ON_TRACK: 2 } as const;
    const attention = openWithSla
      .filter((r) => r.slaStatus !== 'ON_TRACK')
      .sort(
        (a, b) => severity[a.slaStatus] - severity[b.slaStatus] || a.resolutionDueAt.getTime() - b.resolutionDueAt.getTime(),
      )
      .slice(0, ATTENTION_LIMIT)
      .map((r) => ({
        id: r.id,
        number: r.number,
        title: r.title,
        priority: r.priority,
        stage: r.stage,
        slaStatus: r.slaStatus,
        company: companyNames.get(r.companyId) ?? '',
        assignee: r.assigneeId ? (userNames.get(r.assigneeId) ?? null) : null,
        resolutionDueAt: r.resolutionDueAt,
      }));

    return {
      range: { days, from: since, to: now },
      kpis: {
        open: open.length,
        breached: openWithSla.filter((r) => r.slaStatus === 'BREACHED').length,
        dueSoon: openWithSla.filter((r) => r.slaStatus === 'DUE_SOON').length,
        unassigned: open.filter((r) => !r.assigneeId).length,
        created: inPeriod.length,
        createdPrevious: rows.filter((r) => r.createdAt >= previousSince && r.createdAt < since).length,
        resolved: resolvedInPeriod.length,
        slaCompliance: slaCompliance(resolvedInPeriod),
        avgResolutionMinutes: averageMinutes(
          resolvedInPeriod.map((r) => ({ start: r.createdAt, end: r.resolvedAt, pausedMinutes: r.slaPausedMinutes })),
        ),
        avgResponseMinutes: averageMinutes(
          inPeriod.flatMap((r) => (r.respondedAt ? [{ start: r.createdAt, end: r.respondedAt }] : [])),
        ),
      },
      trend: buildTrend(rows, days, now),
      byStage,
      openByPriority,
      byCompany: companies.map((c) => ({
        id: c.id,
        name: c.name,
        open: open.filter((r) => r.companyId === c.id).length,
        created: inPeriod.filter((r) => r.companyId === c.id).length,
        breached: openWithSla.filter((r) => r.companyId === c.id && r.slaStatus === 'BREACHED').length,
      })),
      topRootCauses: topCounts(
        countBy(resolvedInPeriod, (r) => (r.rootCauseId ? (rootCauseNames.get(r.rootCauseId) ?? null) : null)),
        5,
      ),
      topTemplates: topCounts(countBy(inPeriod, (r) => templateNames.get(r.templateId) ?? null), 5),
      workload: [...workload.entries()]
        .map(([id, w]) => ({ id, name: userNames.get(id) ?? 'Unknown', ...w }))
        .sort((a, b) => b.open - a.open)
        .slice(0, 6),
      attention,
    };
  }
}
