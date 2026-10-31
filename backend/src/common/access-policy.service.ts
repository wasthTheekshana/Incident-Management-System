import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { AuthUser } from './auth.types';

/**
 * The single place where data-visibility rules live (NFR-3, FR-36). Every list, search, export and
 * detail lookup builds its query from here, so a rule changes in exactly one file.
 */
@Injectable()
export class AccessPolicy {
  isSuperAdmin(user: AuthUser): boolean {
    return user.role === Role.SUPER_ADMIN;
  }

  isAdminLike(user: AuthUser): boolean {
    return user.role === Role.SUPER_ADMIN || user.role === Role.ADMIN;
  }

  canAccessCompany(user: AuthUser, companyId: string): boolean {
    return this.isSuperAdmin(user) || user.companyIds.includes(companyId);
  }

  assertCompanyAccess(user: AuthUser, companyId: string): void {
    if (!this.canAccessCompany(user, companyId)) throw new ForbiddenException();
  }

  /** Prisma filter for incidents the user may see. */
  incidentWhere(user: AuthUser): Prisma.IncidentWhereInput {
    if (this.isSuperAdmin(user)) return {};
    if (user.role === Role.ADMIN) return { companyId: { in: user.companyIds } };
    return {
      companyId: { in: user.companyIds },
      OR: [{ reporterId: user.id }, { assigneeId: user.id }, { resolverId: user.id }],
    };
  }

  /** Prisma filter for companies the user may see. */
  companyWhere(user: AuthUser): Prisma.CompanyWhereInput {
    return this.isSuperAdmin(user) ? {} : { id: { in: user.companyIds } };
  }
}
