import { Controller, Get, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID } from 'class-validator';
import { AuthUser } from '../common/auth.types';
import { CurrentUser, Roles } from '../common/decorators';
import { DashboardService } from './dashboard.service';

class DashboardQuery {
  @IsOptional() @IsUUID()
  companyId?: string;

  @IsOptional() @Type(() => Number) @IsInt() @IsIn([7, 30, 90])
  days?: number;
}

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  get(@CurrentUser() user: AuthUser, @Query() query: DashboardQuery) {
    return this.dashboard.build(user, query.days ?? 30, query.companyId);
  }
}
