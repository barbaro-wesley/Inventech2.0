import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { ListClientsDto } from './dto/list-clients.dto'

export const CLIENT_SELECT = {
  id: true,
  companyId: true,
  name: true,
  document: true,
  email: true,
  phone: true,
  address: true,
  status: true,
  settings: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      equipments: true,
      users: true,
      serviceOrders: true,
    },
  },
} satisfies Prisma.ClientSelect

export type SafeClient = Prisma.ClientGetPayload<{
  select: typeof CLIENT_SELECT
}>

@Injectable()
export class ClientsRepository {
  constructor(private prisma: PrismaService) {}

  // ─────────────────────────────────────────
  // Busca por ID garantindo que pertence à empresa
  // ─────────────────────────────────────────
  async findById(id: string, companyId: string): Promise<SafeClient | null> {
    return this.prisma.client.findFirst({
      where: { id, companyId, deletedAt: null },
      select: CLIENT_SELECT,
    })
  }

  // ─────────────────────────────────────────
  // Listagem filtrada por empresa (tenant)
  // ─────────────────────────────────────────
  async findMany(
    companyId: string,
    filters: ListClientsDto,
  ): Promise<{ data: SafeClient[]; total: number; page: number; limit: number }> {
    const { search, status, page = 1, limit = 20 } = filters

    const where: Prisma.ClientWhereInput = {
      companyId,
      deletedAt: null,
      ...(status && { status }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { document: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      }),
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.client.findMany({
        where,
        select: CLIENT_SELECT,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.client.count({ where }),
    ])

    return { data, total, page, limit }
  }

  async create(data: Prisma.ClientCreateInput): Promise<SafeClient> {
    return this.prisma.client.create({
      data,
      select: CLIENT_SELECT,
    })
  }

  async update(id: string, data: Prisma.ClientUpdateInput): Promise<SafeClient> {
    return this.prisma.client.update({
      where: { id },
      data,
      select: CLIENT_SELECT,
    })
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.client.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
  }

  async documentExists(
    document: string,
    companyId: string,
    excludeId?: string,
  ): Promise<boolean> {
    const client = await this.prisma.client.findFirst({
      where: {
        document,
        companyId,
        deletedAt: null,
        ...(excludeId && { id: { not: excludeId } }),
      },
      select: { id: true },
    })
    return !!client
  }
}