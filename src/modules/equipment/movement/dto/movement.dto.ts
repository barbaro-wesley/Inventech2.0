import {
    IsDateString, IsEnum, IsOptional, IsString, IsUUID,
} from 'class-validator'
import { MovementType } from '@prisma/client'

export class CreateMovementDto {
    @IsUUID()
    originLocationId: string

    @IsUUID()
    destinationLocationId: string

    @IsEnum(MovementType)
    type: MovementType  // TRANSFER | LOAN

    @IsOptional()
    @IsString()
    reason?: string

    @IsOptional()
    @IsDateString()
    expectedReturnAt?: string  // Obrigatório para LOAN

    @IsOptional()
    @IsString()
    notes?: string
}

export class ReturnMovementDto {
    @IsOptional()
    @IsString()
    notes?: string
}