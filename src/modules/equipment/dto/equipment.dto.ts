import {
    IsDateString, IsDecimal, IsEnum, IsInt, IsOptional,
    IsString, IsUUID, Max, Min,
} from 'class-validator'
import { Type } from 'class-transformer'
import { EquipmentCriticality, EquipmentStatus } from '@prisma/client'

export class CreateEquipmentDto {
    @IsString()
    name: string

    @IsOptional()
    @IsString()
    brand?: string

    @IsOptional()
    @IsString()
    model?: string

    @IsOptional()
    @IsString()
    serialNumber?: string

    @IsOptional()
    @IsString()
    patrimonyNumber?: string

    @IsOptional()
    @IsString()
    anvisaNumber?: string

    @IsOptional()
    @IsUUID()
    typeId?: string

    @IsOptional()
    @IsUUID()
    subtypeId?: string

    @IsOptional()
    @IsUUID()
    locationId?: string

    @IsOptional()
    @IsUUID()
    costCenterId?: string

    // Aquisição
    @IsOptional()
    @IsDecimal()
    purchaseValue?: string

    @IsOptional()
    @IsDateString()
    purchaseDate?: string

    @IsOptional()
    @IsString()
    invoiceNumber?: string

    @IsOptional()
    @IsDateString()
    warrantyStart?: string

    @IsOptional()
    @IsDateString()
    warrantyEnd?: string

    // Depreciação
    @IsOptional()
    @IsDecimal()
    depreciationRate?: string  // % ao ano

    // Técnico
    @IsOptional()
    @IsString()
    ipAddress?: string

    @IsOptional()
    @IsString()
    operatingSystem?: string

    @IsOptional()
    @IsInt()
    btus?: number

    @IsOptional()
    @IsString()
    voltage?: string

    @IsOptional()
    @IsString()
    power?: string

    @IsOptional()
    @IsEnum(EquipmentCriticality)
    criticality?: EquipmentCriticality = EquipmentCriticality.MEDIUM

    @IsOptional()
    @IsString()
    observations?: string
}

export class UpdateEquipmentDto {
    @IsOptional() @IsString() name?: string
    @IsOptional() @IsString() brand?: string
    @IsOptional() @IsString() model?: string
    @IsOptional() @IsString() serialNumber?: string
    @IsOptional() @IsString() patrimonyNumber?: string
    @IsOptional() @IsString() anvisaNumber?: string
    @IsOptional() @IsUUID() typeId?: string
    @IsOptional() @IsUUID() subtypeId?: string
    @IsOptional() @IsUUID() locationId?: string
    @IsOptional() @IsUUID() costCenterId?: string
    @IsOptional() @IsDecimal() purchaseValue?: string
    @IsOptional() @IsDateString() purchaseDate?: string
    @IsOptional() @IsString() invoiceNumber?: string
    @IsOptional() @IsDateString() warrantyStart?: string
    @IsOptional() @IsDateString() warrantyEnd?: string
    @IsOptional() @IsDecimal() depreciationRate?: string
    @IsOptional() @IsString() ipAddress?: string
    @IsOptional() @IsString() operatingSystem?: string
    @IsOptional() @IsInt() btus?: number
    @IsOptional() @IsString() voltage?: string
    @IsOptional() @IsString() power?: string
    @IsOptional() @IsEnum(EquipmentCriticality) criticality?: EquipmentCriticality
    @IsOptional() @IsEnum(EquipmentStatus) status?: EquipmentStatus
    @IsOptional() @IsString() observations?: string
}

export class ListEquipmentsDto {
    @IsOptional() @IsString() search?: string
    @IsOptional() @IsEnum(EquipmentStatus) status?: EquipmentStatus
    @IsOptional() @IsEnum(EquipmentCriticality) criticality?: EquipmentCriticality
    @IsOptional() @IsUUID() typeId?: string
    @IsOptional() @IsUUID() locationId?: string
    @IsOptional() @IsUUID() costCenterId?: string

    @IsOptional()
    @Type(() => Number)
    @IsInt() @Min(1)
    page?: number = 1

    @IsOptional()
    @Type(() => Number)
    @IsInt() @Min(1) @Max(100)
    limit?: number = 20
}