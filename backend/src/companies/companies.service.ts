import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccessPolicy } from '../common/access-policy.service';
import { AuthUser } from '../common/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyDto, UpdateCompanyDto } from './companies.dto';

const COMPANY_VIEW = {
  id: true,
  name: true,
  code: true,
  active: true,
  responsiblePerson: { select: { id: true, name: true, email: true } },
  backupPerson: { select: { id: true, name: true, email: true } },
} satisfies Prisma.CompanySelect;

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessPolicy,
  ) {}

  list(user: AuthUser) {
    return this.prisma.company.findMany({
      where: this.access.companyWhere(user),
      select: COMPANY_VIEW,
      orderBy: { name: 'asc' },
    });
  }

  /** Active members as id + name only, for assignee/resolver pickers. Visible to anyone in the company. */
  async members(user: AuthUser, companyId: string) {
    this.access.assertCompanyAccess(user, companyId);
    return this.prisma.user.findMany({
      where: { active: true, companies: { some: { companyId } } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateCompanyDto) {
    try {
      return await this.prisma.company.create({
        data: { name: dto.name.trim(), code: dto.code.trim().toUpperCase() },
        select: COMPANY_VIEW,
      });
    } catch (e) {
      throw this.translateUnique(e);
    }
  }

  async update(id: string, dto: UpdateCompanyDto) {
    await this.findOrThrow(id);
    try {
      return await this.prisma.company.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name.trim() }),
          ...(dto.code !== undefined && { code: dto.code.trim().toUpperCase() }),
          ...(dto.active !== undefined && { active: dto.active }),
        },
        select: COMPANY_VIEW,
      });
    } catch (e) {
      throw this.translateUnique(e);
    }
  }

  /** FR-6: Responsible Person and backup must be active members of the company. */
  async setResponsiblePeople(user: AuthUser, id: string, responsibleId: string | null, backupId: string | null) {
    this.access.assertCompanyAccess(user, id);
    await this.findOrThrow(id);
    if (responsibleId && responsibleId === backupId) {
      throw new BadRequestException('Responsible person and backup must be different users');
    }
    for (const userId of [responsibleId, backupId]) {
      if (!userId) continue;
      const member = await this.prisma.userCompany.findFirst({
        where: { companyId: id, userId, user: { active: true } },
      });
      if (!member) throw new BadRequestException('Selected person must be an active user mapped to this company');
    }
    return this.prisma.company.update({
      where: { id },
      data: { responsiblePersonId: responsibleId, backupPersonId: backupId },
      select: COMPANY_VIEW,
    });
  }

  private async findOrThrow(id: string) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  private translateUnique(e: unknown): unknown {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return new ConflictException('A company with this name or code already exists');
    }
    return e;
  }
}
