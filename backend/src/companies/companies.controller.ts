import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth.types';
import { CurrentUser, Roles } from '../common/decorators';
import { CreateCompanyDto, SetResponsiblePeopleDto, UpdateCompanyDto } from './companies.dto';
import { CompaniesService } from './companies.service';

@Controller('companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  /** Any authenticated user sees only the companies they are mapped to (FR-9). */
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.companies.list(user);
  }

  @Get(':id/members')
  members(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.companies.members(user, id);
  }

  @Roles(Role.SUPER_ADMIN)
  @Post()
  create(@Body() dto: CreateCompanyDto) {
    return this.companies.create(dto);
  }

  @Roles(Role.SUPER_ADMIN)
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCompanyDto) {
    return this.companies.update(id, dto);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Put(':id/responsible-people')
  setResponsiblePeople(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetResponsiblePeopleDto,
  ) {
    return this.companies.setResponsiblePeople(user, id, dto.responsiblePersonId ?? null, dto.backupPersonId ?? null);
  }
}
