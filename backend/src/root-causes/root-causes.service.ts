import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccessPolicy } from '../common/access-policy.service';
import { AuthUser } from '../common/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRootCauseDto, UpdateRootCauseDto } from './root-causes.dto';

@Injectable()
export class RootCausesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessPolicy,
  ) {}

  /** Options global to all companies or specific to the given company (or, without one, to the user's companies). */
  list(user: AuthUser, companyId?: string, includeInactive = false) {
    if (companyId) this.access.assertCompanyAccess(user, companyId);

    let scope: Prisma.RootCauseWhereInput = {};
    if (companyId) scope = { OR: [{ companyId: null }, { companyId }] };
    else if (!this.access.isSuperAdmin(user)) scope = { OR: [{ companyId: null }, { companyId: { in: user.companyIds } }] };

    return this.prisma.rootCause.findMany({
      where: { ...scope, ...(includeInactive ? {} : { active: true }) },
      orderBy: { name: 'asc' },
    });
  }

  create(user: AuthUser, dto: CreateRootCauseDto) {
    // Only Super Admin may publish a global option; Admins manage options for their own companies.
    if (dto.companyId) this.access.assertCompanyAccess(user, dto.companyId);
    else if (!this.access.isSuperAdmin(user)) throw new ForbiddenException('Only Super Admin can add global root causes');

    return this.prisma.rootCause.create({ data: { name: dto.name.trim(), companyId: dto.companyId ?? null } });
  }

  async update(user: AuthUser, id: string, dto: UpdateRootCauseDto) {
    const existing = await this.prisma.rootCause.findUnique({ where: { id } });
    const permitted =
      existing && (existing.companyId ? this.access.canAccessCompany(user, existing.companyId) : this.access.isSuperAdmin(user));
    if (!permitted) throw new NotFoundException('Root cause not found');

    return this.prisma.rootCause.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.active !== undefined && { active: dto.active }),
      },
    });
  }
}
