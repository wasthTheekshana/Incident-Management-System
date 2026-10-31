import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { QUEUE_SLA } from '../notifications/notification.defaults';
import { SlaConfigController } from './sla-config.controller';
import { SlaConfigService } from './sla-config.service';
import { SlaMonitorService } from './sla-monitor.service';
import { SlaProcessor } from './sla.processor';

@Global()
@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_SLA })],
  controllers: [SlaConfigController],
  providers: [SlaConfigService, SlaMonitorService, SlaProcessor],
  exports: [SlaConfigService],
})
export class SlaModule {}
