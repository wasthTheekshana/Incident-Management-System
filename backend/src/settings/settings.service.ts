import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Defaults come from the SRS (FR-3, §2.5); Super Admin overrides are stored in the Setting table. */
export const SETTING_DEFAULTS = {
  sessionIdleMinutes: '30',
  attachmentMaxBytes: String(10 * 1024 * 1024),
  attachmentMaxFiles: '5',
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getNumber(key: SettingKey): Promise<number> {
    const row = await this.prisma.setting.findUnique({ where: { key } });
    return Number(row?.value ?? SETTING_DEFAULTS[key]);
  }

  async getAll(): Promise<Record<SettingKey, number>> {
    const rows = await this.prisma.setting.findMany();
    const stored = new Map(rows.map((r) => [r.key, r.value]));
    const out = {} as Record<SettingKey, number>;
    for (const key of Object.keys(SETTING_DEFAULTS) as SettingKey[]) {
      out[key] = Number(stored.get(key) ?? SETTING_DEFAULTS[key]);
    }
    return out;
  }

  async set(key: SettingKey, value: number): Promise<void> {
    await this.prisma.setting.upsert({
      where: { key },
      update: { value: String(value) },
      create: { key, value: String(value) },
    });
  }
}
