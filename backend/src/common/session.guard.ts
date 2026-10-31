import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'crypto';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AuthUser } from './auth.types';
import { ALLOW_PASSWORD_CHANGE_PENDING, IS_PUBLIC } from './decorators';

export const SESSION_COOKIE = 'cims_sid';
const TOUCH_INTERVAL_MS = 60_000;

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

/**
 * Global authentication guard. Sessions are opaque server-side records so that idle timeout (FR-3)
 * and revocation on deactivation take effect immediately, which a stateless JWT cannot guarantee.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token: string | undefined = req.cookies?.[SESSION_COOKIE];
    if (!token) throw new UnauthorizedException();

    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { include: { companies: { select: { companyId: true } } } } },
    });
    if (!session) throw new UnauthorizedException();

    const now = Date.now();
    const idleMs = (await this.settings.getNumber('sessionIdleMinutes')) * 60_000;
    const expired = session.expiresAt.getTime() <= now || now - session.lastActiveAt.getTime() > idleMs;
    if (expired || !session.user.active) {
      await this.prisma.session.delete({ where: { id: session.id } });
      throw new UnauthorizedException();
    }

    if (now - session.lastActiveAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.prisma.session.update({ where: { id: session.id }, data: { lastActiveAt: new Date(now) } });
    }

    const { user } = session;
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      companyIds: user.companies.map((c) => c.companyId),
      sessionId: session.id,
    };

    const allowPending = this.reflector.getAllAndOverride<boolean>(ALLOW_PASSWORD_CHANGE_PENDING, targets);
    if (user.mustChangePassword && !allowPending) {
      throw new ForbiddenException('Password change required');
    }
    return true;
  }
}
