import { Body, Controller, Get, HttpCode, Param, ParseEnumPipe, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { NotificationEvent, Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import { ArrayUnique, IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AuthUser } from '../common/auth.types';
import { CurrentUser, Roles } from '../common/decorators';
import { Audience, AUDIENCES } from './notification.defaults';
import { NotificationsService } from './notifications.service';

class InboxQuery {
  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean()
  unread?: boolean;
}

class EventConfigDto {
  @IsArray() @ArrayUnique() @IsIn(AUDIENCES, { each: true })
  audiences: Audience[];

  @IsString() @MinLength(1) @MaxLength(200)
  subject: string;

  @IsString() @MinLength(1) @MaxLength(5000)
  body: string;
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  inbox(@CurrentUser() user: AuthUser, @Query() query: InboxQuery) {
    return this.notifications.listForUser(user.id, query.unread ?? false);
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: AuthUser) {
    return { count: await this.notifications.unreadCount(user.id) };
  }

  @HttpCode(204)
  @Post('read-all')
  readAll(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user.id);
  }

  @HttpCode(204)
  @Post(':id/read')
  read(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(user.id, id);
  }

  @Roles(Role.SUPER_ADMIN)
  @Get('config')
  config() {
    return this.notifications.getConfig();
  }

  @Roles(Role.SUPER_ADMIN)
  @HttpCode(204)
  @Put('config/:event')
  saveConfig(@Param('event', new ParseEnumPipe(NotificationEvent)) event: NotificationEvent, @Body() dto: EventConfigDto) {
    return this.notifications.saveEventConfig(event, dto.audiences, dto.subject, dto.body);
  }
}
