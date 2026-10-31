import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QUEUE_SLA } from '../notifications/notification.defaults';
import { SlaMonitorService } from './sla-monitor.service';

const SCAN_EVERY_MS = 60_000; // NFR-7

@Processor(QUEUE_SLA)
export class SlaProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(SlaProcessor.name);

  constructor(
    private readonly monitor: SlaMonitorService,
    @InjectQueue(QUEUE_SLA) private readonly queue: Queue,
  ) {
    super();
  }

  /** Idempotent: the scheduler id makes repeated boots (or several API replicas) share one schedule. */
  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler('sla-scan', { every: SCAN_EVERY_MS }, { name: 'scan', opts: { removeOnComplete: true, removeOnFail: 100 } });
  }

  async process(): Promise<void> {
    const sent = await this.monitor.scan();
    if (sent) this.logger.log(`SLA scan raised ${sent} alert(s)`);
  }
}
