import { Injectable } from '@nestjs/common';
import { NotificationEvent, Prisma, Stage } from '@prisma/client';
import { NOTIFY_INCLUDE } from '../incidents/incident-loader.service';
import { targetStatus } from '../incidents/sla.calculator';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SlaConfigService } from './sla-config.service';

type Flag = 'responseDueSoonNotified' | 'responseBreachNotified' | 'resolutionDueSoonNotified' | 'resolutionBreachNotified';

/**
 * Finds incidents that crossed an SLA threshold and alerts once per threshold (FR-26).
 * A flag is claimed with a conditional update before notifying, so overlapping scans cannot double-send.
 */
@Injectable()
export class SlaMonitorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sla: SlaConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  async scan(now = new Date()): Promise<number> {
    const windows = await this.sla.getAll();
    // Pending is excluded from resolution tracking (clock paused); an unanswered incident is still response-tracked.
    const candidates = await this.prisma.incident.findMany({
      where: { stage: { in: [Stage.NEW, Stage.ASSIGNED, Stage.IN_PROGRESS] } },
      include: NOTIFY_INCLUDE,
    });

    let sent = 0;
    for (const incident of candidates) {
      const window = windows[incident.priority];
      const checks: { flag: Flag; due: boolean; event: NotificationEvent }[] = [];

      if (!incident.respondedAt) {
        const status = targetStatus(incident.responseDueAt, window.responseMinutes, now);
        checks.push(
          { flag: 'responseBreachNotified', due: status === 'BREACHED', event: 'SLA_BREACHED' },
          { flag: 'responseDueSoonNotified', due: status === 'DUE_SOON', event: 'SLA_DUE_SOON' },
        );
      }
      const resolution = targetStatus(incident.resolutionDueAt, window.resolutionMinutes, now);
      checks.push(
        { flag: 'resolutionBreachNotified', due: resolution === 'BREACHED', event: 'SLA_BREACHED' },
        { flag: 'resolutionDueSoonNotified', due: resolution === 'DUE_SOON', event: 'SLA_DUE_SOON' },
      );

      for (const { flag, due, event } of checks) {
        if (!due || incident[flag]) continue;
        const claimed = await this.prisma.incident.updateMany({
          where: { id: incident.id, [flag]: false } as Prisma.IncidentWhereInput,
          data: { [flag]: true },
        });
        if (claimed.count === 1) {
          await this.notifications.notify(event, incident);
          sent++;
        }
      }
    }
    return sent;
  }
}
