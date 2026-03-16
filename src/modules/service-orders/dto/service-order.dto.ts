import {
    IsEnum, IsInt, IsOptional, IsString,
    IsUUID, Max, Min,
} from 'class-validator'
import { Type } from 'class-transformer'
import {
    MaintenanceType,
    ServiceOrderPriority,
    ServiceOrderStatus,
    ServiceOrderTechnicianRole,
} from '@prisma/client'

export class CreateServiceOrderDto {
    @IsUUID()
    equipmentId: string

    @IsString()
    title: string

    @IsString()
    description: string

    @IsEnum(MaintenanceType)
    maintenanceType: MaintenanceType  // Preventiva, Corretiva etc.

    @IsOptional()
    @IsEnum(ServiceOrderPriority)
    priority?: ServiceOrderPriority = ServiceOrderPriority.MEDIUM

    // Grupo responsável (Elétrica, Hidráulica, Predial...)
    @IsOptional()
    @IsUUID()
    groupId?: string

    // Técnico é opcional — se não informar, vai para o painel
    @IsOptional()
    @IsUUID()
    technicianId?: string

    @IsOptional()
    @IsString()
    scheduledFor?: string

    // Horas sem assumir antes de disparar alerta (padrão: 2h)
    @IsOptional()
    @IsInt()
    @Min(1)
    alertAfterHours?: number
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
    groupId?: string

    @IsOptional()
    @IsString()
    scheduledFor?: string

    @IsOptional()
    @IsString()
    resolution?: string

    @IsOptional()
    @IsString()
    internalNotes?: string

    @IsOptional()
    @IsInt()
    @Min(1)
    alertAfterHours?: number
}

export class UpdateServiceOrderStatusDto {
    @IsEnum(ServiceOrderStatus)
    status: ServiceOrderStatus

    @IsOptional()
    @IsString()
    reason?: string

    @IsOptional()
    @IsString()
    resolution?: string
}

export class AssignTechnicianDto {
    @IsUUID()
    technicianId: string

    @IsOptional()
    @IsEnum(ServiceOrderTechnicianRole)
    role?: ServiceOrderTechnicianRole  // LEAD ou ASSISTANT
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
    groupId?: string

    @IsOptional()
    @IsString()
    dateFrom?: string

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

// Filtros para o painel de OS disponíveis
export class ListAvailableServiceOrdersDto {
    @IsOptional()
    @IsUUID()
    groupId?: string  // Filtrar por grupo específico

    @IsOptional()
    @Type(() => Number)
    @IsInt() @Min(1)
    page?: number = 1

    @IsOptional()
    @Type(() => Number)
    @IsInt() @Min(1) @Max(100)
    limit?: number = 20
}