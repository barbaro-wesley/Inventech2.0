import {
    Injectable,
    NotFoundException,
    ConflictException,
    BadRequestException,
} from '@nestjs/common'
import { Prisma, UserRole } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface'
import {
    CreateMaintenanceGroupDto,
    UpdateMaintenanceGroupDto,
    ListMaintenanceGroupsDto,
    AssignTechnicianToGroupDto,
} from './dto/maintenance-group.dto'

const GROUP_SELECT = {
    id: true,
    companyId: true,
    name: true,
    description: true,
    color: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
    _count: {
        select: {
            technicians: true,
            serviceOrders: true,
        },
    },
} satisfies Prisma.MaintenanceGroupSelect

const GROUP_WITH_TECHNICIANS_SELECT = {
    ...GROUP_SELECT,
    technicians: {
        where: { isActive: true },
        select: {
            id: true,
            assignedAt: true,
            user: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                    avatarUrl: true,
                    status: true,
                },
            },
        },
    },
} satisfies Prisma.MaintenanceGroupSelect

@Injectable()
export class MaintenanceGroupsService {
    constructor(private prisma: PrismaService) { }

    // ─────────────────────────────────────────
    // Listar grupos da empresa
    // ─────────────────────────────────────────
    async findAll(companyId: string, filters: ListMaintenanceGroupsDto) {
        const { search, isActive, page = 1, limit = 50 } = filters

        const where: Prisma.MaintenanceGroupWhereInput = {
            companyId,
            ...(isActive !== undefined && { isActive }),
            ...(search && { name: { contains: search, mode: 'insensitive' } }),
        }

        const [data, total] = await this.prisma.$transaction([
            this.prisma.maintenanceGroup.findMany({
                where,
                select: GROUP_SELECT,
                orderBy: { name: 'asc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.maintenanceGroup.count({ where }),
        ])

        return { data, total, page, limit }
    }

    // ─────────────────────────────────────────
    // Buscar grupo com seus técnicos
    // ─────────────────────────────────────────
    async findOne(id: string, companyId: string) {
        const group = await this.prisma.maintenanceGroup.findFirst({
            where: { id, companyId },
            select: GROUP_WITH_TECHNICIANS_SELECT,
        })
        if (!group) throw new NotFoundException('Grupo de manutenção não encontrado')
        return group
    }

    // ─────────────────────────────────────────
    // Criar grupo
    // ─────────────────────────────────────────
    async create(dto: CreateMaintenanceGroupDto, companyId: string) {
        // Nome único por empresa
        const exists = await this.prisma.maintenanceGroup.findUnique({
            where: { companyId_name: { companyId, name: dto.name } },
            select: { id: true },
        })
        if (exists) {
            throw new ConflictException(`Já existe um grupo chamado "${dto.name}" nesta empresa`)
        }

        return this.prisma.maintenanceGroup.create({
            data: {
                companyId,
                name: dto.name,
                description: dto.description,
                color: dto.color,
            },
            select: GROUP_WITH_TECHNICIANS_SELECT,
        })
    }

    // ─────────────────────────────────────────
    // Atualizar grupo
    // ─────────────────────────────────────────
    async update(id: string, dto: UpdateMaintenanceGroupDto, companyId: string) {
        const existing = await this.prisma.maintenanceGroup.findFirst({
            where: { id, companyId },
            select: { id: true, name: true },
        })
        if (!existing) throw new NotFoundException('Grupo não encontrado')

        // Valida nome único se estiver mudando
        if (dto.name && dto.name !== existing.name) {
            const nameTaken = await this.prisma.maintenanceGroup.findUnique({
                where: { companyId_name: { companyId, name: dto.name } },
                select: { id: true },
            })
            if (nameTaken) throw new ConflictException(`Nome "${dto.name}" já está em uso`)
        }

        return this.prisma.maintenanceGroup.update({
            where: { id },
            data: {
                ...(dto.name && { name: dto.name }),
                ...(dto.description !== undefined && { description: dto.description }),
                ...(dto.color !== undefined && { color: dto.color }),
                ...(dto.isActive !== undefined && { isActive: dto.isActive }),
            },
            select: GROUP_WITH_TECHNICIANS_SELECT,
        })
    }

    // ─────────────────────────────────────────
    // Remover grupo
    // ─────────────────────────────────────────
    async remove(id: string, companyId: string) {
        const group = await this.prisma.maintenanceGroup.findFirst({
            where: { id, companyId },
            select: {
                id: true,
                name: true,
                _count: { select: { serviceOrders: true } },
            },
        })
        if (!group) throw new NotFoundException('Grupo não encontrado')

        if (group._count.serviceOrders > 0) {
            throw new ConflictException(
                `Não é possível remover — ${group._count.serviceOrders} OS vinculada(s) a este grupo`,
            )
        }

        // Remove vínculos com técnicos antes de deletar
        await this.prisma.$transaction([
            this.prisma.technicianGroup.deleteMany({ where: { groupId: id } }),
            this.prisma.maintenanceGroup.delete({ where: { id } }),
        ])

        return { message: 'Grupo removido com sucesso' }
    }

    // ─────────────────────────────────────────
    // Vincular técnico ao grupo
    // ─────────────────────────────────────────
    async assignTechnician(
        groupId: string,
        dto: AssignTechnicianToGroupDto,
        companyId: string,
    ) {
        // Valida grupo
        const group = await this.prisma.maintenanceGroup.findFirst({
            where: { id: groupId, companyId },
            select: { id: true, name: true },
        })
        if (!group) throw new NotFoundException('Grupo não encontrado')

        // Valida técnico pertence à empresa
        const technician = await this.prisma.user.findFirst({
            where: {
                id: dto.technicianId,
                companyId,
                role: UserRole.TECHNICIAN,
                deletedAt: null,
            },
            select: { id: true, name: true, status: true },
        })
        if (!technician) {
            throw new NotFoundException('Técnico não encontrado nesta empresa')
        }

        // Verifica se já está vinculado
        const alreadyInGroup = await this.prisma.technicianGroup.findUnique({
            where: { userId_groupId: { userId: dto.technicianId, groupId } },
            select: { id: true, isActive: true },
        })

        if (alreadyInGroup) {
            if (alreadyInGroup.isActive) {
                throw new ConflictException(
                    `${technician.name} já está no grupo "${group.name}"`,
                )
            }
            // Reativa vínculo desativado
            return this.prisma.technicianGroup.update({
                where: { userId_groupId: { userId: dto.technicianId, groupId } },
                data: { isActive: true, assignedAt: new Date() },
            })
        }

        return this.prisma.technicianGroup.create({
            data: {
                userId: dto.technicianId,
                groupId,
            },
        })
    }

    // ─────────────────────────────────────────
    // Desvincular técnico do grupo
    // ─────────────────────────────────────────
    async removeTechnician(groupId: string, technicianId: string, companyId: string) {
        const group = await this.prisma.maintenanceGroup.findFirst({
            where: { id: groupId, companyId },
            select: { id: true },
        })
        if (!group) throw new NotFoundException('Grupo não encontrado')

        const link = await this.prisma.technicianGroup.findUnique({
            where: { userId_groupId: { userId: technicianId, groupId } },
            select: { id: true },
        })
        if (!link) throw new NotFoundException('Técnico não está neste grupo')

        // Desativa o vínculo (soft)
        await this.prisma.technicianGroup.update({
            where: { userId_groupId: { userId: technicianId, groupId } },
            data: { isActive: false },
        })

        return { message: 'Técnico removido do grupo com sucesso' }
    }

    // ─────────────────────────────────────────
    // Listar grupos de um técnico
    // ─────────────────────────────────────────
    async findTechnicianGroups(technicianId: string, companyId: string) {
        return this.prisma.technicianGroup.findMany({
            where: {
                userId: technicianId,
                isActive: true,
                group: { companyId },
            },
            select: {
                id: true,
                assignedAt: true,
                group: {
                    select: { id: true, name: true, color: true, description: true },
                },
            },
        })
    }
}