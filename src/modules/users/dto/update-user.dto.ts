import {
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator'
import { UserStatus } from '@prisma/client'

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string

  @IsOptional()
  @IsString()
  phone?: string

  @IsOptional()
  @IsString()
  telegramChatId?: string

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus
}