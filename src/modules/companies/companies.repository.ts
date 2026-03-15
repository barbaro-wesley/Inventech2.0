import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { ListCompaniesDto } from './dto/list-companies.dto'

export const COMPANY_SELECT = {
  id: true,
  platformId: true,
  name: true,
  slug: true,
  document: true,
  email: true,
  phone: true,
  logoUrl: true,
  status: true,
  trialEndsAt: true,
  settings: true,
  createdAt: true,
  updatedAt: true,
  // Conta clientes e usuários para exibir no painel do SUPER_ADMIN
  _count: {
    select: {
      clients: true,
      users: true,
    },
  },
} satisfies Prisma.CompanySelect

export type CompanyWithCount = Prisma.CompanyGetPayload<{
  select: typeof COMPANY_SELECT
}>

@Injectable()
export class CompaniesRepository {
  constructor(private prisma: PrismaService) {}

  async findById(id: string): Promise<CompanyWithCount | null> {
    return this.prisma.company.findFirst({
      where: { id, deletedAt: null },
      select: COMPANY_SELECT,
    })
  }

  async findBySlug(slug: string): Promise<CompanyWithCount | null> {
    return this.prisma.company.findFirst({
      where: { slug, deletedAt: null },
      select: COMPANY_SELECT,
    })
  }

  async findMany(
    filters: ListCompaniesDto,
  ): Promise<{ data: CompanyWithCount[]; total: number; page: number; limit: number }> {
    const { search, status, page = 1, limit = 20 } = filters

    const where: Prisma.CompanyWhereInput = {
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
      this.prisma.company.findMany({
        where,
        select: COMPANY_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.company.count({ where }),
    ])

    return { data, total, page, limit }
  }

  async create(
    data: Prisma.CompanyCreateInput,
  ): Promise<CompanyWithCount> {
    return this.prisma.company.create({
      data,
      select: COMPANY_SELECT,
    })
  }

  async update(
    id: string,
    data: Prisma.CompanyUpdateInput,
  ): Promise<CompanyWithCount> {
    return this.prisma.company.update({
      where: { id },
      data,
      select: COMPANY_SELECT,
    })
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.company.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
  }

  async slugExists(slug: string, excludeId?: string): Promise<boolean> {
    const company = await this.prisma.company.findFirst({
      where: {
        slug,
        deletedAt: null,
        ...(excludeId && { id: { not: excludeId } }),
      },
      select: { id: true },
    })
    return !!company
  }

  async documentExists(document: string, excludeId?: string): Promise<boolean> {
    const company = await this.prisma.company.findFirst({
      where: {
        document,
        deletedAt: null,
        ...(excludeId && { id: { not: excludeId } }),
      },
      select: { id: true },
    })
    return !!company
  }
}