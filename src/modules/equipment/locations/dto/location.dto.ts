import {
    IsBoolean,
    IsInt,
    IsOptional,
    IsString,
    IsUUID,
    Max,
    Min,
} from 'class-validator'
import { Type } from 'class-transformer'

export class CreateLocationDto {
    @IsString()
    name: string

    @IsOptional()
    @IsString()
    description?: string

    @IsOptional()
    @IsUUID()
    parentId?: string  // Hierarquia — null = raiz
}

export class UpdateLocationDto {
    @IsOptional()
    @IsString()
    name?: string

    @IsOptional()
    @IsString()
    description?: string

    @IsOptional()
    @IsUUID()
    parentId?: string

    @IsOptional()
    @IsBoolean()
    isActive?: boolean
}

export class ListLocationsDto {
    @IsOptional()
    @IsString()
    search?: string

    @IsOptional()
    @IsUUID()
    parentId?: string  // Filtra por pai específico

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