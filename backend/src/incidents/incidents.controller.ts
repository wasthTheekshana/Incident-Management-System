import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Res, StreamableFile } from '@nestjs/common';
import { Role } from '@prisma/client';
import { IsOptional, IsUUID } from 'class-validator';
import { Response } from 'express';
import { AuthUser } from '../common/auth.types';
import { CurrentUser, Roles } from '../common/decorators';
import { IncidentActionsService } from './incident-actions.service';
import { IncidentExportService } from './incident-export.service';
import {
  AddCommentDto,
  AssignDto,
  ChangePriorityDto,
  ChangeStageDto,
  CreateIncidentDto,
  ExportQuery,
  ListIncidentsQuery,
  ReassignDto,
  RootCauseDto,
} from './incidents.dto';
import { IncidentsService } from './incidents.service';

class MineQuery {
  @IsOptional() @IsUUID()
  companyId?: string;
}

@Controller('incidents')
export class IncidentsController {
  constructor(
    private readonly incidents: IncidentsService,
    private readonly actions: IncidentActionsService,
    private readonly exporter: IncidentExportService,
  ) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateIncidentDto) {
    return this.incidents.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListIncidentsQuery) {
    const { page, pageSize, ...filter } = query;
    return this.incidents.list(user, filter, page, pageSize);
  }

  // Static routes are declared before ':id' so they are never captured as an id.
  @Get('mine')
  mine(@CurrentUser() user: AuthUser, @Query() query: MineQuery) {
    return this.incidents.mine(user, query.companyId);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Get('export')
  async export(@CurrentUser() user: AuthUser, @Query() query: ExportQuery, @Res({ passthrough: true }) res: Response) {
    const { format, ...filter } = query;
    const file = await this.exporter.export(user, filter, format);
    res.set({
      'Content-Type': file.mime,
      'Content-Disposition': `attachment; filename="${file.filename}"`,
      'Cache-Control': 'no-store',
    });
    return new StreamableFile(file.buffer);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.incidents.detail(user, id);
  }

  @Post(':id/stage')
  @HttpCode(200)
  changeStage(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangeStageDto) {
    return this.actions.changeStage(user, id, dto.stage, dto.comment);
  }

  @Put(':id/priority')
  changePriority(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangePriorityDto) {
    return this.actions.changePriority(user, id, dto.priority, dto.reason);
  }

  @Put(':id/resolver')
  @HttpCode(204)
  assignResolver(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignDto) {
    return this.actions.assignResolver(user, id, dto.userId);
  }

  @Put(':id/assignee')
  @HttpCode(204)
  reassign(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReassignDto) {
    return this.actions.reassign(user, id, dto.userId, dto.reason);
  }

  @Put(':id/root-cause')
  @HttpCode(204)
  rootCause(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RootCauseDto) {
    return this.actions.saveRootCause(user, id, dto);
  }

  @Post(':id/comments')
  comment(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AddCommentDto) {
    return this.actions.addComment(user, id, dto.body);
  }
}
