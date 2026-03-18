import {
    Injectable,
    NotFoundException,
    ConflictException,
} from '@nestjs/common'
import { Prisma, AttachmentEntity } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface'
import { CreateEquipmentDto, UpdateEquipmentDto, ListEquipmentsDto } from './dto/equipment.dto'
import { StorageService } from '../storage/storage.service'

const EQUIPMENT_SELECT = {
    id: true,
    companyId: true,
    clientId: true,
    name: true,
    brand: true,
    model: true,
    serialNumber: true,
    patrimonyNumber: true,
    anvisaNumber: true,
    status: true,
    criticality: true,
    purchaseValue: true,
    purchaseDate: true,
    invoiceNumber: true,
    warrantyStart: true,
    warrantyEnd: true,
    depreciationRate: true,
    currentValue: true,
    lastDepreciationCalc: true,
    ipAddress: true,
    operatingSystem: true,
    btus: true,
    voltage: true,
    power: true,
    observations: true,
    createdAt: true,
    updatedAt: true,
    type: { select: { id: true, name: true } },
    subtype: { select: { id: true, name: true } },
    location: { select: { id: true, name: true } },
    currentLocation: { select: { id: true, name: true } },
    costCenter: { select: { id: true, name: true, code: true } },
    _count: {
        select: { serviceOrders: true, maintenances: true, attachments: true },
    },
} satisfies Prisma.EquipmentSelect

@Injectable()
export class EquipmentService {
    constructor(
        private prisma: PrismaService,
        private storageService: StorageService,
    ) { }

    async findAll(
        clientId: string,
        companyId: string,
        filters: ListEquipmentsDto,
    ) {
        const { search, status, criticality, typeId, locationId, costCenterId, page = 1, limit = 20 } = filters

        const where: Prisma.EquipmentWhereInput = {
            clientId,
            companyId,
            deletedAt: null,
            ...(status && { status }),
            ...(criticality && { criticality }),
            ...(typeId && { typeId }),
            ...(locationId && { locationId }),
            ...(costCenterId && { costCenterId }),
            ...(search && {
                OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { brand: { contains: search, mode: 'insensitive' } },
                    { model: { contains: search, mode: 'insensitive' } },
                    { serialNumber: { contains: search, mode: 'insensitive' } },
                    { patrimonyNumber: { contains: search, mode: 'insensitive' } },
                ],
            }),
        }

        const [data, total] = await this.prisma.$transaction([
            this.prisma.equipment.findMany({
                where,
                select: EQUIPMENT_SELECT,
                orderBy: { name: 'asc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.equipment.count({ where }),
        ])

        return { data, total, page, limit }
    }

    async findOne(id: string, clientId: string, companyId: string) {
        const equipment = await this.prisma.equipment.findFirst({
            where: { id, clientId, companyId, deletedAt: null },
            select: EQUIPMENT_SELECT,
        })
        if (!equipment) throw new NotFoundException('Equipamento não encontrado')
        return equipment
    }

    async create(
        dto: CreateEquipmentDto,
        clientId: string,
        companyId: string,
        currentUser: AuthenticatedUser,
        files: Express.Multer.File[] = [],
    ) {
        // Valida número de série único no cliente
        if (dto.serialNumber) {
            const exists = await this.prisma.equipment.findFirst({
                where: { serialNumber: dto.serialNumber, clientId, deletedAt: null },
                select: { id: true },
            })
            if (exists) {
                throw new ConflictException('Já existe um equipamento com este número de série neste cliente')
            }
        }

        // Valida patrimônio único no cliente
        if (dto.patrimonyNumber) {
            const exists = await this.prisma.equipment.findFirst({
                where: { patrimonyNumber: dto.patrimonyNumber, clientId, deletedAt: null },
                select: { id: true },
            })
            if (exists) {
                throw new ConflictException('Já existe um equipamento com este número de patrimônio')
            }
        }

        // Calcula valor atual inicial (igual ao de compra)
        const currentValue = dto.purchaseValue ? dto.purchaseValue : null

        const equipment = await this.prisma.equipment.create({
            data: {
                companyId,
                clientId,
                name: dto.name,
                brand: dto.brand,
                model: dto.model,
                serialNumber: dto.serialNumber,
                patrimonyNumber: dto.patrimonyNumber,
                anvisaNumber: dto.anvisaNumber,
                purchaseValue: dto.purchaseValue ? new (require('decimal.js').Decimal)(dto.purchaseValue) : undefined,
                purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : undefined,
                invoiceNumber: dto.invoiceNumber,
                warrantyStart: dto.warrantyStart ? new Date(dto.warrantyStart) : undefined,
                warrantyEnd: dto.warrantyEnd ? new Date(dto.warrantyEnd) : undefined,
                depreciationRate: dto.depreciationRate ? new (require('decimal.js').Decimal)(dto.depreciationRate) : undefined,
                currentValue: currentValue ? new (require('decimal.js').Decimal)(currentValue) : undefined,
                ipAddress: dto.ipAddress,
                operatingSystem: dto.operatingSystem,
                btus: dto.btus,
                voltage: dto.voltage,
                power: dto.power,
                criticality: dto.criticality,
                observations: dto.observations,
                typeId: dto.typeId,
                subtypeId: dto.subtypeId,
                locationId: dto.locationId,
                currentLocationId: dto.locationId,
                costCenterId: dto.costCenterId,
            },
            select: EQUIPMENT_SELECT,
        })

        // Faz upload dos arquivos se enviados junto com o cadastro
        if (files && files.length > 0) {
            await Promise.all(
                files.map((file) =>
                    this.storageService.upload(
                        file,
                        { entity: AttachmentEntity.EQUIPMENT, entityId: equipment.id },
                        companyId,
                        clientId,
                        currentUser,
                    ),
                ),
            )
        }

        return equipment
    }

    async update(
        id: string,
        dto: UpdateEquipmentDto,
        clientId: string,
        companyId: string,
    ) {
        const existing = await this.prisma.equipment.findFirst({
            where: { id, clientId, companyId, deletedAt: null },
            select: { id: true, serialNumber: true, patrimonyNumber: true },
        })
        if (!existing) throw new NotFoundException('Equipamento não encontrado')

        // Valida número de série único se mudando
        if (dto.serialNumber && dto.serialNumber !== existing.serialNumber) {
            const conflict = await this.prisma.equipment.findFirst({
                where: { serialNumber: dto.serialNumber, clientId, deletedAt: null, id: { not: id } },
                select: { id: true },
            })
            if (conflict) throw new ConflictException('Número de série já em uso neste cliente')
        }

        return this.prisma.equipment.update({
            where: { id },
            data: {
                ...(dto.name && { name: dto.name }),
                ...(dto.brand !== undefined && { brand: dto.brand }),
                ...(dto.model !== undefined && { model: dto.model }),
                ...(dto.serialNumber !== undefined && { serialNumber: dto.serialNumber }),
                ...(dto.patrimonyNumber !== undefined && { patrimonyNumber: dto.patrimonyNumber }),
                ...(dto.anvisaNumber !== undefined && { anvisaNumber: dto.anvisaNumber }),
                ...(dto.status && { status: dto.status }),
                ...(dto.criticality && { criticality: dto.criticality }),
                ...(dto.ipAddress !== undefined && { ipAddress: dto.ipAddress }),
                ...(dto.operatingSystem !== undefined && { operatingSystem: dto.operatingSystem }),
                ...(dto.btus !== undefined && { btus: dto.btus }),
                ...(dto.voltage !== undefined && { voltage: dto.voltage }),
                ...(dto.power !== undefined && { power: dto.power }),
                ...(dto.observations !== undefined && { observations: dto.observations }),
                ...(dto.typeId !== undefined && {
                    type: dto.typeId ? { connect: { id: dto.typeId } } : { disconnect: true },
                }),
                ...(dto.subtypeId !== undefined && {
                    subtype: dto.subtypeId ? { connect: { id: dto.subtypeId } } : { disconnect: true },
                }),
                ...(dto.locationId !== undefined && {
                    location: dto.locationId ? { connect: { id: dto.locationId } } : { disconnect: true },
                }),
                ...(dto.costCenterId !== undefined && {
                    costCenter: dto.costCenterId ? { connect: { id: dto.costCenterId } } : { disconnect: true },
                }),
            },
            select: EQUIPMENT_SELECT,
        })
    }

    async remove(id: string, clientId: string, companyId: string) {
        const equipment = await this.prisma.equipment.findFirst({
            where: { id, clientId, companyId, deletedAt: null },
            select: {
                id: true, name: true,
                _count: { select: { serviceOrders: true } },
            },
        })
        if (!equipment) throw new NotFoundException('Equipamento não encontrado')

        if (equipment._count.serviceOrders > 0) {
            throw new ConflictException(
                `Não é possível remover — ${equipment._count.serviceOrders} OS vinculada(s)`,
            )
        }

        await this.prisma.equipment.update({
            where: { id },
            data: { deletedAt: new Date() },
        })

        return { message: 'Equipamento removido com sucesso' }
    }

    // ── Cálculo de depreciação ─────────────────────────
    // Depreciação linear: valor_atual = valor_compra * (1 - taxa * anos)
    async recalculateDepreciation(id: string, clientId: string, companyId: string) {
        const equipment = await this.prisma.equipment.findFirst({
            where: { id, clientId, companyId, deletedAt: null },
            select: {
                id: true,
                purchaseValue: true,
                purchaseDate: true,
                depreciationRate: true,
            },
        })
        if (!equipment) throw new NotFoundException('Equipamento não encontrado')

        if (
            !equipment.purchaseValue ||
            !equipment.purchaseDate ||
            !equipment.depreciationRate
        ) {
            return { message: 'Dados insuficientes para calcular depreciação' }
        }

        const yearsElapsed =
            (Date.now() - new Date(equipment.purchaseDate).getTime()) /
            (1000 * 60 * 60 * 24 * 365)

        const rate = Number(equipment.depreciationRate) / 100
        const purchaseValue = Number(equipment.purchaseValue)
        const currentValue = Math.max(0, purchaseValue * (1 - rate * yearsElapsed))

        await this.prisma.equipment.update({
            where: { id },
            data: {
                currentValue: currentValue,
                lastDepreciationCalc: new Date(),
            },
        })

        return {
            purchaseValue,
            currentValue: Number(currentValue.toFixed(2)),
            yearsElapsed: Number(yearsElapsed.toFixed(2)),
            depreciationRate: Number(equipment.depreciationRate),
        }
    }
}