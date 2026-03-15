import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator'
import { CompanyStatus } from '@prisma/client'

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsString()
  document?: string

  @IsOptional()
  @IsEmail()
  email?: string

  @IsOptional()
  @IsString()
  phone?: string

  @IsOptional()
  @IsEnum(CompanyStatus)
  status?: CompanyStatus

  @IsOptional()
  @IsDateString()
  trialEndsAt?: string

  @IsOptional()
  settings?: Record<string, any>
}