import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth.types';
import { CurrentUser, Roles } from '../common/decorators';
import { CreateRootCauseDto, ListRootCausesQuery, UpdateRootCauseDto } from './root-causes.dto';
import { RootCausesService } from './root-causes.service';

@Controller('root-causes')
export class RootCausesController {
  constructor(private readonly rootCauses: RootCausesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListRootCausesQuery) {
    return this.rootCauses.list(user, query.companyId);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Get('manage')
  listAll(@CurrentUser() user: AuthUser, @Query() query: ListRootCausesQuery) {
    return this.rootCauses.list(user, query.companyId, true);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRootCauseDto) {
    return this.rootCauses.create(user, dto);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRootCauseDto) {
    return this.rootCauses.update(user, id, dto);
  }
}
