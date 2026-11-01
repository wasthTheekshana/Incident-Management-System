import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './audit/audit.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { RolesGuard } from './common/roles.guard';
import { SessionGuard } from './common/session.guard';
import { CompaniesModule } from './companies/companies.module';
import { Env, validateEnv } from './config/env.validation';
import { HealthController } from './health/health.controller';
import { IncidentsModule } from './incidents/incidents.module';
import { MailModule } from './mail/mail.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { RootCausesModule } from './root-causes/root-causes.module';
import { SettingsModule } from './settings/settings.module';
import { SlaModule } from './sla/sla.module';
import { TemplatesModule } from './templates/templates.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const url = new URL(config.get('REDIS_URL', { infer: true }));
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            password: url.password ? decodeURIComponent(url.password) : undefined,
            tls: url.protocol === 'rediss:' ? {} : undefined,
          },
        };
      },
    }),
    PrismaModule,
    CommonModule,
    AuditModule,
    SettingsModule,
    MailModule,
    AuthModule,
    NotificationsModule,
    SlaModule,
    UsersModule,
    CompaniesModule,
    TemplatesModule,
    RootCausesModule,
    IncidentsModule,
    AttachmentsModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: throttle, then authenticate, then authorise by role.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
