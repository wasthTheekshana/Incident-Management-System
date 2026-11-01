import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccessPolicy } from '../common/access-policy.service';
import { AuthUser } from '../common/auth.types';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  actor?: { id: string; name: string; email: string } | null;
  action: string;
  summary: string;
  entityType?: string;
  entityId?: string;
  companyIds?: string[];
  ip?: string;
  metadata?: Prisma.InputJsonValue;
}

export interface AuditQuery {
  page: number;
  pageSize: number;
  action?: string;
  entityType?: string;
  actorId?: string;
  companyId?: string;
  from?: Date;
  to?: Date;
  search?: string;
}

/**
 * Append-only audit trail for every module. It exposes no update or delete. A failed write is logged but never fails
 * the user's action: the business change has already committed, and refusing service over a log line would be worse.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessPolicy,
  ) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: entry.actor?.id ?? null,
          actorName: entry.actor?.name ?? null,
          actorEmail: entry.actor?.email ?? null,
          action: entry.action,
          summary: entry.summary,
          entityType: entry.entityType ?? null,
          entityId: entry.entityId ?? null,
          companyIds: entry.companyIds ?? [],
          ip: entry.ip ?? null,
          metadata: entry.metadata,
        },
      });
    } catch (error) {
      this.logger.error(`Could not write audit entry "${entry.action}"`, error instanceof Error ? error.stack : undefined);
    }
  }

  /** Super Admin sees everything. An Admin sees activity on their companies' records and their own actions. */
  private scope(user: AuthUser): Prisma.AuditLogWhereInput {
    if (this.access.isSuperAdmin(user)) return {};
    return { OR: [{ companyIds: { hasSome: user.companyIds } }, { actorId: user.id }] };
  }

  private where(user: AuthUser, query: Partial<AuditQuery>): Prisma.AuditLogWhereInput {
    if (query.companyId && !this.access.canAccessCompany(user, query.companyId)) throw new ForbiddenException();
    const and: Prisma.AuditLogWhereInput[] = [this.scope(user)];
    if (query.action) and.push({ action: query.action });
    if (query.entityType) and.push({ entityType: query.entityType });
    if (query.actorId) and.push({ actorId: query.actorId });
    if (query.companyId) and.push({ companyIds: { has: query.companyId } });
    if (query.from || query.to) and.push({ at: { gte: query.from, lte: query.to } });
    if (query.search) {
      const contains = { contains: query.search, mode: 'insensitive' as const };
      and.push({ OR: [{ summary: contains }, { actorName: contains }, { actorEmail: contains }, { entityId: contains }] });
    }
    return { AND: and };
  }

  async list(user: AuthUser, query: AuditQuery) {
    const where = this.where(user, query);
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { at: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /** Distinct action names the user can see, to fill the filter dropdown. */
  async actions(user: AuthUser): Promise<string[]> {
    const rows = await this.prisma.auditLog.groupBy({ by: ['action'], where: this.scope(user), orderBy: { action: 'asc' } });
    return rows.map((r) => r.action);
  }
}
