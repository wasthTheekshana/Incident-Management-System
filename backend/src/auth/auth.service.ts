import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { Env } from '../config/env.validation';
import { hashToken } from '../common/session.guard';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { afterFailedLogin, canChangePassword, isLocked, isPasswordExpired, PASSWORD_POLICY } from './password.policy';
import { PasswordService } from './password.service';

const SESSION_MAX_HOURS = 12;
const RESET_TOKEN_MINUTES = 30;
const INVALID_CREDENTIALS = 'Invalid email or password';

@Injectable()
export class AuthService {
  // Verified against when the account does not exist, so response time doesn't reveal valid emails.
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
    private readonly audit: AuditService,
  ) {}

  async login(email: string, password: string, ip?: string): Promise<{ token: string; expiresAt: Date }> {
    const normalised = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalised } });
    const failed = async (reason: string, userId?: string) =>
      this.audit.record({
        action: 'auth.login_failed',
        summary: `Failed sign-in for ${normalised}`,
        entityType: 'user',
        entityId: userId,
        companyIds: userId ? await this.companyIdsOf(userId) : [],
        ip,
        metadata: { reason },
      });

    if (!user) {
      this.dummyHash ??= this.passwords.hash(randomBytes(16).toString('hex'));
      await this.passwords.verify(await this.dummyHash, password).catch(() => false);
      await failed('unknown account');
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    // Locked and inactive accounts get the same message as bad credentials (no state disclosure).
    if (!user.active || isLocked(user, new Date())) {
      await failed(user.active ? 'account locked' : 'account inactive', user.id);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    if (!(await this.passwords.verify(user.passwordHash, password))) {
      const locked = await this.registerFailure(user);
      await failed(locked ? 'wrong password, account now locked' : 'wrong password', user.id);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    // Maximum password age: an expired password must be replaced before anything else can be done.
    const now = new Date();
    const expired = !user.mustChangePassword && isPasswordExpired(user.passwordChangedAt, now);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lastFailedLoginAt: null,
        lockedUntil: null,
        lastLoginAt: now,
        ...(expired && { mustChangePassword: true }),
      },
    });
    await this.audit.record({
      actor: { id: user.id, name: user.name, email: user.email },
      action: 'auth.login',
      summary: expired ? 'Signed in (password expired, change required)' : 'Signed in',
      entityType: 'user',
      entityId: user.id,
      companyIds: await this.companyIdsOf(user.id),
      ip,
    });
    return this.createSession(user.id);
  }

  async logout(actor: AuthUser, ip?: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { id: actor.sessionId } });
    await this.audit.record({
      actor: { id: actor.id, name: actor.name, email: actor.email },
      action: 'auth.logout',
      summary: 'Signed out',
      entityType: 'user',
      entityId: actor.id,
      companyIds: actor.companyIds,
      ip,
    });
  }

  async changePassword(actor: AuthUser, current: string, next: string, ip?: string): Promise<void> {
    const userId = actor.id;
    const sessionId = actor.sessionId;
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await this.passwords.verify(user.passwordHash, current))) {
      throw new BadRequestException('Current password is incorrect');
    }
    if (await this.passwords.verify(user.passwordHash, next)) {
      throw new BadRequestException('New password must differ from the current password');
    }
    // Minimum password age. Not applied when the change is forced (first login, admin reset, expiry).
    if (!user.mustChangePassword && !canChangePassword(user.passwordChangedAt, new Date())) {
      throw new BadRequestException(
        `You changed your password less than ${PASSWORD_POLICY.minAgeDays} day ago. Try again later, or ask an admin to reset it.`,
      );
    }
    await this.setPassword(userId, next, sessionId);
    await this.audit.record({
      actor: { id: actor.id, name: actor.name, email: actor.email },
      action: 'auth.password_changed',
      summary: 'Changed own password',
      entityType: 'user',
      entityId: actor.id,
      companyIds: actor.companyIds,
      ip,
    });
  }

  /** Always resolves silently so the endpoint cannot be used to discover registered emails. */
  async requestReset(email: string, ip?: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user?.active) return;

    const token = randomBytes(32).toString('hex');
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TOKEN_MINUTES * 60_000),
      },
    });
    await this.audit.record({
      action: 'auth.password_reset_requested',
      summary: `Password reset requested for ${user.email}`,
      entityType: 'user',
      entityId: user.id,
      companyIds: await this.companyIdsOf(user.id),
      ip,
    });
    const link = `${this.config.get('APP_URL', { infer: true })}/reset-password?token=${token}`;
    await this.mail
      .send(user.email, 'CIMS password reset', `Use this link within ${RESET_TOKEN_MINUTES} minutes:\n${link}`)
      .catch(() => undefined);
  }

  async resetPassword(token: string, next: string, ip?: string): Promise<void> {
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Reset link is invalid or has expired');
    }
    await this.prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    await this.setPassword(record.userId, next);
    const user = await this.prisma.user.findUnique({ where: { id: record.userId }, select: { id: true, name: true, email: true } });
    await this.audit.record({
      actor: user,
      action: 'auth.password_reset_completed',
      summary: 'Reset password using an emailed link',
      entityType: 'user',
      entityId: record.userId,
      companyIds: await this.companyIdsOf(record.userId),
      ip,
    });
  }

  private async companyIdsOf(userId: string): Promise<string[]> {
    const rows = await this.prisma.userCompany.findMany({ where: { userId }, select: { companyId: true } });
    return rows.map((r) => r.companyId);
  }

  /**
   * Sets a new password chosen by the user: checks the policy and the password history, clears forced-change and
   * lock state, remembers the password and ends every other session of the user.
   */
  async setPassword(userId: string, plain: string, keepSessionId?: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { name: true, email: true, passwordHash: true },
    });
    this.passwords.assertPolicy(plain, { name: user.name, email: user.email });
    await this.passwords.assertNotReused(userId, plain, user.passwordHash);

    const passwordHash = await this.passwords.hash(plain);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          passwordChangedAt: new Date(),
          mustChangePassword: false,
          failedLoginAttempts: 0,
          lastFailedLoginAt: null,
          lockedUntil: null,
        },
      });
      await tx.session.deleteMany({ where: { userId, ...(keepSessionId && { id: { not: keepSessionId } }) } });
      await this.passwords.remember(tx, userId, passwordHash);
    });
  }

  /** Counts a failed sign-in and locks the account (until an admin unlocks it) when the threshold is reached. */
  private async registerFailure(user: { id: string; name: string; email: string; failedLoginAttempts: number; lastFailedLoginAt: Date | null }): Promise<boolean> {
    const outcome = afterFailedLogin(user, new Date());
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: outcome.failedLoginAttempts,
        lastFailedLoginAt: outcome.lastFailedLoginAt,
        lockedUntil: outcome.lockedUntil,
      },
    });
    if (outcome.locked) {
      await this.audit.record({
        action: 'auth.account_locked',
        summary: `Account locked after ${PASSWORD_POLICY.lockoutThreshold} failed sign-ins: ${user.email}`,
        entityType: 'user',
        entityId: user.id,
        companyIds: await this.companyIdsOf(user.id),
      });
    }
    return outcome.locked;
  }

  private async createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_MAX_HOURS * 3_600_000);
    await this.prisma.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt } });
    return { token, expiresAt };
  }
}
