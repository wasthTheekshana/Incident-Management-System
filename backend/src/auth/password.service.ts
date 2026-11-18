import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { Identity, PASSWORD_POLICY, unmetRules } from './password.policy';

// Look-alike characters (I, l, O, 0, 1) are left out so a temporary password can be read out or typed without mistakes.
const LOWER = 'abcdefghjkmnpqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const SPECIAL = '$@!%*#?&';
const TEMP_PASSWORD_LENGTH = 14;

@Injectable()
export class PasswordService {
  constructor(private readonly prisma: PrismaService) {}

  hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  verify(hash: string, plain: string): Promise<boolean> {
    return argon2.verify(hash, plain);
  }

  /** Enforces the rules in password.policy.ts and names every rule that is not met. */
  assertPolicy(plain: string, identity: Identity = {}): void {
    const unmet = unmetRules(plain, identity);
    if (unmet.length === 0) return;
    const missing = unmet.map((r) => r.label.charAt(0).toLowerCase() + r.label.slice(1));
    throw new BadRequestException(`Password does not meet the policy. It needs: ${missing.join('; ')}`);
  }

  /** AD "Enforce password history": the new password may not match the current one or the previous ones. */
  async assertNotReused(userId: string, plain: string, currentHash?: string): Promise<void> {
    const rows = await this.prisma.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: PASSWORD_POLICY.historyCount,
      select: { passwordHash: true },
    });
    const hashes = new Set([...(currentHash ? [currentHash] : []), ...rows.map((r) => r.passwordHash)]);
    for (const hash of hashes) {
      if (await this.verify(hash, plain).catch(() => false)) {
        throw new BadRequestException(`You cannot reuse any of your last ${PASSWORD_POLICY.historyCount} passwords`);
      }
    }
  }

  /** Records a password hash in the user's history and forgets everything older than the remembered few. */
  async remember(tx: Prisma.TransactionClient, userId: string, passwordHash: string): Promise<void> {
    await tx.passwordHistory.create({ data: { userId, passwordHash } });
    const stale = await tx.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: PASSWORD_POLICY.historyCount,
      select: { id: true },
    });
    if (stale.length) await tx.passwordHistory.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
  }

  /** Always satisfies the policy: one character of every required kind, the rest random, then shuffled. */
  generateTemporary(): string {
    const pick = (set: string) => set[randomInt(set.length)];
    const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SPECIAL)];
    const all = LOWER + UPPER + DIGITS + SPECIAL;
    while (chars.length < TEMP_PASSWORD_LENGTH) chars.push(pick(all));
    for (let i = chars.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
  }
}
