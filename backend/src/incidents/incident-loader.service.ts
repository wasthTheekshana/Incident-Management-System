import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { AccessPolicy } from '../common/access-policy.service';
import { AuthUser } from '../common/auth.types';
import { PrismaService } from '../prisma/prisma.service';

export const NOTIFY_INCLUDE = {
  company: { select: { name: true } },
  assignee: { select: { name: true } },
  resolver: { select: { name: true } },
} satisfies Prisma.IncidentInclude;

/** Loads incidents through the access policy so no action can touch an incident the user cannot see. */
@Injectable()
export class IncidentLoader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessPolicy,
  ) {}

  /** A missing incident and one the user may not see are indistinguishable (404 both ways). */
  async loadAccessible(user: AuthUser, id: string) {
    const incident = await this.prisma.incident.findFirst({
      where: { id, ...this.access.incidentWhere(user) },
      include: NOTIFY_INCLUDE,
    });
    if (!incident) throw new NotFoundException('Incident not found');
    return incident;
  }

  /** Admin of the incident's company, or Super Admin. */
  isCompanyAdmin(user: AuthUser, companyId: string): boolean {
    return user.role === Role.SUPER_ADMIN || (user.role === Role.ADMIN && user.companyIds.includes(companyId));
  }
}
