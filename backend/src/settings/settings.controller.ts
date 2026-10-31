import { Body, Controller, Get, Put } from '@nestjs/common';
import { Role } from '@prisma/client';
import { IsInt, Max, Min } from 'class-validator';
import { Roles } from '../common/decorators';
import { SettingsService } from './settings.service';

class UpdateSettingsDto {
  @IsInt() @Min(5) @Max(480)
  sessionIdleMinutes: number;

  @IsInt() @Min(1024) @Max(50 * 1024 * 1024)
  attachmentMaxBytes: number;

  @IsInt() @Min(1) @Max(20)
  attachmentMaxFiles: number;
}

@Controller('settings')
@Roles(Role.SUPER_ADMIN)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get() {
    return this.settings.getAll();
  }

  @Put()
  async update(@Body() dto: UpdateSettingsDto) {
    for (const key of ['sessionIdleMinutes', 'attachmentMaxBytes', 'attachmentMaxFiles'] as const) {
      await this.settings.set(key, dto[key]);
    }
    return this.settings.getAll();
  }
}
