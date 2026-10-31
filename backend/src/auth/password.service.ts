import { BadRequestException, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';

const MIN_LENGTH = 8;
const TEMP_PASSWORD_LENGTH = 14;
const TEMP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  verify(hash: string, plain: string): Promise<boolean> {
    return argon2.verify(hash, plain);
  }

  /** NFR-2: at least 8 characters containing letters and numbers. */
  assertPolicy(plain: string): void {
    if (plain.length < MIN_LENGTH || !/[A-Za-z]/.test(plain) || !/\d/.test(plain)) {
      throw new BadRequestException(`Password must be at least ${MIN_LENGTH} characters and contain letters and numbers`);
    }
  }

  /** Always satisfies the policy: guarantees at least one letter and one digit. */
  generateTemporary(): string {
    const bytes = randomBytes(TEMP_PASSWORD_LENGTH);
    let out = '';
    for (const b of bytes) out += TEMP_ALPHABET[b % TEMP_ALPHABET.length];
    return `${out.slice(0, -2)}${(bytes[0] % 8) + 2}a`;
  }
}
