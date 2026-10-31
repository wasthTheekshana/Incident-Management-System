import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { QUEUE_MAIL } from './notification.defaults';

const MAX_ATTEMPTS = 5;

@Processor(QUEUE_MAIL)
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {
    super();
  }

  async process(job: Job<{ notificationId: string }>): Promise<void> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: job.data.notificationId },
      include: { recipient: { select: { email: true, active: true } } },
    });
    if (!notification || notification.status === 'SENT' || !notification.recipient.active) return;

    try {
      await this.mail.send(notification.recipient.email, notification.subject, notification.body);
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: { status: 'SENT', sentAt: new Date() },
      });
    } catch (error) {
      // Only mark FAILED on the final attempt; earlier failures stay PENDING and are retried by BullMQ.
      if (job.attemptsMade + 1 >= MAX_ATTEMPTS) {
        await this.prisma.notification.update({ where: { id: notification.id }, data: { status: 'FAILED' } });
        this.logger.error(`Email notification ${notification.id} failed permanently`);
      }
      throw error;
    }
  }
}
