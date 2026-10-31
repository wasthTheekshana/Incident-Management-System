import { Role } from '@prisma/client';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const PHONE = /^\+?[0-9 ()-]{7,20}$/;

export class CreateUserDto {
  @IsString() @MinLength(2) @MaxLength(120)
  name: string;

  @IsEmail() @MaxLength(254)
  email: string;

  @IsOptional() @Matches(PHONE, { message: 'contact number is not valid' })
  phone?: string;

  @IsEnum(Role)
  role: Role;

  @IsArray() @ArrayMinSize(1) @ArrayUnique() @IsUUID('all', { each: true })
  companyIds: string[];
}

export class UpdateUserDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120)
  name?: string;

  @IsOptional() @Matches(PHONE, { message: 'contact number is not valid' })
  phone?: string;

  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayUnique() @IsUUID('all', { each: true })
  companyIds?: string[];

  @IsOptional() @IsBoolean()
  active?: boolean;
}
