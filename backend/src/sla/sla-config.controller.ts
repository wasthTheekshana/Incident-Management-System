import { Body, Controller, Get, Put } from '@nestjs/common';
import { Priority, Role } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsInt, Max, Min, ValidateNested } from 'class-validator';
import { Roles } from '../common/decorators';
import { SlaConfigService } from './sla-config.service';

const MAX_MINUTES = 60 * 24 * 365;

class PrioritySlaDto {
  @IsEnum(Priority) priority: Priority;
  @IsInt() @Min(1) @Max(MAX_MINUTES) responseMinutes: number;
  @IsInt() @Min(1) @Max(MAX_MINUTES) resolutionMinutes: number;
}

class SaveSlaDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(4) @ValidateNested({ each: true }) @Type(() => PrioritySlaDto)
  priorities: PrioritySlaDto[];
}

@Controller('sla-config')
export class SlaConfigController {
  constructor(private readonly sla: SlaConfigService) {}

  /** Read access for everyone: the report form shows due times for the chosen priority. */
  @Get()
  get() {
    return this.sla.getAll();
  }

  @Roles(Role.SUPER_ADMIN)
  @Put()
  async save(@Body() dto: SaveSlaDto) {
    for (const p of dto.priorities) await this.sla.save(p.priority, p.responseMinutes, p.resolutionMinutes);
    return this.sla.getAll();
  }
}
