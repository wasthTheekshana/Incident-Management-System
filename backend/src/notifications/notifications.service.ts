import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Incident, NotificationChannel, NotificationEvent, Prisma, Role, User } from '@prisma/client';
import { Queue } from 'bullmq';
import { Env } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { Audience, AUDIENCES, DEFAULT_RULES, DEFAULT_TEMPLATES, QUEUE_MAIL } from './notification.defaults';

export interface NotifyContext {
  actorName?: string;
  oldStage?: string;
  newStage?: string;
  comment?: string;
  previousAssigneeId?: string | null;
}

type IncidentForNotify = Incident & {
  company: { name: string };
  assignee: Pick<User, 'name'> | null;
  resolver: Pick<User, 'name'> | null;
};

const SL_TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Colombo',
  dateStyle: 'medium',
  timeStyle: 'short',
});

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    @InjectQueue(QUEUE_MAIL) private readonly mailQueue: Queue,
  ) {}

  /**
   * Records an in-app notification and queues an email for every recipient the event's rule selects.
   * Called after the business transaction commits, so a mail problem can never roll back an incident change.
   */
  async notify(event: NotificationEvent, incident: IncidentForNotify, ctx: NotifyContext = {}): Promise<void> {
    const recipients = await this.resolveRecipients(event, incident, ctx);
    if (!recipients.length) return;

    const { subject, body } = await this.render(event, incident, ctx);
    for (const recipient of recipients) {
      await this.prisma.notification.create({
        data: {
          incidentId: incident.id,
          recipientId: recipient.id,
          event,
          channel: NotificationChannel.IN_APP,
          subject,
          body,
          status: 'SENT',
          sentAt: new Date(),
        },
      });
      const email = await this.prisma.notification.create({
        data: { incidentId: incident.id, recipientId: recipient.id, event, channel: NotificationChannel.EMAIL, subject, body },
      });
      await this.mailQueue.add(
        'send',
        { notificationId: email.id },
        { attempts: 5, backoff: { type: 'exponential', delay: 10_000 }, removeOnComplete: true },
      );
    }
  }

  private async resolveRecipients(event: NotificationEvent, incident: IncidentForNotify, ctx: NotifyContext) {
    const audiences = await this.audiencesFor(event);
    const ids = new Set<string>();
    const add = (id?: string | null) => id && ids.add(id);

    for (const audience of audiences) {
      if (audience === 'REPORTER') add(incident.reporterId);
      if (audience === 'ASSIGNEE') add(incident.assigneeId);
      if (audience === 'RESOLVER') add(incident.resolverId);
      if (audience === 'PREVIOUS_ASSIGNEE') add(ctx.previousAssigneeId);
      if (audience === 'COMPANY_ADMINS') {
        const admins = await this.prisma.user.findMany({
          where: {
            active: true,
            role: { in: [Role.ADMIN, Role.SUPER_ADMIN] },
            OR: [{ role: Role.SUPER_ADMIN }, { companies: { some: { companyId: incident.companyId } } }],
          },
          select: { id: true },
        });
        admins.forEach((a) => add(a.id));
      }
    }
    return this.prisma.user.findMany({ where: { id: { in: [...ids] }, active: true }, select: { id: true } });
  }

  private async audiencesFor(event: NotificationEvent): Promise<Audience[]> {
    const rules = await this.prisma.notificationRule.findMany({ where: { event } });
    if (!rules.length) return DEFAULT_RULES[event];
    return rules.filter((r) => r.enabled).map((r) => r.audience as Audience);
  }

  private async render(event: NotificationEvent, incident: IncidentForNotify, ctx: NotifyContext) {
    const stored = await this.prisma.emailTemplate.findUnique({ where: { event } });
    const template = stored ?? DEFAULT_TEMPLATES[event];
    const values: Record<string, string> = {
      number: incident.number,
      title: incident.title,
      company: incident.company.name,
      priority: incident.priority,
      assignee: incident.assignee?.name ?? 'Unassigned',
      resolver: incident.resolver?.name ?? 'Unassigned',
      responseDue: SL_TIME.format(incident.responseDueAt),
      resolutionDue: SL_TIME.format(incident.resolutionDueAt),
      oldStage: ctx.oldStage ?? '',
      newStage: ctx.newStage ?? '',
      actor: ctx.actorName ?? 'System',
      comment: ctx.comment ?? '-',
      link: `${this.config.get('APP_URL', { infer: true })}/incidents/${incident.id}`,
    };
    const fill = (text: string) => text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? '');
    return { subject: fill(template.subject), body: fill(template.body) };
  }

  // --- in-app inbox -------------------------------------------------------------------------------

  listForUser(userId: string, unreadOnly: boolean) {
    return this.prisma.notification.findMany({
      where: { recipientId: userId, channel: NotificationChannel.IN_APP, ...(unreadOnly && { readAt: null }) },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, incidentId: true, event: true, subject: true, body: true, readAt: true, createdAt: true },
    });
  }

  unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { recipientId: userId, channel: NotificationChannel.IN_APP, readAt: null },
    });
  }

  async markRead(userId: string, id: string): Promise<void> {
    await this.prisma.notification.updateMany({ where: { id, recipientId: userId, readAt: null }, data: { readAt: new Date() } });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { recipientId: userId, channel: NotificationChannel.IN_APP, readAt: null },
      data: { readAt: new Date() },
    });
  }

  // --- Super Admin configuration (FR-25) ---------------------------------------------------------------

  async getConfig() {
    const events = Object.keys(DEFAULT_RULES) as NotificationEvent[];
    const [rules, templates] = await Promise.all([
      this.prisma.notificationRule.findMany(),
      this.prisma.emailTemplate.findMany(),
    ]);
    return events.map((event) => ({
      event,
      audiences: rules.some((r) => r.event === event)
        ? rules.filter((r) => r.event === event && r.enabled).map((r) => r.audience)
        : DEFAULT_RULES[event],
      template: templates.find((t) => t.event === event) ?? DEFAULT_TEMPLATES[event],
    }));
  }

  async saveEventConfig(event: NotificationEvent, audiences: Audience[], subject: string, body: string): Promise<void> {
    await this.prisma.$transaction([
      ...AUDIENCES.map((audience) =>
        this.prisma.notificationRule.upsert({
          where: { event_audience: { event, audience } },
          update: { enabled: audiences.includes(audience) },
          create: { event, audience, enabled: audiences.includes(audience) },
        }),
      ),
      this.prisma.emailTemplate.upsert({
        where: { event },
        update: { subject, body },
        create: { event, subject, body },
      }),
    ] as Prisma.PrismaPromise<unknown>[]);
  }
}
