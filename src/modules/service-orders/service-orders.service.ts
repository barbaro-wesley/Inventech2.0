import {
    Injectable,
    NotFoundException,
    ForbiddenException,
    BadRequestException,
    ConflictException,
    Logger,
} from '@nestjs/common'
import {
    Prisma,
    ServiceOrderStatus,
    ServiceOrderTechnicianRole,
    UserRole,
} from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface'
import {
    CreateServiceOrderDto,
    UpdateServiceOrderDto,
    UpdateServiceOrderStatusDto,
    AssignTechnicianDto,
    ListServiceOrdersDto,
    ListAvailableServiceOrdersDto,
} from './dto/service-order.dto'

const VALID_TRANSITIONS: Record<ServiceOrderStatus, ServiceOrderStatus[]> = {
    [ServiceOrderStatus.OPEN]: [
        ServiceOrderStatus.AWAITING_PICKUP,
        ServiceOrderStatus.IN_PROGRESS,
        ServiceOrderStatus.CANCELLED,
    ],
    [ServiceOrderStatus.AWAITING_PICKUP]: [
        ServiceOrderStatus.IN_PROGRESS,
        ServiceOrderStatus.CANCELLED,
    ],
    [ServiceOrderStatus.IN_PROGRESS]: [
        ServiceOrderStatus.COMPLETED,
        ServiceOrderStatus.CANCELLED,
    ],
    [ServiceOrderStatus.COMPLETED]: [
        ServiceOrderStatus.COMPLETED_APPROVED,
        ServiceOrderStatus.COMPLETED_REJECTED,
    ],
    [ServiceOrderStatus.COMPLETED_APPROVED]: [],
    [ServiceOrderStatus.COMPLETED_REJECTED]: [ServiceOrderStatus.OPEN],
    [ServiceOrderStatus.CANCELLED]: [],
}

const APPROVER_ROLES: UserRole[] = [
    UserRole.SUPER_ADMIN,
    UserRole.COMPANY_ADMIN,
    UserRole.COMPANY_MANAGER,
    UserRole.CLIENT_ADMIN,
]

const OS_SELECT = {
    id: true,
    companyId: true,
    clientId: true,
    number: true,
    title: true,
    description: true,
    maintenanceType: true,
    status: true,
    priority: true,
    resolution: true,
    internalNotes: true,
    estimatedHours: true,
    actualHours: true,
    scheduledFor: true,
    startedAt: true,
    completedAt: true,
    approvedAt: true,
    isAvailable: true,
    alertAfterHours: true,
    alertSentAt: true,
    createdAt: true,
    updatedAt: true,
    equipment: { select: { id: true, name: true, brand: true, model: true } },
    requester: { select: { id: true, name: true, email: true } },
    group: { select: { id: true, name: true, color: true } },
    technicians: {
        where: { releasedAt: null },
        select: {
            id: true,
            role: true,
            assignedAt: true,
            assumedAt: true,
            technician: { select: { id: true, name: true, email: true, phone: true } },
        },
    },
    _count: {
        select: { comments: true, tasks: true, attachments: true },
    },
} satisfies Prisma.ServiceOrderSelect

@Injectable()
export class ServiceOrdersService {
    private readonly logger = new Logger(ServiceOrdersService.name)

    constructor(private prisma: PrismaService) { }

    async findAll(
        clientId: string,
        companyId: string,
        filters: ListServiceOrdersDto,
        currentUser: AuthenticatedUser,
    ) {
        const {
            search, status, priority, equipmentId,
            groupId, dateFrom, dateTo, page = 1, limit = 20,
        } = filters

        const where: Prisma.ServiceOrderWhereInput = {
            clientId,
            companyId,
            deletedAt: null,
            ...(status && { status }),
            ...(priority && { priority }),
            ...(equipmentId && { equipmentId }),
            ...(groupId && { groupId }),
            ...((dateFrom || dateTo) && {
                createdAt: {
                    ...(dateFrom && { gte: new Date(dateFrom) }),
                    ...(dateTo && { lte: new Date(dateTo) }),
                },
            }),
            ...(search && {
                OR: [
                    { title: { contains: search, mode: 'insensitive' } },
                    { description: { contains: search, mode: 'insensitive' } },
                ],
            }),
        }

        if (currentUser.role === UserRole.TECHNICIAN) {
            where.technicians = {
                some: { technicianId: currentUser.sub, releasedAt: null },
            }
        }

        const [data, total] = await this.prisma.$transaction([
            this.prisma.serviceOrder.findMany({
                where,
                select: OS_SELECT,
                orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.serviceOrder.count({ where }),
        ])

        return { data, total, page, limit }
    }

    async findAvailable(
        companyId: string,
        filters: ListAvailableServiceOrdersDto,
        currentUser: AuthenticatedUser,
    ) {
        const { groupId, page = 1, limit = 20 } = filters

        let groupIds: string[] = []

        if (groupId) {
            groupIds = [groupId]
        } else if (currentUser.role === UserRole.TECHNICIAN) {
            const techGroups = await this.prisma.technicianGroup.findMany({
                where: { userId: currentUser.sub, isActive: true },
                select: { groupId: true },
            })
            groupIds = techGroups.map((g) => g.groupId)
        }

        const where: Prisma.ServiceOrderWhereInput = {
            companyId,
            isAvailable: true,
            status: ServiceOrderStatus.AWAITING_PICKUP,
            deletedAt: null,
            ...(groupIds.length > 0 && { groupId: { in: groupIds } }),
        }

        const [data, total] = await this.prisma.$transaction([
            this.prisma.serviceOrder.findMany({
                where,
                select: OS_SELECT,
                orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.serviceOrder.count({ where }),
        ])

        return { data, total, page, limit }
    }

    async findOne(
        id: string,
        clientId: string,
        companyId: string,
        currentUser: AuthenticatedUser,
    ) {
        const os = await this.prisma.serviceOrder.findFirst({
            where: { id, clientId, companyId, deletedAt: null },
            select: {
                ...OS_SELECT,
                comments: {
                    where: this.buildCommentFilter(currentUser),
                    select: {
                        id: true,
                        content: true,
                        isInternal: true,
                        createdAt: true,
                        updatedAt: true,
                        author: { select: { id: true, name: true, role: true } },
                    },
                    orderBy: { createdAt: 'asc' },
                },
                tasks: {
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
                    orderBy: { position: 'asc' },
                },
                statusHistory: {
                    select: {
                        id: true,
                        fromStatus: true,
                        toStatus: true,
                        reason: true,
                        createdAt: true,
                    },
                    orderBy: { createdAt: 'asc' },
                },
            },
        })

        if (!os) throw new NotFoundException('Ordem de serviço não encontrada')

        if (currentUser.role === UserRole.TECHNICIAN) {
            const isLinked = os.technicians.some((t) => t.technician.id === currentUser.sub)
            if (!isLinked && !os.isAvailable) {
                throw new ForbiddenException('Acesso negado a esta OS')
            }
        }

        return os
    }

    async create(
        dto: CreateServiceOrderDto,
        clientId: string,
        companyId: string,
        currentUser: AuthenticatedUser,
    ) {
        const equipment = await this.prisma.equipment.findFirst({
            where: { id: dto.equipmentId, clientId, companyId, deletedAt: null },
            select: { id: true },
        })
        if (!equipment) throw new NotFoundException('Equipamento não encontrado neste cliente')

        if (dto.groupId) {
            const group = await this.prisma.maintenanceGroup.findFirst({
                where: { id: dto.groupId, companyId, isActive: true },
                select: { id: true },
            })
            if (!group) throw new BadRequestException('Grupo de manutenção não encontrado')
        }

        if (dto.technicianId) {
            const technician = await this.prisma.user.findFirst({
                where: { id: dto.technicianId, companyId, role: UserRole.TECHNICIAN },
                select: { id: true },
            })
            if (!technician) throw new BadRequestException('Técnico não encontrado nesta empresa')
        }

        const isAvailable = !dto.technicianId
        const initialStatus = isAvailable
            ? ServiceOrderStatus.AWAITING_PICKUP
            : ServiceOrderStatus.OPEN

        return this.prisma.$transaction(async (tx) => {
            const last = await tx.serviceOrder.findFirst({
                where: { companyId },
                orderBy: { number: 'desc' },
                select: { number: true },
            })
            const number = (last?.number ?? 0) + 1

            const os = await tx.serviceOrder.create({
                data: {
                    companyId,
                    clientId,
                    number,
                    title: dto.title,
                    description: dto.description,
                    maintenanceType: dto.maintenanceType,
                    priority: dto.priority,
                    status: initialStatus,
                    isAvailable,
                    alertAfterHours: dto.alertAfterHours ?? 2,
                    scheduledFor: dto.scheduledFor ? new Date(dto.scheduledFor) : null,
                    equipmentId: dto.equipmentId,
                    requesterId: currentUser.sub,
                    ...(dto.groupId && { groupId: dto.groupId }),
                },
                select: OS_SELECT,
            })

            if (dto.technicianId) {
                await tx.serviceOrderTechnician.create({
                    data: {
                        serviceOrderId: os.id,
                        technicianId: dto.technicianId,
                        role: ServiceOrderTechnicianRole.LEAD,
                    },
                })
            }

            await tx.serviceOrderStatusHistory.create({
                data: {
                    serviceOrderId: os.id,
                    toStatus: initialStatus,
                    changedById: currentUser.sub,
                },
            })

            this.logger.log(
                `OS #${number} criada | ${isAvailable ? 'Painel' : 'Técnico: ' + dto.technicianId}`,
            )

            return os
        })
    }

    async assumeServiceOrder(
        id: string,
        clientId: string,
        companyId: string,
        currentUser: AuthenticatedUser,
    ) {
        const os = await this.prisma.serviceOrder.findFirst({
            where: { id, clientId, companyId, deletedAt: null },
            select: { id: true, number: true, status: true, isAvailable: true, groupId: true },
        })

        if (!os) throw new NotFoundException('OS não encontrada')

        if (!os.isAvailable || os.status !== ServiceOrderStatus.AWAITING_PICKUP) {
            throw new ConflictException('Esta OS não está disponível para ser assumida')
        }

        if (os.groupId) {
            const inGroup = await this.prisma.technicianGroup.findFirst({
                where: { userId: currentUser.sub, groupId: os.groupId, isActive: true },
                select: { id: true },
            })
            if (!inGroup) {
                throw new ForbiddenException('Você não pertence ao grupo responsável por esta OS')
            }
        }

        const alreadyLinked = await this.prisma.serviceOrderTechnician.findUnique({
            where: {
                serviceOrderId_technicianId: {
                    serviceOrderId: id,
                    technicianId: currentUser.sub,
                },
            },
            select: { id: true },
        })
        if (alreadyLinked) throw new ConflictException('Você já está vinculado a esta OS')

        return this.prisma.$transaction(async (tx) => {
            await tx.serviceOrderTechnician.create({
                data: {
                    serviceOrderId: id,
                    technicianId: currentUser.sub,
                    role: ServiceOrderTechnicianRole.LEAD,
                    assumedAt: new Date(),
                },
            })

            const updated = await tx.serviceOrder.update({
                where: { id },
                data: {
                    isAvailable: false,
                    status: ServiceOrderStatus.IN_PROGRESS,
                    startedAt: new Date(),
                },
                select: OS_SELECT,
            })

            await tx.serviceOrderStatusHistory.create({
                data: {
                    serviceOrderId: id,
                    fromStatus: ServiceOrderStatus.AWAITING_PICKUP,
                    toStatus: ServiceOrderStatus.IN_PROGRESS,
                    changedById: currentUser.sub,
                    reason: 'Técnico assumiu a OS do painel',
                },
            })

            this.logger.log(`OS #${os.number} assumida por: ${currentUser.email}`)
            return updated
        })
    }

    async addTechnician(
        id: string,
        dto: AssignTechnicianDto,
        clientId: string,
        companyId: string,
    ) {
        const os = await this.findExisting(id, clientId, companyId)

        if (
            os.status === ServiceOrderStatus.COMPLETED_APPROVED ||
            os.status === ServiceOrderStatus.CANCELLED
        ) {
            throw new ConflictException('Não é possível adicionar técnico neste status')
        }

        const technician = await this.prisma.user.findFirst({
            where: { id: dto.technicianId, companyId, role: UserRole.TECHNICIAN },
            select: { id: true, name: true },
        })
        if (!technician) throw new NotFoundException('Técnico não encontrado')

        const alreadyLinked = await this.prisma.serviceOrderTechnician.findUnique({
            where: {
                serviceOrderId_technicianId: {
                    serviceOrderId: id,
                    technicianId: dto.technicianId,
                },
            },
            select: { id: true, releasedAt: true },
        })

        if (alreadyLinked && !alreadyLinked.releasedAt) {
            throw new ConflictException(`${technician.name} já está vinculado a esta OS`)
        }

        const role = dto.role ?? ServiceOrderTechnicianRole.ASSISTANT

        if (alreadyLinked) {
            return this.prisma.serviceOrderTechnician.update({
                where: {
                    serviceOrderId_technicianId: {
                        serviceOrderId: id,
                        technicianId: dto.technicianId,
                    },
                },
                data: { releasedAt: null, role, assignedAt: new Date() },
            })
        }

        return this.prisma.serviceOrderTechnician.create({
            data: { serviceOrderId: id, technicianId: dto.technicianId, role },
        })
    }

    async removeTechnician(
        id: string,
        technicianId: string,
        clientId: string,
        companyId: string,
    ) {
        await this.findExisting(id, clientId, companyId)

        const link = await this.prisma.serviceOrderTechnician.findUnique({
            where: {
                serviceOrderId_technicianId: { serviceOrderId: id, technicianId },
            },
            select: { id: true },
        })
        if (!link) throw new NotFoundException('Técnico não está vinculado a esta OS')

        await this.prisma.serviceOrderTechnician.update({
            where: {
                serviceOrderId_technicianId: { serviceOrderId: id, technicianId },
            },
            data: { releasedAt: new Date() },
        })

        return { message: 'Técnico removido da OS com sucesso' }
    }

    async update(
        id: string,
        dto: UpdateServiceOrderDto,
        clientId: string,
        companyId: string,
        currentUser: AuthenticatedUser,
    ) {
        const os = await this.findExisting(id, clientId, companyId)

        if (
            os.status === ServiceOrderStatus.COMPLETED_APPROVED ||
            os.status === ServiceOrderStatus.CANCELLED
        ) {
            throw new ConflictException('Esta OS não pode ser editada no status atual')
        }

        if (currentUser.role === UserRole.TECHNICIAN) {
            const isLinked = await this.prisma.serviceOrderTechnician.findFirst({
                where: { serviceOrderId: id, technicianId: currentUser.sub, releasedAt: null },
                select: { id: true },
            })
            if (!isLinked) throw new ForbiddenException('Você não está vinculado a esta OS')

            return this.prisma.serviceOrder.update({
                where: { id },
                data: { ...(dto.resolution !== undefined && { resolution: dto.resolution }) },
                select: OS_SELECT,
            })
        }

        return this.prisma.serviceOrder.update({
            where: { id },
            data: {
                ...(dto.title && { title: dto.title }),
                ...(dto.description && { description: dto.description }),
                ...(dto.priority && { priority: dto.priority }),
                ...(dto.resolution !== undefined && { resolution: dto.resolution }),
                ...(dto.internalNotes !== undefined && { internalNotes: dto.internalNotes }),
                ...(dto.alertAfterHours !== undefined && { alertAfterHours: dto.alertAfterHours }),
                ...(dto.scheduledFor !== undefined && {
                    scheduledFor: dto.scheduledFor ? new Date(dto.scheduledFor) : null,
                }),
                ...(dto.groupId !== undefined && {
                    group: dto.groupId
                        ? { connect: { id: dto.groupId } }
                        : { disconnect: true },
                }),
            },
            select: OS_SELECT,
        })
    }

    async updateStatus(
        id: string,
        dto: UpdateServiceOrderStatusDto,
        clientId: string,
        companyId: string,
        currentUser: AuthenticatedUser,
    ) {
        const os = await this.findExisting(id, clientId, companyId)

        const allowedTransitions = VALID_TRANSITIONS[os.status]
        if (!allowedTransitions.includes(dto.status)) {
            throw new BadRequestException(
                `Transição inválida: ${os.status} → ${dto.status}. ` +
                `Permitidas: ${allowedTransitions.join(', ') || 'nenhuma'}`,
            )
        }

        if (
            dto.status === ServiceOrderStatus.COMPLETED_APPROVED ||
            dto.status === ServiceOrderStatus.COMPLETED_REJECTED
        ) {
            if (!APPROVER_ROLES.includes(currentUser.role)) {
                throw new ForbiddenException('Apenas gestores podem aprovar ou reprovar uma OS')
            }
            if (dto.status === ServiceOrderStatus.COMPLETED_REJECTED && !dto.reason) {
                throw new BadRequestException('O motivo da reprovação é obrigatório')
            }
        }

        if (currentUser.role === UserRole.TECHNICIAN) {
            const isLinked = await this.prisma.serviceOrderTechnician.findFirst({
                where: { serviceOrderId: id, technicianId: currentUser.sub, releasedAt: null },
                select: { id: true },
            })
            if (!isLinked) throw new ForbiddenException('Você não está vinculado a esta OS')
            if (dto.status !== ServiceOrderStatus.COMPLETED) {
                throw new ForbiddenException('Técnicos só podem concluir uma OS')
            }
        }

        const statusData: Record<string, any> = {}
        if (dto.status === ServiceOrderStatus.IN_PROGRESS) statusData.startedAt = new Date()
        if (dto.status === ServiceOrderStatus.COMPLETED) {
            statusData.completedAt = new Date()
            if (dto.resolution) statusData.resolution = dto.resolution
        }
        if (
            dto.status === ServiceOrderStatus.COMPLETED_APPROVED ||
            dto.status === ServiceOrderStatus.COMPLETED_REJECTED
        ) {
            statusData.approvedAt = new Date()
            statusData.approvedById = currentUser.sub
        }

        // OS reprovada reabre → volta ao painel se não tiver técnico
        let finalStatus = dto.status
        if (dto.status === ServiceOrderStatus.OPEN) {
            const hasTechnician = await this.prisma.serviceOrderTechnician.findFirst({
                where: { serviceOrderId: id, releasedAt: null },
                select: { id: true },
            })
            if (!hasTechnician) {
                finalStatus = ServiceOrderStatus.AWAITING_PICKUP
                statusData.isAvailable = true
            }
        }

        return this.prisma.$transaction(async (tx) => {
            const updated = await tx.serviceOrder.update({
                where: { id },
                data: { status: finalStatus, ...statusData },
                select: OS_SELECT,
            })

            await tx.serviceOrderStatusHistory.create({
                data: {
                    serviceOrderId: id,
                    fromStatus: os.status,
                    toStatus: finalStatus,
                    changedById: currentUser.sub,
                    reason: dto.reason,
                },
            })

            return updated
        })
    }

    private async findExisting(id: string, clientId: string, companyId: string) {
        const os = await this.prisma.serviceOrder.findFirst({
            where: { id, clientId, companyId, deletedAt: null },
            select: { id: true, number: true, status: true },
        })
        if (!os) throw new NotFoundException('Ordem de serviço não encontrada')
        return os
    }

    private buildCommentFilter(user: AuthenticatedUser) {
        const clientRoles: UserRole[] = [
            UserRole.CLIENT_ADMIN,
            UserRole.CLIENT_USER,
            UserRole.CLIENT_VIEWER,
        ]
        if (clientRoles.includes(user.role)) return { isInternal: false }
        return {}
    }
}