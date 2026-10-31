import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { IsUUID } from 'class-validator';
import { AuthUser } from '../common/auth.types';
import { CurrentUser, Roles } from '../common/decorators';
import { SaveTemplateDto } from './templates.dto';
import { TemplatesService } from './templates.service';

class AvailableQuery {
  @IsUUID()
  companyId: string;
}

@Controller('templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  /** Active templates for the company the reporter selected. Registered before ':id' so it isn't shadowed. */
  @Get('available')
  available(@CurrentUser() user: AuthUser, @Query() query: AvailableQuery) {
    return this.templates.listAvailable(user, query.companyId);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.templates.listForAdmin(user);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.templates.get(user, id);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: SaveTemplateDto) {
    return this.templates.create(user, dto);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Put(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveTemplateDto) {
    return this.templates.update(user, id, dto);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Post(':id/copy')
  copy(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.templates.copy(user, id);
  }
}
