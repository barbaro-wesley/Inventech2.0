import {
    IsEnum, IsInt, IsOptional, IsString, IsUUID, Min,
} from 'class-validator'
import { Type } from 'class-transformer'
import { TaskStatus } from '@prisma/client'

export class CreateTaskDto {
    @IsString()
    title: string

    @IsOptional()
    @IsString()
    description?: string

    @IsOptional()
    @IsUUID()
    assignedToId?: string

    @IsOptional()
    @IsString()
    dueDate?: string

    @IsOptional()
    @Type(() => Number)
    @IsInt() @Min(0)
    position?: number = 0
}

export class UpdateTaskDto {
    @IsOptional()
    @IsString()
    title?: string

    @IsOptional()
    @IsString()
    description?: string

    @IsOptional()
    @IsEnum(TaskStatus)
    status?: TaskStatus

    @IsOptional()
    @IsUUID()
    assignedToId?: string

    @IsOptional()
    @IsString()
    dueDate?: string

    @IsOptional()
    @Type(() => Number)
    @IsInt() @Min(0)
    position?: number
}

export class ReorderTasksDto {
    @IsUUID(undefined, { each: true })
    orderedIds: string[]  // IDs das tasks na nova ordem
}