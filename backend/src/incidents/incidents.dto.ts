import { Priority, Stage } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateIncidentDto {
  @IsUUID() companyId: string;
  @IsUUID() templateId: string;

  @Transform(trim) @IsString() @MinLength(3) @MaxLength(200)
  title: string;

  @Transform(trim) @IsString() @MinLength(1) @MaxLength(10_000)
  description: string;

  /** Defaults to the template's default priority (FR-15). */
  @IsOptional() @IsEnum(Priority)
  priority?: Priority;

  @IsOptional() @IsObject()
  fieldValues?: Record<string, unknown>;
}

export class ChangeStageDto {
  @IsEnum(Stage) stage: Stage;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(5000)
  comment?: string;
}

export class ChangePriorityDto {
  @IsEnum(Priority) priority: Priority;

  @Transform(trim) @IsString() @MinLength(3) @MaxLength(1000)
  reason: string;
}

export class AssignDto {
  @IsUUID() userId: string;
}

export class ReassignDto extends AssignDto {
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(1000)
  reason: string;
}

export class RootCauseDto {
  @ValidateIf((o: RootCauseDto) => !o.rootCauseText) @IsUUID()
  rootCauseId?: string;

  /** The "Other" option: free-text root cause used when no list entry fits. */
  @ValidateIf((o: RootCauseDto) => !o.rootCauseId) @Transform(trim) @IsString() @MinLength(2) @MaxLength(500)
  rootCauseText?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(5000)
  correctiveAction?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(5000)
  resolutionNotes?: string;
}

export class AddCommentDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(5000)
  body: string;
}

export class IncidentFilterDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  @IsOptional() @IsEnum(Stage) stage?: Stage;
  @IsOptional() @IsUUID() assigneeId?: string;
  @IsOptional() @IsUUID() templateId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class ListIncidentsQuery extends IncidentFilterDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25;
}

export class ExportQuery extends IncidentFilterDto {
  @IsOptional() @IsEnum({ csv: 'csv', xlsx: 'xlsx' }) format: 'csv' | 'xlsx' = 'xlsx';
}
