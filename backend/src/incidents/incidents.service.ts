import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Incident, Prisma, Stage } from '@prisma/client';
import { AccessPolicy } from '../common/access-policy.service';
import { AuthUser } from '../common/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SlaConfigService, SlaWindow } from '../sla/sla-config.service';
import { validateFieldValues } from '../templates/field-values.validator';
import { IncidentHistoryService } from './incident-history.service';
import { IncidentLoader, NOTIFY_INCLUDE } from './incident-loader.service';
import { CreateIncidentDto, IncidentFilterDto } from './incidents.dto';
import { calculateDueTimes, incidentSlaStatus } from './sla.calculator';

const COLOMBO_OFFSET_MS = 5.5 * 3_600_000;

const LIST_SELECT = {
  id: true,
  number: true,
  title: true,
  priority: true,
  stage: true,
  createdAt: true,
  responseDueAt: true,
  resolutionDueAt: true,
  respondedAt: true,
  resolvedAt: true,
  pausedAt: true,
  company: { select: { id: true, name: true, code: true } },
  template: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true } },
  reporter: { select: { id: true, name: true } },
} satisfies Prisma.IncidentSelect;

@Injectable()
export class IncidentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessPolicy,
    private readonly sla: SlaConfigService,
    private readonly history: IncidentHistoryService,
    private readonly loader: IncidentLoader,
    private readonly notifications: NotificationsService,
  ) {}

  async create(user: AuthUser, dto: CreateIncidentDto) {
    this.access.assertCompanyAccess(user, dto.companyId);

    const company = await this.prisma.company.findUnique({ where: { id: dto.companyId } });
    if (!company?.active) throw new BadRequestException('Company is not active');

    const template = await this.prisma.incidentTemplate.findFirst({
      where: { id: dto.templateId, active: true, companies: { some: { companyId: dto.companyId } } },
    });
    if (!template) throw new BadRequestException('Template is not available for this company');

    const fields = await this.prisma.templateField.findMany({
      where: { templateId: template.id, version: template.version },
    });
    const fieldValues = validateFieldValues(fields, dto.fieldValues ?? {});

    const priority = dto.priority ?? template.defaultPriority;
    const window = await this.sla.getFor(priority);
    const now = new Date();
    const due = calculateDueTimes(now, window.responseMinutes, window.resolutionMinutes);
    const assigneeId = await this.pickInitialAssignee(company);

    const incident = await this.prisma.$transaction(async (tx) => {
      const number = await this.nextNumber(tx, now);
      const created = await tx.incident.create({
        data: {
          number,
          companyId: company.id,
          templateId: template.id,
          templateVersion: template.version,
          title: dto.title,
          description: dto.description,
          fieldValues,
          priority,
          stage: assigneeId ? Stage.ASSIGNED : Stage.NEW,
          reporterId: user.id,
          assigneeId,
          createdAt: now,
          ...due,
        },
        include: NOTIFY_INCLUDE,
      });
      await this.history.record(
        tx,
        { incidentId: created.id, userId: user.id, action: 'CREATED', newValue: number },
        ...(assigneeId
          ? [{ incidentId: created.id, userId: null, action: 'ASSIGNED', field: 'assignee', newValue: assigneeId }]
          : []),
      );
      return created;
    });

    await this.notifications.notify('INCIDENT_CREATED', incident, { actorName: user.name });
    if (assigneeId) await this.notifications.notify('ASSIGNED', incident, { actorName: 'System' });
    return { id: incident.id, number: incident.number, stage: incident.stage, assigneeId };
  }

  async list(user: AuthUser, filter: IncidentFilterDto, page: number, pageSize: number) {
    const where = this.buildWhere(user, filter);
    const [total, rows, windows] = await Promise.all([
      this.prisma.incident.count({ where }),
      this.prisma.incident.findMany({
        where,
        select: LIST_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.sla.getAll(),
    ]);
    const now = new Date();
    return {
      total,
      page,
      pageSize,
      items: rows.map((r) => ({ ...r, slaStatus: this.slaStatusFor(r, windows, now) })),
    };
  }

  async detail(user: AuthUser, id: string) {
    const incident = await this.prisma.incident.findFirst({
      where: { id, ...this.access.incidentWhere(user) },
      include: {
        company: { select: { id: true, name: true, code: true } },
        template: { select: { id: true, name: true } },
        reporter: { select: { id: true, name: true, email: true } },
        assignee: { select: { id: true, name: true, email: true } },
        resolver: { select: { id: true, name: true, email: true } },
        rootCause: { select: { id: true, name: true } },
        attachments: {
          select: { id: true, fileName: true, fileType: true, size: true, uploadedAt: true, uploadedBy: true },
          orderBy: { uploadedAt: 'asc' },
        },
        comments: { include: { author: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } },
        history: { include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!incident) throw new NotFoundException('Incident not found');

    const templateFields = await this.prisma.templateField.findMany({
      where: { templateId: incident.templateId, version: incident.templateVersion },
      orderBy: { order: 'asc' },
      select: { key: true, label: true, type: true },
    });
    const windows = await this.sla.getAll();
    return {
      ...incident,
      templateFields,
      slaStatus: this.slaStatusFor(incident, windows, new Date()),
      permissions: this.permissionsFor(user, incident),
    };
  }

  /** FR-35: counts by stage for incidents the user reported and incidents assigned to them. */
  async mine(user: AuthUser, companyId?: string) {
    if (companyId) this.access.assertCompanyAccess(user, companyId);
    const scope: Prisma.IncidentWhereInput = companyId ? { companyId } : { companyId: { in: user.companyIds } };
    const count = async (who: Prisma.IncidentWhereInput) => {
      const groups = await this.prisma.incident.groupBy({ by: ['stage'], where: { ...scope, ...who }, _count: true });
      return Object.fromEntries(groups.map((g) => [g.stage, g._count]));
    };
    const [reported, assigned] = await Promise.all([
      count({ reporterId: user.id }),
      count({ OR: [{ assigneeId: user.id }, { resolverId: user.id }] }),
    ]);
    return { reported, assigned };
  }

  /** Shared by the list and the export so both always apply identical visibility and filters (NFR-3). */
  buildWhere(user: AuthUser, filter: IncidentFilterDto): Prisma.IncidentWhereInput {
    if (filter.companyId) this.access.assertCompanyAccess(user, filter.companyId);
    const and: Prisma.IncidentWhereInput[] = [this.access.incidentWhere(user)];

    if (filter.search) {
      and.push({
        OR: [
          { number: { contains: filter.search, mode: 'insensitive' } },
          { title: { contains: filter.search, mode: 'insensitive' } },
          { description: { contains: filter.search, mode: 'insensitive' } },
        ],
      });
    }
    if (filter.companyId) and.push({ companyId: filter.companyId });
    if (filter.priority) and.push({ priority: filter.priority });
    if (filter.stage) and.push({ stage: filter.stage });
    if (filter.assigneeId) and.push({ assigneeId: filter.assigneeId });
    if (filter.templateId) and.push({ templateId: filter.templateId });
    if (filter.from || filter.to) {
      and.push({
        createdAt: {
          ...(filter.from && { gte: new Date(filter.from) }),
          ...(filter.to && { lte: new Date(filter.to) }),
        },
      });
    }
    return { AND: and };
  }

  // --- helpers --------------------------------------------------------------------------------------

  /** FR-20: Responsible Person, else backup, else unassigned. Inactive or detached people are skipped. */
  private async pickInitialAssignee(company: { id: string; responsiblePersonId: string | null; backupPersonId: string | null }) {
    for (const candidate of [company.responsiblePersonId, company.backupPersonId]) {
      if (!candidate) continue;
      const member = await this.prisma.userCompany.findFirst({
        where: { userId: candidate, companyId: company.id, user: { active: true } },
      });
      if (member) return candidate;
    }
    return null;
  }

  /** FR-16: INC-YYYY-NNNNNN. The upsert row-locks the year's counter, so concurrent creates cannot collide. */
  private async nextNumber(tx: Prisma.TransactionClient, now: Date): Promise<string> {
    const year = new Date(now.getTime() + COLOMBO_OFFSET_MS).getUTCFullYear();
    const seq = await tx.incidentSequence.upsert({
      where: { year },
      update: { lastSeq: { increment: 1 } },
      create: { year, lastSeq: 1 },
    });
    return `INC-${year}-${String(seq.lastSeq).padStart(6, '0')}`;
  }

  private slaStatusFor(
    incident: Pick<Incident, 'priority' | 'responseDueAt' | 'resolutionDueAt' | 'respondedAt' | 'resolvedAt' | 'pausedAt'>,
    windows: Record<string, SlaWindow>,
    now: Date,
  ) {
    return incidentSlaStatus(incident, windows[incident.priority], now);
  }

  /** Tells the UI which buttons to show; the server still enforces every rule independently. */
  private permissionsFor(user: AuthUser, incident: Incident) {
    const isAdmin = this.loader.isCompanyAdmin(user, incident.companyId);
    const isWorker = user.id === incident.assigneeId || user.id === incident.resolverId;
    const open = incident.stage !== Stage.CLOSED;
    return {
      changeStage: open && (isAdmin || isWorker || (user.id === incident.reporterId && incident.stage === Stage.RESOLVED)),
      reassign: open && (isAdmin || user.id === incident.assigneeId),
      assignResolver: open && (isAdmin || user.id === incident.assigneeId),
      changePriority: open && (isAdmin || user.id === incident.assigneeId),
      editRootCause: open && (isAdmin || isWorker),
      attach: open && (isAdmin || isWorker || user.id === incident.reporterId),
    };
  }
}
