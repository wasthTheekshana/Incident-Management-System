import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { Env } from '../config/env.validation';
import { hashToken } from '../common/session.guard';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
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
  ) {}

  async login(email: string, password: string): Promise<{ token: string; expiresAt: Date }> {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });

    if (!user) {
      this.dummyHash ??= this.passwords.hash(randomBytes(16).toString('hex'));
      await this.passwords.verify(await this.dummyHash, password).catch(() => false);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    // Locked and inactive accounts get the same message as bad credentials (no state disclosure).
    if (!user.active || (user.lockedUntil && user.lockedUntil > new Date())) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    if (!(await this.passwords.verify(user.passwordHash, password))) {
      await this.registerFailure(user.id, user.failedLoginAttempts);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    return this.createSession(user.id);
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { id: sessionId } });
  }

  async changePassword(userId: string, sessionId: string, current: string, next: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await this.passwords.verify(user.passwordHash, current))) {
      throw new BadRequestException('Current password is incorrect');
    }
    if (await this.passwords.verify(user.passwordHash, next)) {
      throw new BadRequestException('New password must differ from the current password');
    }
    await this.setPassword(userId, next, sessionId);
  }

  /** Always resolves silently so the endpoint cannot be used to discover registered emails. */
  async requestReset(email: string): Promise<void> {
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
    const link = `${this.config.get('APP_URL', { infer: true })}/reset-password?token=${token}`;
    await this.mail
      .send(user.email, 'CIMS password reset', `Use this link within ${RESET_TOKEN_MINUTES} minutes:\n${link}`)
      .catch(() => undefined);
  }

  async resetPassword(token: string, next: string): Promise<void> {
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Reset link is invalid or has expired');
    }
    await this.prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    await this.setPassword(record.userId, next);
  }

  /** Sets a new password, clears forced-change/lock state and ends every other session of the user. */
  async setPassword(userId: string, plain: string, keepSessionId?: string): Promise<void> {
    this.passwords.assertPolicy(plain);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash: await this.passwords.hash(plain),
          mustChangePassword: false,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      }),
      this.prisma.session.deleteMany({ where: { userId, ...(keepSessionId && { id: { not: keepSessionId } }) } }),
    ]);
  }

  private async registerFailure(userId: string, previousAttempts: number): Promise<void> {
    const attempts = previousAttempts + 1;
    const lock = attempts >= MAX_FAILED_ATTEMPTS;
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: lock ? 0 : attempts,
        lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      },
    });
  }

  private async createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_MAX_HOURS * 3_600_000);
    await this.prisma.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt } });
    return { token, expiresAt };
  }
}
