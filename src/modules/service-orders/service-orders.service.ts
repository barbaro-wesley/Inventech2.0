import {
    Injectable,
    NotFoundException,
    ForbiddenException,
    BadRequestException,
    ConflictException,
    Logger,
} from '@nestjs/common'
import { Prisma, ServiceOrderStatus, UserRole } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface'
import {
    CreateServiceOrderDto,
    UpdateServiceOrderDto,
    UpdateServiceOrderStatusDto,
    AssignTechnicianDto,
    ListServiceOrdersDto,
} from './dto/service-order.dto'

// Máquina de estados — define transições válidas
const VALID_TRANSITIONS: Record<ServiceOrderStatus, ServiceOrderStatus[]> = {
    [ServiceOrderStatus.OPEN]: [
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
    [ServiceOrderStatus.COMPLETED_APPROVED]: [],  // Estado final
    [ServiceOrderStatus.COMPLETED_REJECTED]: [
        ServiceOrderStatus.OPEN,  // Reabre a OS
    ],
    [ServiceOrderStatus.CANCELLED]: [],  // Estado final
}

// Papéis que podem aprovar/reprovar uma OS concluída
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
    createdAt: true,
    updatedAt: true,
    equipment: { select: { id: true, name: true, brand: true, model: true } },
    requester: { select: { id: true, name: true, email: true } },
    technician: { select: { id: true, name: true, email: true } },
    _count: {
        select: { comments: true, tasks: true, attachments: true },
    },
} satisfies Prisma.ServiceOrderSelect

@Injectable()
export class ServiceOrdersService {
    private readonly logger = new Logger(ServiceOrdersService.name)

    constructor(private prisma: PrismaService) { }

    // ─────────────────────────────────────────
    // Listar OS com filtros
    // ─────────────────────────────────────────
    async findAll(
        clientId: string,
        companyId: string,
        filters: ListServiceOrdersDto,
        currentUser: AuthenticatedUser,
    ) {
        const {
            search, status, priority, equipmentId,
            technicianId, requesterId, dateFrom, dateTo,
            page = 1, limit = 20,
        } = filters

        const where: Prisma.ServiceOrderWhereInput = {
            clientId,
            companyId,
            deletedAt: null,
            ...(status && { status }),
            ...(priority && { priority }),
            ...(equipmentId && { equipmentId }),
            ...(technicianId && { technicianId }),
            ...(requesterId && { requesterId }),
            ...(dateFrom || dateTo) && {
                createdAt: {
                    ...(dateFrom && { gte: new Date(dateFrom) }),
                    ...(dateTo && { lte: new Date(dateTo) }),
                },
            },
            ...(search && {
                OR: [
                    { title: { contains: search, mode: 'insensitive' } },
                    { description: { contains: search, mode: 'insensitive' } },
                ],
            }),
        }

        // TECHNICIAN só vê OS atribuídas a ele
        if (currentUser.role === UserRole.TECHNICIAN) {
            where.technicianId = currentUser.sub
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

    // ─────────────────────────────────────────
    // Buscar OS por ID com detalhes completos
    // ─────────────────────────────────────────
    async findOne(id: string, clientId: string, companyId: string, currentUser: AuthenticatedUser) {
        const os = await this.prisma.serviceOrder.findFirst({
            where: { id, clientId, companyId, deletedAt: null },
            select: {
                ...OS_SELECT,
                comments: {
                    where: this.buildCommentVisibilityFilter(currentUser),
                    select: {
                        id: true,
                        content: true,
                        isInternal: true,
                        createdAt: true,
                        updatedAt: true,
                        author: { select: { id: true, name: true, role: true } },
                        attachments: { select: { id: true, fileName: true, mimeType: true, key: true } },
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
                attachments: {
                    select: { id: true, fileName: true, mimeType: true, sizeBytes: true, key: true, createdAt: true },
                },
            },
        })

        if (!os) throw new NotFoundException('Ordem de serviço não encontrada')

        // TECHNICIAN só acessa OS atribuída a ele
        if (
            currentUser.role === UserRole.TECHNICIAN &&
            (os as any).technician?.id !== currentUser.sub
        ) {
            throw new ForbiddenException('Acesso negado a esta OS')
        }

        return os
    }

    // ─────────────────────────────────────────
    // Criar OS com número sequencial por empresa
    // ─────────────────────────────────────────
    async create(
        dto: CreateServiceOrderDto,
        clientId: string,
        companyId: string,
        currentUser: AuthenticatedUser,
    ) {
        // Valida equipamento pertence ao cliente
        const equipment = await this.prisma.equipment.findFirst({
            where: { id: dto.equipmentId, clientId, companyId, deletedAt: null },
            select: { id: true, name: true },
        })
        if (!equipment) throw new NotFoundException('Equipamento não encontrado neste cliente')

        // Valida técnico pertence à empresa se informado
        if (dto.technicianId) {
            const technician = await this.prisma.user.findFirst({
                where: { id: dto.technicianId, companyId, role: UserRole.TECHNICIAN },
                select: { id: true },
            })
            if (!technician) throw new BadRequestException('Técnico não encontrado nesta empresa')
        }

        // Gera número sequencial em transação para evitar race condition
        return this.prisma.$transaction(async (tx) => {
            // Pega o maior número atual da empresa e incrementa
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
                    priority: dto.priority,
                    scheduledFor: dto.scheduledFor ? new Date(dto.scheduledFor) : null,
                    equipmentId: dto.equipmentId,
                    requesterId: currentUser.sub,
                    ...(dto.technicianId && { technicianId: dto.technicianId }),
                },
                select: OS_SELECT,
            })

            // Registra histórico do status inicial
            await tx.serviceOrderStatusHistory.create({
                data: {
                    serviceOrderId: os.id,
                    toStatus: ServiceOrderStatus.OPEN,
                    changedById: currentUser.sub,
                },
            })

            this.logger.log(`OS #${number} criada: ${os.title} | Cliente: ${clientId}`)
            return os
        })
    }

    // ─────────────────────────────────────────
    // Atualizar dados da OS
    // ─────────────────────────────────────────
    async update(
        id: string,
        dto: UpdateServiceOrderDto,
        clientId: string,
        companyId: string,
        currentUser: AuthenticatedUser,
    ) {
        const os = await this.findExisting(id, clientId, companyId)

        // OS concluída ou cancelada não pode ser editada
        if (([
            ServiceOrderStatus.COMPLETED_APPROVED,
            ServiceOrderStatus.CANCELLED,
        ] as ServiceOrderStatus[]).includes(os.status)) {
            throw new ConflictException('Esta OS não pode ser editada no status atual')
        }

        // TECHNICIAN só edita resolution e notas
        if (currentUser.role === UserRole.TECHNICIAN) {
            if (os.technicianId !== currentUser.sub) {
                throw new ForbiddenException('Você não está atribuído a esta OS')
            }
            return this.prisma.serviceOrder.update({
                where: { id },
                data: {
                    ...(dto.resolution !== undefined && { resolution: dto.resolution }),
                },
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
                ...(dto.scheduledFor !== undefined && {
                    scheduledFor: dto.scheduledFor ? new Date(dto.scheduledFor) : null,
                }),
                ...(dto.technicianId !== undefined && {
                    technician: dto.technicianId
                        ? { connect: { id: dto.technicianId } }
                        : { disconnect: true },
                }),
            },
            select: OS_SELECT,
        })
    }

    // ─────────────────────────────────────────
    // Mudar status com máquina de estados
    // ─────────────────────────────────────────
    async updateStatus(
        id: string,
        dto: UpdateServiceOrderStatusDto,
        clientId: string,
        companyId: string,
        currentUser: AuthenticatedUser,
    ) {
        const os = await this.findExisting(id, clientId, companyId)

        // Valida transição
        const allowedTransitions = VALID_TRANSITIONS[os.status]
        if (!allowedTransitions.includes(dto.status)) {
            throw new BadRequestException(
                `Transição inválida: ${os.status} → ${dto.status}. ` +
                `Permitidas: ${allowedTransitions.join(', ') || 'nenhuma'}`,
            )
        }

        // Aprovar/reprovar exige papel específico
        if (([
            ServiceOrderStatus.COMPLETED_APPROVED,
            ServiceOrderStatus.COMPLETED_REJECTED,
        ] as ServiceOrderStatus[]).includes(dto.status)) {
            if (!APPROVER_ROLES.includes(currentUser.role)) {
                throw new ForbiddenException('Apenas gestores podem aprovar ou reprovar uma OS')
            }
            if (dto.status === ServiceOrderStatus.COMPLETED_REJECTED && !dto.reason) {
                throw new BadRequestException('O motivo da reprovação é obrigatório')
            }
        }

        // TECHNICIAN só pode mover de OPEN → IN_PROGRESS ou IN_PROGRESS → COMPLETED
        if (currentUser.role === UserRole.TECHNICIAN) {
            if (os.technicianId !== currentUser.sub) {
                throw new ForbiddenException('Você não está atribuído a esta OS')
            }
            const technicianAllowed: ServiceOrderStatus[] = [
                ServiceOrderStatus.IN_PROGRESS,
                ServiceOrderStatus.COMPLETED,
            ]
            if (!technicianAllowed.includes(dto.status)) {
                throw new ForbiddenException('Técnicos não podem executar esta transição')
            }
        }

        // Dados extras por status
        const statusData: Record<string, any> = {}
        if (dto.status === ServiceOrderStatus.IN_PROGRESS) statusData.startedAt = new Date()
        if (dto.status === ServiceOrderStatus.COMPLETED) {
            statusData.completedAt = new Date()
            if (dto.resolution) statusData.resolution = dto.resolution
        }
        if (([
            ServiceOrderStatus.COMPLETED_APPROVED,
            ServiceOrderStatus.COMPLETED_REJECTED,
        ] as ServiceOrderStatus[]).includes(dto.status)) {
            statusData.approvedAt = new Date()
            statusData.approvedById = currentUser.sub
        }

        return this.prisma.$transaction(async (tx) => {
            const updated = await tx.serviceOrder.update({
                where: { id },
                data: { status: dto.status, ...statusData },
                select: OS_SELECT,
            })

            await tx.serviceOrderStatusHistory.create({
                data: {
                    serviceOrderId: id,
                    fromStatus: os.status,
                    toStatus: dto.status,
                    changedById: currentUser.sub,
                    reason: dto.reason,
                },
            })

            this.logger.log(
                `OS #${os.number} status: ${os.status} → ${dto.status} | User: ${currentUser.email}`,
            )

            return updated
        })
    }

    // ─────────────────────────────────────────
    // Atribuir técnico
    // ─────────────────────────────────────────
    async assignTechnician(
        id: string,
        dto: AssignTechnicianDto,
        clientId: string,
        companyId: string,
        currentUser: AuthenticatedUser,
    ) {
        const os = await this.findExisting(id, clientId, companyId)

        if (([
            ServiceOrderStatus.COMPLETED_APPROVED,
            ServiceOrderStatus.CANCELLED,
        ] as ServiceOrderStatus[]).includes(os.status)) {
            throw new ConflictException('Não é possível atribuir técnico neste status')
        }

        const technician = await this.prisma.user.findFirst({
            where: { id: dto.technicianId, companyId, role: UserRole.TECHNICIAN },
            select: { id: true, name: true },
        })
        if (!technician) throw new NotFoundException('Técnico não encontrado nesta empresa')

        return this.prisma.serviceOrder.update({
            where: { id },
            data: { technician: { connect: { id: dto.technicianId } } },
            select: OS_SELECT,
        })
    }

    // ─────────────────────────────────────────
    // Helpers privados
    // ─────────────────────────────────────────
    private async findExisting(id: string, clientId: string, companyId: string) {
        const os = await this.prisma.serviceOrder.findFirst({
            where: { id, clientId, companyId, deletedAt: null },
            select: { id: true, number: true, status: true, technicianId: true },
        })
        if (!os) throw new NotFoundException('Ordem de serviço não encontrada')
        return os
    }

    // Comentários internos são invisíveis para usuários do cliente
    private buildCommentVisibilityFilter(user: AuthenticatedUser) {
        const clientRoles: UserRole[] = [
            UserRole.CLIENT_ADMIN,
            UserRole.CLIENT_USER,
            UserRole.CLIENT_VIEWER,
        ]
        if (clientRoles.includes(user.role)) {
            return { isInternal: false }
        }
        return {}
    }
}