import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { ClientsRepository } from './clients.repository'
import { CreateClientDto } from './dto/create-client.dto'
import { UpdateClientDto } from './dto/update-client.dto'
import { ListClientsDto } from './dto/list-clients.dto'
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface'
import { Prisma } from '@prisma/client'
@Injectable()
export class ClientsService {
  private readonly logger = new Logger(ClientsService.name)

  constructor(private clientsRepository: ClientsRepository) { }

  // ─────────────────────────────────────────
  // Listar clientes da empresa
  // ─────────────────────────────────────────
  async findAll(currentUser: AuthenticatedUser, filters: ListClientsDto) {
    const companyId = this.resolveCompanyId(currentUser)
    return this.clientsRepository.findMany(companyId, filters)
  }

  // ─────────────────────────────────────────
  // Buscar cliente por ID
  // CLIENT_* só vê o próprio cliente
  // ─────────────────────────────────────────
  async findOne(id: string, currentUser: AuthenticatedUser) {
    // Usuários de cliente só podem ver o próprio cliente
    if (this.isClientRole(currentUser.role)) {
      if (currentUser.clientId !== id) {
        throw new ForbiddenException('Acesso negado a este cliente')
      }
    }

    const companyId = this.resolveCompanyId(currentUser)
    const client = await this.clientsRepository.findById(id, companyId)

    if (!client) {
      throw new NotFoundException('Cliente não encontrado')
    }

    return client
  }

  // ─────────────────────────────────────────
  // Criar cliente
  // Apenas empresa de manutenção cria clientes
  // ─────────────────────────────────────────
  async create(dto: CreateClientDto, currentUser: AuthenticatedUser) {
    this.ensureCompanyRole(currentUser)

    const companyId = currentUser.companyId!

    // Valida documento único dentro da empresa
    if (dto.document) {
      const documentTaken = await this.clientsRepository.documentExists(
        dto.document,
        companyId,
      )
      if (documentTaken) {
        throw new ConflictException(
          'Já existe um cliente com este CNPJ nesta empresa',
        )
      }
    }

    const client = await this.clientsRepository.create({
      name: dto.name,
      document: dto.document,
      email: dto.email,
      phone: dto.phone,
      address: dto.address ? (dto.address as unknown as Prisma.InputJsonValue) : undefined,
      status: dto.status,
      company: { connect: { id: companyId } },
    })

    this.logger.log(
      `Cliente criado: ${client.name} | Empresa: ${companyId}`,
    )

    return client
  }

  // ─────────────────────────────────────────
  // Atualizar cliente
  // ─────────────────────────────────────────
  async update(
    id: string,
    dto: UpdateClientDto,
    currentUser: AuthenticatedUser,
  ) {
    this.ensureCompanyRole(currentUser)

    const companyId = currentUser.companyId!
    const existing = await this.clientsRepository.findById(id, companyId)

    if (!existing) {
      throw new NotFoundException('Cliente não encontrado')
    }

    // Valida documento único se estiver sendo alterado
    if (dto.document && dto.document !== existing.document) {
      const documentTaken = await this.clientsRepository.documentExists(
        dto.document,
        companyId,
        id,
      )
      if (documentTaken) {
        throw new ConflictException(
          'Já existe um cliente com este CNPJ nesta empresa',
        )
      }
    }

    return this.clientsRepository.update(id, {
      ...(dto.name && { name: dto.name }),
      ...(dto.document !== undefined && { document: dto.document }),
      ...(dto.email !== undefined && { email: dto.email }),
      ...(dto.phone !== undefined && { phone: dto.phone }),
      ...(dto.address !== undefined && {
        address: dto.address as unknown as Prisma.InputJsonValue,
      }),
      ...(dto.status && { status: dto.status }),
    })
  }

  // ─────────────────────────────────────────
  // Soft delete
  // ─────────────────────────────────────────
  async remove(id: string, currentUser: AuthenticatedUser) {
    this.ensureCompanyRole(currentUser)

    const companyId = currentUser.companyId!
    const existing = await this.clientsRepository.findById(id, companyId)

    if (!existing) {
      throw new NotFoundException('Cliente não encontrado')
    }

    // Bloqueia remoção se houver equipamentos ou OS ativos
    const { _count } = existing
    if (_count.equipments > 0 || _count.serviceOrders > 0) {
      throw new ConflictException(
        `Não é possível remover este cliente pois possui ` +
        `${_count.equipments} equipamento(s) e ` +
        `${_count.serviceOrders} ordem(ns) de serviço vinculados.`,
      )
    }

    await this.clientsRepository.softDelete(id)

    this.logger.warn(`Cliente removido: ${existing.name} (id: ${id})`)

    return { message: 'Cliente removido com sucesso' }
  }

  // ─────────────────────────────────────────
  // Helpers privados
  // ─────────────────────────────────────────

  // Resolve o companyId correto baseado no papel
  private resolveCompanyId(user: AuthenticatedUser): string {
    if (user.role === UserRole.SUPER_ADMIN) {
      // SUPER_ADMIN pode ver tudo — mas clientes são sempre
      // listados dentro de uma empresa, então precisa de companyId
      if (!user.companyId) {
        throw new ForbiddenException(
          'SUPER_ADMIN deve informar o companyId para listar clientes',
        )
      }
    }
    return user.companyId!
  }

  // Garante que é um papel da empresa de manutenção (não cliente)
  private ensureCompanyRole(user: AuthenticatedUser) {
  const companyRoles: UserRole[] = [
    UserRole.SUPER_ADMIN,
    UserRole.COMPANY_ADMIN,
    UserRole.COMPANY_MANAGER,
  ]
  if (!companyRoles.includes(user.role)) {
    throw new ForbiddenException(
      'Apenas a empresa de manutenção pode gerenciar clientes',
    )
  }
  if (!user.companyId) {
    throw new ForbiddenException('Acesso sem escopo de empresa')
  }
}

  // Verifica se o papel é de usuário de cliente
  private isClientRole(role: UserRole): boolean {
  const clientRoles: UserRole[] = [
    UserRole.CLIENT_ADMIN,
    UserRole.CLIENT_USER,
    UserRole.CLIENT_VIEWER,
  ]
  return clientRoles.includes(role)
}
}