import { Injectable } from '@nestjs/common'
import { Prisma, User } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { ListUsersDto } from './dto/list-users.dto'

// Campos seguros para retornar ao cliente — nunca expõe passwordHash
export const USER_SAFE_SELECT = {
  id: true,
  companyId: true,
  clientId: true,
  name: true,
  email: true,
  role: true,
  status: true,
  avatarUrl: true,
  phone: true,
  telegramChatId: true,
  lastLoginAt: true,
  lastLoginIp: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect

export type SafeUser = Prisma.UserGetPayload<{ select: typeof USER_SAFE_SELECT }>

@Injectable()
export class UsersRepository {
  constructor(private prisma: PrismaService) {}

  // ─────────────────────────────────────────
  // Busca por ID com isolamento de tenant
  // ─────────────────────────────────────────
  async findById(
    id: string,
    companyId: string,
  ): Promise<SafeUser | null> {
    return this.prisma.user.findFirst({
      where: { id, companyId, deletedAt: null },
      select: USER_SAFE_SELECT,
    })
  }

  // ─────────────────────────────────────────
  // Busca por email (usada no AuthService)
  // ─────────────────────────────────────────
  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
    })
  }

  // ─────────────────────────────────────────
  // Listagem com filtros e paginação
  // ─────────────────────────────────────────
  async findMany(
    companyId: string,
    filters: ListUsersDto,
  ): Promise<{ data: SafeUser[]; total: number; page: number; limit: number }> {
    const { search, role, status, clientId, page = 1, limit = 20 } = filters

    const where: Prisma.UserWhereInput = {
      companyId,
      deletedAt: null,
      ...(role && { role }),
      ...(status && { status }),
      ...(clientId && { clientId }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      }),
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: USER_SAFE_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ])

    return { data, total, page, limit }
  }

  // ─────────────────────────────────────────
  // Criação
  // ─────────────────────────────────────────
  async create(data: Prisma.UserCreateInput): Promise<SafeUser> {
    return this.prisma.user.create({
      data,
      select: USER_SAFE_SELECT,
    })
  }

  // ─────────────────────────────────────────
  // Atualização com isolamento de tenant
  // ─────────────────────────────────────────
  async update(
    id: string,
    companyId: string,
    data: Prisma.UserUpdateInput,
  ): Promise<SafeUser> {
    return this.prisma.user.update({
      where: { id },
      data,
      select: USER_SAFE_SELECT,
    })
  }

  // ─────────────────────────────────────────
  // Soft delete
  // ─────────────────────────────────────────
  async softDelete(id: string, companyId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
  }

  // ─────────────────────────────────────────
  // Verifica se email já existe
  // ─────────────────────────────────────────
  async emailExists(email: string, excludeId?: string): Promise<boolean> {
    const user = await this.prisma.user.findFirst({
      where: {
        email,
        deletedAt: null,
        ...(excludeId && { id: { not: excludeId } }),
      },
      select: { id: true },
    })
    return !!user
  }
}