import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Incident, Prisma, Priority, Stage } from '@prisma/client';
import { AuthUser } from '../common/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SlaConfigService } from '../sla/sla-config.service';
import { IncidentHistoryService } from './incident-history.service';
import { IncidentLoader, NOTIFY_INCLUDE } from './incident-loader.service';
import { RootCauseDto } from './incidents.dto';
import { calculateDueTimes } from './sla.calculator';
import { canActorMove, canTransition, requiresComment } from './stage.workflow';

const MS_PER_MINUTE = 60_000;

type LoadedIncident = Awaited<ReturnType<IncidentLoader['loadAccessible']>>;

/** Everything that changes an existing incident. Each action validates, writes + audits in one transaction, then notifies. */
@Injectable()
export class IncidentActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loader: IncidentLoader,
    private readonly history: IncidentHistoryService,
    private readonly sla: SlaConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  async changeStage(user: AuthUser, id: string, to: Stage, comment?: string) {
    const incident = await this.loader.loadAccessible(user, id);
    const from = incident.stage;

    if (!canTransition(from, to)) throw new BadRequestException(`Cannot move an incident from ${from} to ${to}`);
    if (to === Stage.ASSIGNED) throw new BadRequestException('An incident becomes Assigned by assigning it to a user');
    const actor = { id: user.id, role: user.role, isCompanyAdmin: this.loader.isCompanyAdmin(user, incident.companyId) };
    if (!canActorMove(actor, incident, from, to)) throw new ForbiddenException('You cannot make this stage change');
    if (requiresComment(from, to) && !comment) throw new BadRequestException('A comment is required for this stage change');
    if (to === Stage.RESOLVED) this.assertResolvable(incident);

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.incident.update({
        where: { id },
        data: this.stageEffects(incident, from, to, now),
        include: NOTIFY_INCLUDE,
      });
      await this.history.record(tx, { incidentId: id, userId: user.id, action: 'STAGE_CHANGED', field: 'stage', oldValue: from, newValue: to });
      if (comment) await tx.comment.create({ data: { incidentId: id, authorId: user.id, body: comment } });
      return result;
    });

    await this.notifications.notify('STAGE_CHANGED', updated, { actorName: user.name, oldStage: from, newStage: to, comment });
    return { stage: updated.stage };
  }

  async changePriority(user: AuthUser, id: string, priority: Priority, reason: string) {
    const incident = await this.loader.loadAccessible(user, id);
    this.assertOpen(incident);
    if (!this.loader.isCompanyAdmin(user, incident.companyId) && user.id !== incident.assigneeId) {
      throw new ForbiddenException('Only the assignee or an admin can change the priority');
    }
    if (priority === incident.priority) throw new BadRequestException('Incident already has this priority');

    // FR-18: due times are recomputed from the creation time, keeping time already spent in Pending.
    const window = await this.sla.getFor(priority);
    const due = calculateDueTimes(incident.createdAt, window.responseMinutes, window.resolutionMinutes, incident.slaPausedMinutes);

    await this.prisma.$transaction(async (tx) => {
      await tx.incident.update({
        where: { id },
        data: {
          priority,
          ...due,
          responseDueSoonNotified: false,
          responseBreachNotified: false,
          resolutionDueSoonNotified: false,
          resolutionBreachNotified: false,
        },
      });
      await this.history.record(
        tx,
        { incidentId: id, userId: user.id, action: 'PRIORITY_CHANGED', field: 'priority', oldValue: incident.priority, newValue: priority },
        { incidentId: id, userId: user.id, action: 'SLA_RECALCULATED', field: 'resolutionDueAt', oldValue: incident.resolutionDueAt.toISOString(), newValue: due.resolutionDueAt.toISOString() },
      );
      await tx.comment.create({ data: { incidentId: id, authorId: user.id, body: `Priority changed ${incident.priority} → ${priority}. Reason: ${reason}` } });
    });
    return { priority, ...due };
  }

  async assignResolver(user: AuthUser, id: string, resolverId: string) {
    const incident = await this.loader.loadAccessible(user, id);
    this.assertOpen(incident);
    this.assertCanAssign(user, incident);
    await this.assertActiveMember(incident.companyId, resolverId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.incident.update({ where: { id }, data: { resolverId }, include: NOTIFY_INCLUDE });
      await this.history.record(tx, {
        incidentId: id, userId: user.id, action: 'RESOLVER_ASSIGNED', field: 'resolver', oldValue: incident.resolverId, newValue: resolverId,
      });
      return result;
    });
    await this.notifications.notify('RESOLVER_ASSIGNED', updated, { actorName: user.name });
  }

  /** FR-31 / UC-7. SLA timers are untouched; only the owner changes. */
  async reassign(user: AuthUser, id: string, assigneeId: string, reason: string) {
    const incident = await this.loader.loadAccessible(user, id);
    this.assertOpen(incident);
    this.assertCanAssign(user, incident);
    if (assigneeId === incident.assigneeId) throw new BadRequestException('Incident is already assigned to this user');
    await this.assertActiveMember(incident.companyId, assigneeId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.incident.update({
        where: { id },
        // An unassigned incident (no responsible person) becomes Assigned on its first assignment.
        data: { assigneeId, ...(incident.stage === Stage.NEW && { stage: Stage.ASSIGNED }) },
        include: NOTIFY_INCLUDE,
      });
      await this.history.record(tx, {
        incidentId: id, userId: user.id, action: incident.assigneeId ? 'REASSIGNED' : 'ASSIGNED', field: 'assignee', oldValue: incident.assigneeId, newValue: assigneeId,
      });
      if (incident.stage === Stage.NEW) {
        await this.history.record(tx, { incidentId: id, userId: user.id, action: 'STAGE_CHANGED', field: 'stage', oldValue: Stage.NEW, newValue: Stage.ASSIGNED });
      }
      await tx.comment.create({ data: { incidentId: id, authorId: user.id, body: `Reassigned. Reason: ${reason}` } });
      return result;
    });
    await this.notifications.notify('ASSIGNED', updated, { actorName: user.name, comment: reason, previousAssigneeId: incident.assigneeId });
  }

  async saveRootCause(user: AuthUser, id: string, dto: RootCauseDto) {
    const incident = await this.loader.loadAccessible(user, id);
    this.assertOpen(incident);
    const isWorker = user.id === incident.assigneeId || user.id === incident.resolverId;
    if (!isWorker && !this.loader.isCompanyAdmin(user, incident.companyId)) {
      throw new ForbiddenException('Only the assignee, resolver or an admin can record the root cause');
    }
    if (incident.stage !== Stage.IN_PROGRESS && incident.stage !== Stage.PENDING) {
      throw new BadRequestException('Root cause can be recorded while the incident is In Progress or Pending');
    }

    if (dto.rootCauseId) {
      const option = await this.prisma.rootCause.findFirst({
        where: { id: dto.rootCauseId, active: true, OR: [{ companyId: null }, { companyId: incident.companyId }] },
      });
      if (!option) throw new BadRequestException('Root cause option is not available for this company');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.incident.update({
        where: { id },
        data: {
          rootCauseId: dto.rootCauseId ?? null,
          rootCauseText: dto.rootCauseId ? null : dto.rootCauseText,
          ...(dto.correctiveAction !== undefined && { correctiveAction: dto.correctiveAction }),
          ...(dto.resolutionNotes !== undefined && { resolutionNotes: dto.resolutionNotes }),
        },
      });
      await this.history.record(tx, {
        incidentId: id,
        userId: user.id,
        action: 'ROOT_CAUSE_RECORDED',
        field: 'rootCause',
        oldValue: incident.rootCauseId ?? incident.rootCauseText,
        newValue: dto.rootCauseId ?? dto.rootCauseText,
      });
    });
  }

  async addComment(user: AuthUser, id: string, body: string) {
    const incident = await this.loader.loadAccessible(user, id);
    const allowed =
      user.id === incident.reporterId ||
      user.id === incident.assigneeId ||
      user.id === incident.resolverId ||
      this.loader.isCompanyAdmin(user, incident.companyId);
    if (!allowed) throw new ForbiddenException('You cannot comment on this incident');

    return this.prisma.$transaction(async (tx) => {
      const comment = await tx.comment.create({
        data: { incidentId: id, authorId: user.id, body },
        include: { author: { select: { id: true, name: true } } },
      });
      await this.history.record(tx, { incidentId: id, userId: user.id, action: 'COMMENTED', newValue: comment.id });
      return comment;
    });
  }

  // --- rules ----------------------------------------------------------------------------------------

  /** Side effects of each legal move on timestamps and SLA clocks (FR-18, FR-19, UC-5, UC-6). */
  private stageEffects(incident: Incident, from: Stage, to: Stage, now: Date): Prisma.IncidentUpdateInput {
    const data: Prisma.IncidentUpdateInput = { stage: to };

    if (to === Stage.IN_PROGRESS && from === Stage.ASSIGNED) data.respondedAt = now;
    if (to === Stage.PENDING) data.pausedAt = now;
    if (from === Stage.PENDING && incident.pausedAt) {
      const pausedMs = now.getTime() - incident.pausedAt.getTime();
      data.pausedAt = null;
      data.slaPausedMinutes = incident.slaPausedMinutes + Math.ceil(pausedMs / MS_PER_MINUTE);
      data.resolutionDueAt = new Date(incident.resolutionDueAt.getTime() + pausedMs);
      data.resolutionDueSoonNotified = false; // the extended deadline may cross the threshold again
    }
    if (to === Stage.RESOLVED) data.resolvedAt = now;
    if (from === Stage.RESOLVED && to === Stage.IN_PROGRESS) data.resolvedAt = null;
    if (to === Stage.CLOSED) data.closedAt = now;
    return data;
  }

  /** FR-28 */
  private assertResolvable(incident: Incident): void {
    const hasRootCause = !!incident.rootCauseId || !!incident.rootCauseText?.trim();
    if (!hasRootCause || !incident.resolutionNotes?.trim()) {
      throw new BadRequestException('Record the root cause and resolution notes before resolving the incident');
    }
  }

  private assertOpen(incident: Incident): void {
    if (incident.stage === Stage.CLOSED) throw new BadRequestException('Incident is closed');
  }

  private assertCanAssign(user: AuthUser, incident: LoadedIncident): void {
    if (!this.loader.isCompanyAdmin(user, incident.companyId) && user.id !== incident.assigneeId) {
      throw new ForbiddenException('Only the assignee or an admin can assign this incident');
    }
  }

  /** Candidates must be active users mapped to the incident's company (UC-7 alternate flow). */
  private async assertActiveMember(companyId: string, userId: string): Promise<void> {
    const member = await this.prisma.userCompany.findFirst({ where: { companyId, userId, user: { active: true } } });
    if (!member) throw new BadRequestException('Selected user is inactive or not mapped to this company');
  }
}
