import { FieldType, Priority } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class TemplateFieldDto {
  /** Stable identifier of the field across versions; generated when omitted. */
  @IsOptional() @Matches(/^[a-z][a-z0-9_]{0,39}$/)
  key?: string;

  @IsString() @MinLength(1) @MaxLength(120)
  label: string;

  @IsEnum(FieldType)
  type: FieldType;

  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(120, { each: true })
  options?: string[];

  @IsBoolean()
  mandatory: boolean;
}

export class SaveTemplateDto {
  @IsString() @MinLength(2) @MaxLength(120)
  name: string;

  @IsOptional() @IsString() @MaxLength(1000)
  description?: string;

  @IsOptional() @IsString() @MaxLength(80)
  defaultCategory?: string;

  @IsEnum(Priority)
  defaultPriority: Priority;

  @IsArray() @ArrayMinSize(1) @ArrayUnique() @IsUUID('all', { each: true })
  companyIds: string[];

  @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => TemplateFieldDto)
  fields: TemplateFieldDto[];

  @IsOptional() @IsBoolean()
  active?: boolean;
}
