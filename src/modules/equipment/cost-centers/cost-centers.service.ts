import {
    Injectable,
    NotFoundException,
    ConflictException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../../prisma/prisma.service'
import {
    CreateCostCenterDto,
    UpdateCostCenterDto,
    ListCostCentersDto,
} from './dto/cost-center.dto'

const COST_CENTER_SELECT = {
    id: true,
    companyId: true,
    clientId: true,
    name: true,
    code: true,
    description: true,
    isActive: true,
    createdAt: true,
    _count: { select: { equipments: true } },
} satisfies Prisma.CostCenterSelect

@Injectable()
export class CostCentersService {
    constructor(private prisma: PrismaService) { }

    async findAll(clientId: string, companyId: string, filters: ListCostCentersDto) {
        const { search, isActive, page = 1, limit = 50 } = filters

        const where: Prisma.CostCenterWhereInput = {
            clientId,
            companyId,
            ...(isActive !== undefined && { isActive }),
            ...(search && {
                OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { code: { contains: search, mode: 'insensitive' } },
                ],
            }),
        }

        const [data, total] = await this.prisma.$transaction([
            this.prisma.costCenter.findMany({
                where,
                select: COST_CENTER_SELECT,
                orderBy: { name: 'asc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.costCenter.count({ where }),
        ])

        return { data, total, page, limit }
    }

    async findOne(id: string, clientId: string, companyId: string) {
        const cc = await this.prisma.costCenter.findFirst({
            where: { id, clientId, companyId },
            select: COST_CENTER_SELECT,
        })
        if (!cc) throw new NotFoundException('Centro de custo não encontrado')
        return cc
    }

    async create(dto: CreateCostCenterDto, clientId: string, companyId: string) {
        // Código único por cliente
        if (dto.code) {
            const exists = await this.prisma.costCenter.findUnique({
                where: { clientId_code: { clientId, code: dto.code } },
                select: { id: true },
            })
            if (exists) {
                throw new ConflictException(
                    'Já existe um centro de custo com este código neste cliente',
                )
            }
        }

        return this.prisma.costCenter.create({
            data: { companyId, clientId, name: dto.name, code: dto.code, description: dto.description },
            select: COST_CENTER_SELECT,
        })
    }

    async update(id: string, dto: UpdateCostCenterDto, clientId: string, companyId: string) {
        const existing = await this.prisma.costCenter.findFirst({
            where: { id, clientId, companyId },
            select: { id: true, code: true },
        })
        if (!existing) throw new NotFoundException('Centro de custo não encontrado')

        // Valida código único se estiver mudando
        if (dto.code && dto.code !== existing.code) {
            const exists = await this.prisma.costCenter.findUnique({
                where: { clientId_code: { clientId, code: dto.code } },
                select: { id: true },
            })
            if (exists) throw new ConflictException('Código já em uso neste cliente')
        }

        return this.prisma.costCenter.update({
            where: { id },
            data: {
                ...(dto.name && { name: dto.name }),
                ...(dto.code !== undefined && { code: dto.code }),
                ...(dto.description !== undefined && { description: dto.description }),
                ...(dto.isActive !== undefined && { isActive: dto.isActive }),
            },
            select: COST_CENTER_SELECT,
        })
    }

    async remove(id: string, clientId: string, companyId: string) {
        const cc = await this.prisma.costCenter.findFirst({
            where: { id, clientId, companyId },
            select: { id: true, name: true, _count: { select: { equipments: true } } },
        })
        if (!cc) throw new NotFoundException('Centro de custo não encontrado')

        if (cc._count.equipments > 0) {
            throw new ConflictException(
                `Não é possível remover — ${cc._count.equipments} equipamento(s) vinculado(s)`,
            )
        }

        await this.prisma.costCenter.delete({ where: { id } })
        return { message: 'Centro de custo removido com sucesso' }
    }
}