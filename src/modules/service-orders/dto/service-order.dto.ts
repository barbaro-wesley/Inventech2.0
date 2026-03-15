import {
    IsEnum, IsInt, IsOptional, IsString,
    IsUUID, Max, Min,
} from 'class-validator'
import { Type } from 'class-transformer'
import { ServiceOrderPriority, ServiceOrderStatus } from '@prisma/client'

export class CreateServiceOrderDto {
    @IsUUID()
    equipmentId: string

    @IsString()
    title: string

    @IsString()
    description: string

    @IsOptional()
    @IsEnum(ServiceOrderPriority)
    priority?: ServiceOrderPriority = ServiceOrderPriority.MEDIUM

    @IsOptional()
    @IsUUID()
    technicianId?: string

    @IsOptional()
    @IsString()
    scheduledFor?: string  // ISO date string
}

export class UpdateServiceOrderDto {
    @IsOptional()
    @IsString()
    title?: string

    @IsOptional()
    @IsString()
    description?: string

    @IsOptional()
    @IsEnum(ServiceOrderPriority)
    priority?: ServiceOrderPriority

    @IsOptional()
    @IsUUID()
    technicianId?: string

    @IsOptional()
    @IsString()
    scheduledFor?: string

    @IsOptional()
    @IsString()
    resolution?: string

    @IsOptional()
    @IsString()
    internalNotes?: string
}

export class UpdateServiceOrderStatusDto {
    @IsEnum(ServiceOrderStatus)
    status: ServiceOrderStatus

    @IsOptional()
    @IsString()
    reason?: string  // Motivo da mudança (obrigatório em reprovação)

    @IsOptional()
    @IsString()
    resolution?: string  // Preenchido ao concluir
}

export class AssignTechnicianDto {
    @IsUUID()
    technicianId: string
}

export class ListServiceOrdersDto {
    @IsOptional()
    @IsString()
    search?: string

    @IsOptional()
    @IsEnum(ServiceOrderStatus)
    status?: ServiceOrderStatus

    @IsOptional()
    @IsEnum(ServiceOrderPriority)
    priority?: ServiceOrderPriority

    @IsOptional()
    @IsUUID()
    equipmentId?: string

    @IsOptional()
    @IsUUID()
    technicianId?: string

    @IsOptional()
    @IsUUID()
    requesterId?: string

    @IsOptional()
    @IsString()
    dateFrom?: string  // Filtro por data de criação

    @IsOptional()
    @IsString()
    dateTo?: string

    @IsOptional()
    @Type(() => Number)
    @IsInt() @Min(1)
    page?: number = 1

    @IsOptional()
    @Type(() => Number)
    @IsInt() @Min(1) @Max(100)
    limit?: number = 20
}