import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export interface HistoryEntry {
  incidentId: string;
  userId: string | null;
  action: string;
  field?: string;
  oldValue?: string | null;
  newValue?: string | null;
}

/**
 * Append-only audit trail (FR-33). This service deliberately exposes no update or delete;
 * it writes inside the caller's transaction so a change and its audit record commit together.
 */
@Injectable()
export class IncidentHistoryService {
  async record(tx: Prisma.TransactionClient, ...entries: HistoryEntry[]): Promise<void> {
    if (!entries.length) return;
    await tx.incidentHistory.createMany({
      data: entries.map((e) => ({
        incidentId: e.incidentId,
        userId: e.userId,
        action: e.action,
        field: e.field,
        oldValue: e.oldValue ?? null,
        newValue: e.newValue ?? null,
      })),
    });
  }
}
