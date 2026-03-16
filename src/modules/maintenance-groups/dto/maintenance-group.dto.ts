import {
    IsBoolean, IsHexColor, IsInt, IsOptional,
    IsString, IsUUID, Max, Min,
} from 'class-validator'
import { Type } from 'class-transformer'

export class CreateMaintenanceGroupDto {
    @IsString()
    name: string  // Ex: "Elétrica", "Hidráulica", "Predial"

    @IsOptional()
    @IsString()
    description?: string

    @IsOptional()
    @IsHexColor()
    color?: string  // Ex: "#3B82F6"
}

export class UpdateMaintenanceGroupDto {
    @IsOptional()
    @IsString()
    name?: string

    @IsOptional()
    @IsString()
    description?: string

    @IsOptional()
    @IsHexColor()
    color?: string

    @IsOptional()
    @IsBoolean()
    isActive?: boolean
}

export class ListMaintenanceGroupsDto {
    @IsOptional()
    @IsString()
    search?: string

    @IsOptional()
    @IsBoolean()
    isActive?: boolean

    @IsOptional()
    @Type(() => Number)
    @IsInt() @Min(1)
    page?: number = 1

    @IsOptional()
    @Type(() => Number)
    @IsInt() @Min(1) @Max(100)
    limit?: number = 50
}

// Para vincular/desvincular técnico a grupo
export class AssignTechnicianToGroupDto {
    @IsUUID()
    technicianId: string
}