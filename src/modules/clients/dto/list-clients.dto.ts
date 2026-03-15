import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { Type } from 'class-transformer'
import { ClientStatus } from '@prisma/client'

export class ListClientsDto {
  @IsOptional()
  @IsString()
  search?: string  // Busca por nome, documento ou email

  @IsOptional()
  @IsEnum(ClientStatus)
  status?: ClientStatus

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20
}