import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { MailProcessor } from './mail.processor';
import { QUEUE_MAIL } from './notification.defaults';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Global()
@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_MAIL })],
  controllers: [NotificationsController],
  providers: [NotificationsService, MailProcessor],
  exports: [NotificationsService],
})
export class NotificationsModule {}
