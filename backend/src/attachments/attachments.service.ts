import { BadRequestException, ForbiddenException, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Stage } from '@prisma/client';
import { randomUUID } from 'crypto';
import { createReadStream } from 'fs';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { dirname, join, resolve, sep } from 'path';
import { AuthUser } from '../common/auth.types';
import { Env } from '../config/env.validation';
import { IncidentHistoryService } from '../incidents/incident-history.service';
import { IncidentLoader } from '../incidents/incident-loader.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { DetectedFile, detectFile, extensionMatches, sanitiseFileName } from './file-signature';

const mb = (bytes: number) => Math.round((bytes / (1024 * 1024)) * 10) / 10;

@Injectable()
export class AttachmentsService {
  private readonly root: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly loader: IncidentLoader,
    private readonly history: IncidentHistoryService,
    private readonly settings: SettingsService,
    config: ConfigService<Env, true>,
  ) {
    this.root = resolve(config.get('UPLOAD_DIR', { infer: true }));
  }

  /** FR-14. All files are validated before any is stored, so a rejected batch leaves nothing behind. */
  async upload(user: AuthUser, incidentId: string, files: Express.Multer.File[]) {
    const incident = await this.loader.loadAccessible(user, incidentId);
    const allowed =
      user.id === incident.reporterId ||
      user.id === incident.assigneeId ||
      user.id === incident.resolverId ||
      this.loader.isCompanyAdmin(user, incident.companyId);
    if (!allowed) throw new ForbiddenException('You cannot attach files to this incident');
    if (incident.stage === Stage.CLOSED) throw new BadRequestException('Incident is closed');
    if (!files?.length) throw new BadRequestException('No files were uploaded');

    const [maxBytes, maxFiles] = await Promise.all([
      this.settings.getNumber('attachmentMaxBytes'),
      this.settings.getNumber('attachmentMaxFiles'),
    ]);
    if (files.length > maxFiles) throw new BadRequestException(`You can upload at most ${maxFiles} files at a time`);

    const validated = files.map((file) => ({ file, detected: this.validate(file, maxBytes) }));

    const stored: { key: string; file: Express.Multer.File; detected: DetectedFile }[] = [];
    try {
      for (const { file, detected } of validated) {
        const key = join(String(new Date().getUTCFullYear()), `${randomUUID()}.${detected.extension}`);
        await this.write(key, file.buffer);
        stored.push({ key, file, detected });
      }
      return await this.prisma.$transaction(async (tx) => {
        const rows = [];
        for (const { key, file, detected } of stored) {
          const row = await tx.attachment.create({
            data: {
              incidentId,
              fileName: sanitiseFileName(file.originalname),
              fileType: detected.mime,
              size: file.size,
              storageKey: key,
              uploadedBy: user.id,
            },
            select: { id: true, fileName: true, fileType: true, size: true, uploadedAt: true },
          });
          await this.history.record(tx, { incidentId, userId: user.id, action: 'ATTACHMENT_ADDED', field: 'attachment', newValue: row.fileName });
          rows.push(row);
        }
        return rows;
      });
    } catch (error) {
      await Promise.all(stored.map((s) => unlink(this.pathFor(s.key)).catch(() => undefined)));
      throw error;
    }
  }

  /** NFR-4: only users who can view the incident can download; the stored name is never user controlled. */
  async download(user: AuthUser, incidentId: string, attachmentId: string) {
    await this.loader.loadAccessible(user, incidentId);
    const attachment = await this.prisma.attachment.findFirst({ where: { id: attachmentId, incidentId } });
    if (!attachment) throw new NotFoundException('Attachment not found');

    return new StreamableFile(createReadStream(this.pathFor(attachment.storageKey)), {
      type: attachment.fileType,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
      length: attachment.size,
    });
  }

  private validate(file: Express.Multer.File, maxBytes: number): DetectedFile {
    if (file.size > maxBytes) {
      throw new BadRequestException(`"${file.originalname}" is larger than the ${mb(maxBytes)} MB limit`);
    }
    const detected = detectFile(file.buffer, file.originalname);
    if (!detected || !extensionMatches(file.originalname, detected)) {
      throw new BadRequestException(`"${file.originalname}" is not an allowed file type. Allowed: PDF, JPG, JPEG, PNG, CSV`);
    }
    return detected;
  }

  private async write(key: string, data: Buffer): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data, { flag: 'wx' });
  }

  /** Guards against a corrupted storage key ever resolving outside the upload root. */
  private pathFor(key: string): string {
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root + sep)) throw new ForbiddenException();
    return path;
  }
}
