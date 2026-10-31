import { BadRequestException, Injectable } from '@nestjs/common';
import { Priority } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** FR-17 defaults, in minutes. Used until Super Admin saves their own values. */
export const DEFAULT_SLA: Record<Priority, { responseMinutes: number; resolutionMinutes: number }> = {
  P1: { responseMinutes: 15, resolutionMinutes: 4 * 60 },
  P2: { responseMinutes: 30, resolutionMinutes: 8 * 60 },
  P3: { responseMinutes: 2 * 60, resolutionMinutes: 2 * 24 * 60 },
  P4: { responseMinutes: 4 * 60, resolutionMinutes: 5 * 24 * 60 },
};

export interface SlaWindow {
  responseMinutes: number;
  resolutionMinutes: number;
}

@Injectable()
export class SlaConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getAll(): Promise<Record<Priority, SlaWindow>> {
    const rows = await this.prisma.prioritySLA.findMany();
    const result = { ...DEFAULT_SLA };
    for (const row of rows) {
      result[row.priority] = { responseMinutes: row.responseMinutes, resolutionMinutes: row.resolutionMinutes };
    }
    return result;
  }

  async getFor(priority: Priority): Promise<SlaWindow> {
    return (await this.getAll())[priority];
  }

  /** UC-8: applies to incidents created afterwards; existing incidents keep their due times. */
  async save(priority: Priority, responseMinutes: number, resolutionMinutes: number): Promise<void> {
    if (resolutionMinutes < responseMinutes) {
      throw new BadRequestException(`${priority}: resolution time cannot be shorter than response time`);
    }
    await this.prisma.prioritySLA.upsert({
      where: { priority },
      update: { responseMinutes, resolutionMinutes },
      create: { priority, responseMinutes, resolutionMinutes },
    });
  }
}
