import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { Type } from 'class-transformer'

export class CreateCostCenterDto {
    @IsString()
    name: string

    @IsOptional()
    @IsString()
    code?: string  // Código interno do cliente (ex: CC-001)

    @IsOptional()
    @IsString()
    description?: string
}

export class UpdateCostCenterDto {
    @IsOptional()
    @IsString()
    name?: string

    @IsOptional()
    @IsString()
    code?: string

    @IsOptional()
    @IsString()
    description?: string

    @IsOptional()
    @IsBoolean()
    isActive?: boolean
}

export class ListCostCentersDto {
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