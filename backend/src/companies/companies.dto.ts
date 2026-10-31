import { IsBoolean, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateCompanyDto {
  @IsString() @MinLength(2) @MaxLength(120)
  name: string;

  @IsString() @Matches(/^[A-Za-z0-9_-]{2,20}$/, { message: 'code must be 2-20 letters, digits, - or _' })
  code: string;
}

export class UpdateCompanyDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120)
  name?: string;

  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9_-]{2,20}$/)
  code?: string;

  @IsOptional() @IsBoolean()
  active?: boolean;
}

export class SetResponsiblePeopleDto {
  @IsOptional() @IsUUID()
  responsiblePersonId: string | null;

  @IsOptional() @IsUUID()
  backupPersonId: string | null;
}
