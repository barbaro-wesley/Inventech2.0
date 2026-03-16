import {
    IsBoolean, IsDateString, IsEnum, IsInt,
    IsOptional, IsString, IsUUID, Max, Min,
} from 'class-validator'
import { Type } from 'class-transformer'
import { MaintenanceType, RecurrenceType } from '@prisma/client'

// ─────────────────────────────────────────
// Manutenção avulsa
// ─────────────────────────────────────────
export class CreateMaintenanceDto {
    @IsUUID()
    equipmentId: string

    @IsEnum(MaintenanceType)
    type: MaintenanceType

    @IsString()
    title: string

    @IsOptional()
    @IsString()
    description?: string

    @IsOptional()
    @IsUUID()
    technicianId?: string

    @IsOptional()
    @IsDateString()
    scheduledAt?: string

    @IsOptional()
    @IsString()
    observations?: string
}

export class UpdateMaintenanceDto {
    @IsOptional()
    @IsString()
    title?: string

    @IsOptional()
    @IsString()
    description?: string

    @IsOptional()
    @IsUUID()
    technicianId?: string

    @IsOptional()
    @IsDateString()
    scheduledAt?: string

    @IsOptional()
    @IsDateString()
    startedAt?: string

    @IsOptional()
    @IsDateString()
    completedAt?: string

    @IsOptional()
    @IsString()
    observations?: string
}

export class ListMaintenancesDto {
    @IsOptional()
    @IsEnum(MaintenanceType)
    type?: MaintenanceType

    @IsOptional()
    @IsUUID()
    equipmentId?: string

    @IsOptional()
    @IsUUID()
    technicianId?: string

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

// ─────────────────────────────────────────
// Agendamento (recorrência preventiva)
// ─────────────────────────────────────────
export class CreateScheduleDto {
    @IsUUID()
    equipmentId: string

    @IsString()
    title: string

    @IsOptional()
    @IsString()
    description?: string

    @IsEnum(MaintenanceType)
    maintenanceType: MaintenanceType

    @IsEnum(RecurrenceType)
    recurrenceType: RecurrenceType

    // Obrigatório quando recurrenceType = CUSTOM
    @IsOptional()
    @IsInt()
    @Min(1)
    customIntervalDays?: number

    @IsOptional()
    @IsInt()
    @Min(1)
    estimatedDurationMin?: number

    // Técnico padrão para as OS geradas
    @IsOptional()
    @IsUUID()
    assignedTechnicianId?: string

    // Grupo responsável pelas OS geradas
    @IsOptional()
    @IsUUID()
    groupId?: string

    @IsDateString()
    startDate: string

    @IsOptional()
    @IsDateString()
    endDate?: string
}

export class UpdateScheduleDto {
    @IsOptional()
    @IsString()
    title?: string

    @IsOptional()
    @IsString()
    description?: string

    @IsOptional()
    @IsEnum(RecurrenceType)
    recurrenceType?: RecurrenceType

    @IsOptional()
    @IsInt()
    @Min(1)
    customIntervalDays?: number

    @IsOptional()
    @IsInt()
    @Min(1)
    estimatedDurationMin?: number

    @IsOptional()
    @IsUUID()
    assignedTechnicianId?: string

    @IsOptional()
    @IsUUID()
    groupId?: string

    @IsOptional()
    @IsDateString()
    endDate?: string

    @IsOptional()
    @IsBoolean()
    isActive?: boolean
}

export class ListSchedulesDto {
    @IsOptional()
    @IsUUID()
    equipmentId?: string

    @IsOptional()
    @IsEnum(RecurrenceType)
    recurrenceType?: RecurrenceType

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
    limit?: number = 20
}