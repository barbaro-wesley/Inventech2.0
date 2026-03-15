import {
    Injectable,
    NotFoundException,
    ConflictException,
    BadRequestException,
} from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface'
import {
    CreateLocationDto,
    UpdateLocationDto,
    ListLocationsDto,
} from './dto/location.dto'
import { Prisma } from '@prisma/client'

const LOCATION_SELECT = {
    id: true,
    companyId: true,
    clientId: true,
    name: true,
    parentId: true,
    description: true,
    isActive: true,
    createdAt: true,
    parent: { select: { id: true, name: true } },
    children: { select: { id: true, name: true, isActive: true } },
    _count: { select: { equipments: true } },
} satisfies Prisma.LocationSelect

@Injectable()
export class LocationsService {
    constructor(private prisma: PrismaService) { }

    async findAll(
        clientId: string,
        companyId: string,
        filters: ListLocationsDto,
    ) {
        const { search, parentId, isActive, page = 1, limit = 50 } = filters

        const where: Prisma.LocationWhereInput = {
            clientId,
            companyId,
            ...(isActive !== undefined && { isActive }),
            // undefined = raiz, string = filho de parentId
            ...(parentId !== undefined && { parentId }),
            ...(search && {
                name: { contains: search, mode: 'insensitive' },
            }),
        }

        const [data, total] = await this.prisma.$transaction([
            this.prisma.location.findMany({
                where,
                select: LOCATION_SELECT,
                orderBy: { name: 'asc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.location.count({ where }),
        ])

        return { data, total, page, limit }
    }

    // Retorna árvore completa de localizações do cliente
    async findTree(clientId: string, companyId: string) {
        const all = await this.prisma.location.findMany({
            where: { clientId, companyId, isActive: true },
            select: {
                id: true,
                name: true,
                parentId: true,
                description: true,
                _count: { select: { equipments: true } },
            },
            orderBy: { name: 'asc' },
        })

        // Monta a árvore em memória
        const map = new Map(all.map((l) => [l.id, { ...l, children: [] as any[] }]))
        const roots: any[] = []

        for (const node of map.values()) {
            if (node.parentId) {
                const parent = map.get(node.parentId)
                if (parent) parent.children.push(node)
            } else {
                roots.push(node)
            }
        }

        return roots
    }

    async findOne(id: string, clientId: string, companyId: string) {
        const location = await this.prisma.location.findFirst({
            where: { id, clientId, companyId },
            select: LOCATION_SELECT,
        })

        if (!location) throw new NotFoundException('Localização não encontrada')

        return location
    }

    async create(
        dto: CreateLocationDto,
        clientId: string,
        companyId: string,
    ) {
        // Valida parentId pertence ao mesmo cliente
        if (dto.parentId) {
            const parent = await this.prisma.location.findFirst({
                where: { id: dto.parentId, clientId, companyId },
                select: { id: true },
            })
            if (!parent) {
                throw new BadRequestException(
                    'Localização pai não encontrada neste cliente',
                )
            }
        }

        return this.prisma.location.create({
            data: {
                companyId,
                clientId,
                name: dto.name,
                description: dto.description,
                parentId: dto.parentId ?? null,
            },
            select: LOCATION_SELECT,
        })
    }

    async update(
        id: string,
        dto: UpdateLocationDto,
        clientId: string,
        companyId: string,
    ) {
        const existing = await this.prisma.location.findFirst({
            where: { id, clientId, companyId },
            select: { id: true },
        })

        if (!existing) throw new NotFoundException('Localização não encontrada')

        // Impede que um nó seja pai de si mesmo
        if (dto.parentId === id) {
            throw new BadRequestException(
                'Uma localização não pode ser pai de si mesma',
            )
        }

        return this.prisma.location.update({
            where: { id },
            data: {
                ...(dto.name && { name: dto.name }),
                ...(dto.description !== undefined && { description: dto.description }),
                ...(dto.parentId !== undefined && { parentId: dto.parentId }),
                ...(dto.isActive !== undefined && { isActive: dto.isActive }),
            },
            select: LOCATION_SELECT,
        })
    }

    async remove(id: string, clientId: string, companyId: string) {
        const location = await this.prisma.location.findFirst({
            where: { id, clientId, companyId },
            select: {
                id: true,
                name: true,
                _count: { select: { equipments: true, children: true } },
            },
        })

        if (!location) throw new NotFoundException('Localização não encontrada')

        if (location._count.equipments > 0) {
            throw new ConflictException(
                `Não é possível remover — ${location._count.equipments} equipamento(s) nesta localização`,
            )
        }

        if (location._count.children > 0) {
            throw new ConflictException(
                `Não é possível remover — esta localização possui sublocalizações`,
            )
        }

        await this.prisma.location.delete({ where: { id } })

        return { message: 'Localização removida com sucesso' }
    }
}