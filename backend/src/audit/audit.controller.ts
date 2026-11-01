import { Controller, Get, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDate, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import { AuthUser } from '../common/auth.types';
import { CurrentUser, Roles } from '../common/decorators';
import { AuditService } from './audit.service';

class AuditListQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  pageSize: number = 25;

  @IsOptional() @IsString() @Matches(/^[a-z_.]{1,60}$/)
  action?: string;

  @IsOptional() @IsString() @Matches(/^[A-Za-z]{1,30}$/)
  entityType?: string;

  @IsOptional() @IsUUID()
  actorId?: string;

  @IsOptional() @IsUUID()
  companyId?: string;

  @IsOptional() @Type(() => Date) @IsDate()
  from?: Date;

  @IsOptional() @Type(() => Date) @IsDate()
  to?: Date;

  @IsOptional() @IsString() @MaxLength(100)
  search?: string;
}

@Controller('audit')
@Roles(Role.SUPER_ADMIN, Role.ADMIN)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: AuditListQuery) {
    return this.audit.list(user, query);
  }

  @Get('actions')
  actions(@CurrentUser() user: AuthUser) {
    return this.audit.actions(user);
  }
}
