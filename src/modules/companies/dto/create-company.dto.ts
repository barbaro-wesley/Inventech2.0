import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
  IsDateString,
} from 'class-validator'
import { Type } from 'class-transformer'
import { CompanyStatus } from '@prisma/client'

// Admin inicial criado junto com a empresa
export class CreateCompanyAdminDto {
  @IsString()
  name: string

  @IsEmail({}, { message: 'Email do admin inválido' })
  email: string

  @IsString()
  @MinLength(6, { message: 'Senha deve ter no mínimo 6 caracteres' })
  password: string

  @IsOptional()
  @IsString()
  phone?: string
}

export class CreateCompanyDto {
  @IsString()
  name: string

  @IsOptional()
  @IsString()
  document?: string  // CNPJ

  @IsOptional()
  @IsEmail()
  email?: string

  @IsOptional()
  @IsString()
  phone?: string

  @IsOptional()
  @IsEnum(CompanyStatus)
  status?: CompanyStatus = CompanyStatus.ACTIVE

  @IsOptional()
  @IsDateString()
  trialEndsAt?: string

  // Admin da empresa — criado junto na mesma transação
  @ValidateNested()
  @Type(() => CreateCompanyAdminDto)
  admin: CreateCompanyAdminDto
}