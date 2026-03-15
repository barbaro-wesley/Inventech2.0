import {
    Injectable,
    NotFoundException,
    ForbiddenException,
} from '@nestjs/common'
import { TaskStatus, UserRole } from '@prisma/client'
import { PrismaService } from '../../../prisma/prisma.service'
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface'
import { CreateTaskDto, UpdateTaskDto, ReorderTasksDto } from './dto/task.dto'

@Injectable()
export class TasksService {
    constructor(private prisma: PrismaService) { }

    async findAll(serviceOrderId: string, clientId: string, companyId: string) {
        const os = await this.prisma.serviceOrder.findFirst({
            where: { id: serviceOrderId, clientId, companyId, deletedAt: null },
            select: { id: true },
        })
        if (!os) throw new NotFoundException('Ordem de serviço não encontrada')

        return this.prisma.serviceOrderTask.findMany({
            where: { serviceOrderId },
            select: {
                id: true,
                title: true,
                description: true,
                status: true,
                position: true,
                dueDate: true,
                completedAt: true,
                assignedTo: { select: { id: true, name: true } },
                createdAt: true,
            },
            orderBy: { position: 'asc' },
        })
    }

    async create(
        serviceOrderId: string,
        dto: CreateTaskDto,
        clientId: string,
        companyId: string,
    ) {
        const os = await this.prisma.serviceOrder.findFirst({
            where: { id: serviceOrderId, clientId, companyId, deletedAt: null },
            select: { id: true },
        })
        if (!os) throw new NotFoundException('Ordem de serviço não encontrada')

        // Posição no final da lista
        const lastTask = await this.prisma.serviceOrderTask.findFirst({
            where: { serviceOrderId },
            orderBy: { position: 'desc' },
            select: { position: true },
        })
        const position = dto.position ?? (lastTask?.position ?? -1) + 1

        return this.prisma.serviceOrderTask.create({
            data: {
                serviceOrderId,
                title: dto.title,
                description: dto.description,
                position,
                dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
                assignedToId: dto.assignedToId,
            },
            select: {
                id: true,
                title: true,
                description: true,
                status: true,
                position: true,
                dueDate: true,
                assignedTo: { select: { id: true, name: true } },
            },
        })
    }

    async update(
        taskId: string,
        dto: UpdateTaskDto,
        currentUser: AuthenticatedUser,
    ) {
        const task = await this.prisma.serviceOrderTask.findUnique({
            where: { id: taskId },
            select: { id: true, status: true },
        })
        if (!task) throw new NotFoundException('Task não encontrada')

        const completedAt =
            dto.status === TaskStatus.DONE && task.status !== TaskStatus.DONE
                ? new Date()
                : dto.status && dto.status !== TaskStatus.DONE
                    ? null
                    : undefined

        return this.prisma.serviceOrderTask.update({
            where: { id: taskId },
            data: {
                ...(dto.title && { title: dto.title }),
                ...(dto.description !== undefined && { description: dto.description }),
                ...(dto.status && { status: dto.status }),
                ...(dto.position !== undefined && { position: dto.position }),
                ...(dto.dueDate !== undefined && {
                    dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
                }),
                ...(completedAt !== undefined && { completedAt }),
                ...(dto.assignedToId !== undefined && {
                    assignedTo: dto.assignedToId
                        ? { connect: { id: dto.assignedToId } }
                        : { disconnect: true },
                }),
            },
            select: {
                id: true,
                title: true,
                description: true,
                status: true,
                position: true,
                dueDate: true,
                completedAt: true,
                assignedTo: { select: { id: true, name: true } },
            },
        })
    }

    // Reordena todas as tasks de uma OS em uma única transação
    async reorder(
        serviceOrderId: string,
        dto: ReorderTasksDto,
        clientId: string,
        companyId: string,
    ) {
        const os = await this.prisma.serviceOrder.findFirst({
            where: { id: serviceOrderId, clientId, companyId, deletedAt: null },
            select: { id: true },
        })
        if (!os) throw new NotFoundException('Ordem de serviço não encontrada')

        await this.prisma.$transaction(
            dto.orderedIds.map((id, index) =>
                this.prisma.serviceOrderTask.update({
                    where: { id },
                    data: { position: index },
                }),
            ),
        )

        return this.findAll(serviceOrderId, clientId, companyId)
    }

    async remove(taskId: string) {
        const task = await this.prisma.serviceOrderTask.findUnique({
            where: { id: taskId },
            select: { id: true },
        })
        if (!task) throw new NotFoundException('Task não encontrada')

        await this.prisma.serviceOrderTask.delete({ where: { id: taskId } })

        return { message: 'Task removida com sucesso' }
    }
}