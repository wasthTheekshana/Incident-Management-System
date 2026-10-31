import { Controller, Get, Param, ParseUUIDPipe, Post, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators';
import { AttachmentsService } from './attachments.service';

// Hard ceiling for the multipart parser; the configurable per-file limit (<= this) is enforced in the service.
const PARSER_MAX_FILE_BYTES = 50 * 1024 * 1024;
const PARSER_MAX_FILES = 20;

@Controller('incidents/:incidentId/attachments')
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Post()
  @UseInterceptors(FilesInterceptor('files', PARSER_MAX_FILES, { limits: { fileSize: PARSER_MAX_FILE_BYTES } }))
  upload(
    @CurrentUser() user: AuthUser,
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.attachments.upload(user, incidentId, files);
  }

  @Get(':attachmentId')
  download(
    @CurrentUser() user: AuthUser,
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ) {
    return this.attachments.download(user, incidentId, attachmentId);
  }
}
