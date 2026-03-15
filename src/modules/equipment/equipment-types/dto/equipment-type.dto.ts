import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator'
import { Type } from 'class-transformer'

export class CreateEquipmentTypeDto {
    @IsString()
    name: string

    @IsOptional()
    @IsString()
    description?: string
}

export class UpdateEquipmentTypeDto {
    @IsOptional()
    @IsString()
    name?: string

    @IsOptional()
    @IsString()
    description?: string

    @IsOptional()
    @IsBoolean()
    isActive?: boolean
}

export class CreateEquipmentSubtypeDto {
    @IsUUID()
    typeId: string

    @IsString()
    name: string

    @IsOptional()
    @IsString()
    description?: string
}

export class UpdateEquipmentSubtypeDto {
    @IsOptional()
    @IsString()
    name?: string

    @IsOptional()
    @IsString()
    description?: string

    @IsOptional()
    @IsBoolean()
    isActive?: boolean
}

export class ListEquipmentTypesDto {
    @IsOptional()
    @IsString()
    search?: string

    @IsOptional()
    @IsBoolean()
    isActive?: boolean

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
    limit?: number = 50
}