import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateRootCauseDto {
  @IsString() @MinLength(2) @MaxLength(120)
  name: string;

  /** Omit for a global option available to every company. */
  @IsOptional() @IsUUID()
  companyId?: string;
}

export class UpdateRootCauseDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120)
  name?: string;

  @IsOptional() @IsBoolean()
  active?: boolean;
}

export class ListRootCausesQuery {
  @IsOptional() @IsUUID()
  companyId?: string;
}
