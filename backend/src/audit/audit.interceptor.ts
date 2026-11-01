import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { AuthUser } from '../common/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';
import { AUDIT_SKIP, ROUTE_LABELS, RouteLabel, sanitizeBody } from './audit.util';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

interface Resolved {
  ref?: string;
  companyIds: string[];
}

/**
 * Records every successful state-changing request, so a new endpoint is audited by default rather than by
 * remembering to add a log call. Auth events are written by the auth controller, where the actor is known.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (!MUTATING.has(req.method)) return next.handle();

    return next.handle().pipe(
      tap((response) => {
        // Fire and forget: auditing must not slow down or fail the request it describes.
        void this.write(req, response).catch(() => undefined);
      }),
    );
  }

  private async write(req: Request & { user?: AuthUser }, response: unknown): Promise<void> {
    const routePath = ((req.route as { path?: string } | undefined)?.path ?? req.path).replace(/^\/api/, '');
    if (AUDIT_SKIP.some((pattern) => pattern.test(routePath))) return;

    const label: RouteLabel | undefined = ROUTE_LABELS[`${req.method} ${routePath}`];
    const created = (response ?? {}) as { id?: string };
    const entityId = [req.params.id, req.params.incidentId, created.id].flat().find((v) => typeof v === 'string');
    const resolved = label?.entity ? await this.resolve(label.entity, entityId) : { companyIds: [] };

    const changes = sanitizeBody(req.body);
    const user = req.user;
    await this.audit.record({
      actor: user ? { id: user.id, name: user.name, email: user.email } : null,
      action: label?.action ?? `request.${req.method.toLowerCase()}`,
      summary: label ? `${label.label}${resolved.ref ? ` ${resolved.ref}` : ''}` : `${req.method} ${routePath}`,
      entityType: label?.entity,
      entityId,
      companyIds: resolved.companyIds,
      ip: req.ip,
      metadata: Object.keys(changes).length ? { changes } : undefined,
    });
  }

  /** Looks up a readable reference and the owning companies so the entry can be scoped and understood later. */
  private async resolve(entity: NonNullable<RouteLabel['entity']>, id?: string): Promise<Resolved> {
    if (!id) return { companyIds: [] };
    switch (entity) {
      case 'incident': {
        const row = await this.prisma.incident.findUnique({ where: { id }, select: { number: true, companyId: true } });
        return row ? { ref: row.number, companyIds: [row.companyId] } : { companyIds: [] };
      }
      case 'user': {
        const row = await this.prisma.user.findUnique({
          where: { id },
          select: { name: true, email: true, companies: { select: { companyId: true } } },
        });
        return row ? { ref: `${row.name} (${row.email})`, companyIds: row.companies.map((c) => c.companyId) } : { companyIds: [] };
      }
      case 'company': {
        const row = await this.prisma.company.findUnique({ where: { id }, select: { name: true } });
        return { ref: row?.name, companyIds: row ? [id] : [] };
      }
      case 'template': {
        const row = await this.prisma.incidentTemplate.findUnique({
          where: { id },
          select: { name: true, companies: { select: { companyId: true } } },
        });
        return row ? { ref: row.name, companyIds: row.companies.map((c) => c.companyId) } : { companyIds: [] };
      }
      case 'rootCause': {
        const row = await this.prisma.rootCause.findUnique({ where: { id }, select: { name: true } });
        return { ref: row?.name, companyIds: [] };
      }
    }
  }
}
