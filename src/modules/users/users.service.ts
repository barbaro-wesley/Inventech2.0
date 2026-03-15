import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common'
import { UserRole } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import { UsersRepository } from './users.repository'
import { CreateUserDto } from './dto/create-user.dto'
import { UpdateUserDto } from './dto/update-user.dto'
import { ListUsersDto } from './dto/list-users.dto'
import type  { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface'

// Papéis que pertencem à empresa de manutenção
const COMPANY_ROLES: UserRole[] = [
  UserRole.COMPANY_ADMIN,
  UserRole.COMPANY_MANAGER,
  UserRole.TECHNICIAN,
]


// Papéis que pertencem ao cliente final
const CLIENT_ROLES: UserRole[] = [
  UserRole.CLIENT_ADMIN,
  UserRole.CLIENT_USER,
  UserRole.CLIENT_VIEWER,
]
@Injectable()
export class UsersService {
  constructor(private usersRepository: UsersRepository) {}

  // ─────────────────────────────────────────
  // Listar usuários
  // ─────────────────────────────────────────
  async findAll(currentUser: AuthenticatedUser, filters: ListUsersDto) {
    this.ensureCompanyScope(currentUser)
    return this.usersRepository.findMany(currentUser.companyId!, filters)
  }

  // ─────────────────────────────────────────
  // Buscar um usuário por ID
  // ─────────────────────────────────────────
  async findOne(id: string, currentUser: AuthenticatedUser) {
    this.ensureCompanyScope(currentUser)

    const user = await this.usersRepository.findById(id, currentUser.companyId!)

    if (!user) {
      throw new NotFoundException('Usuário não encontrado')
    }

    return user
  }

  // ─────────────────────────────────────────
  // Criar usuário
  // ─────────────────────────────────────────
  async create(dto: CreateUserDto, currentUser: AuthenticatedUser) {
    this.ensureCompanyScope(currentUser)
    this.validateRolePermission(dto.role, currentUser)

    // Verifica email duplicado
    const emailTaken = await this.usersRepository.emailExists(dto.email)
    if (emailTaken) {
      throw new ConflictException('Este email já está em uso')
    }

    // Resolve companyId e clientId baseado no role
    const { companyId, clientId } = this.resolveTenantIds(dto, currentUser)

    // Valida que usuários de cliente têm clientId
    if (CLIENT_ROLES.includes(dto.role) && !clientId) {
      throw new BadRequestException(
        'clientId é obrigatório para usuários do tipo cliente',
      )
    }

    const passwordHash = await bcrypt.hash(dto.password, 10)

    return this.usersRepository.create({
      name: dto.name,
      email: dto.email,
      passwordHash,
      role: dto.role,
      phone: dto.phone,
      telegramChatId: dto.telegramChatId,
      company: companyId ? { connect: { id: companyId } } : undefined,
      client: clientId ? { connect: { id: clientId } } : undefined,
    })
  }

  // ─────────────────────────────────────────
  // Atualizar usuário
  // ─────────────────────────────────────────
  async update(id: string, dto: UpdateUserDto, currentUser: AuthenticatedUser) {
    this.ensureCompanyScope(currentUser)

    // Garante que o usuário existe e pertence à mesma empresa
    const existing = await this.usersRepository.findById(id, currentUser.companyId!)
    if (!existing) {
      throw new NotFoundException('Usuário não encontrado')
    }

    // Não permite que um usuário edite outro de papel superior
    this.validateRoleHierarchy(existing.role, currentUser)

    const data: Record<string, any> = {
      ...(dto.name && { name: dto.name }),
      ...(dto.phone !== undefined && { phone: dto.phone }),
      ...(dto.telegramChatId !== undefined && { telegramChatId: dto.telegramChatId }),
      ...(dto.status && { status: dto.status }),
    }

    // Atualiza senha se fornecida
    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 10)
    }

    return this.usersRepository.update(id, currentUser.companyId!, data)
  }

  // ─────────────────────────────────────────
  // Remover usuário (soft delete)
  // ─────────────────────────────────────────
  async remove(id: string, currentUser: AuthenticatedUser) {
    this.ensureCompanyScope(currentUser)

    // Não permite auto-deleção
    if (id === currentUser.sub) {
      throw new ForbiddenException('Você não pode remover sua própria conta')
    }

    const existing = await this.usersRepository.findById(id, currentUser.companyId!)
    if (!existing) {
      throw new NotFoundException('Usuário não encontrado')
    }

    this.validateRoleHierarchy(existing.role, currentUser)

    await this.usersRepository.softDelete(id, currentUser.companyId!)

    return { message: 'Usuário removido com sucesso' }
  }

  // ─────────────────────────────────────────
  // Perfil do próprio usuário logado
  // ─────────────────────────────────────────
  async getProfile(currentUser: AuthenticatedUser) {
    const user = await this.usersRepository.findByEmail(currentUser.email)
    if (!user) throw new NotFoundException('Usuário não encontrado')

    // Remove o hash antes de retornar
    const { passwordHash, ...safeUser } = user
    return safeUser
  }

  // ─────────────────────────────────────────
  // Helpers privados
  // ─────────────────────────────────────────

  // Garante que o usuário tem companyId (não é SUPER_ADMIN acessando sem escopo)
  private ensureCompanyScope(user: AuthenticatedUser) {
    if (user.role !== UserRole.SUPER_ADMIN && !user.companyId) {
      throw new ForbiddenException('Acesso sem escopo de empresa')
    }
  }

  // Valida se o usuário logado pode criar um usuário com determinado role
  private validateRolePermission(role: UserRole, currentUser: AuthenticatedUser) {
    const { role: currentRole } = currentUser

    // SUPER_ADMIN pode criar qualquer papel
    if (currentRole === UserRole.SUPER_ADMIN) return

    // COMPANY_ADMIN pode criar qualquer papel exceto SUPER_ADMIN
    if (currentRole === UserRole.COMPANY_ADMIN && role !== UserRole.SUPER_ADMIN) return

    // COMPANY_MANAGER só pode criar técnicos e usuários de cliente
    if (
      currentRole === UserRole.COMPANY_MANAGER &&
      [...CLIENT_ROLES, UserRole.TECHNICIAN].includes(role)
    ) return

    throw new ForbiddenException(
      `Você não tem permissão para criar usuários com o papel: ${role}`,
    )
  }

  // Impede edição de usuários com papel igual ou superior ao do editor
  private validateRoleHierarchy(targetRole: UserRole, currentUser: AuthenticatedUser) {
    const hierarchy: Record<UserRole, number> = {
      [UserRole.SUPER_ADMIN]: 100,
      [UserRole.COMPANY_ADMIN]: 80,
      [UserRole.COMPANY_MANAGER]: 60,
      [UserRole.TECHNICIAN]: 40,
      [UserRole.CLIENT_ADMIN]: 30,
      [UserRole.CLIENT_USER]: 20,
      [UserRole.CLIENT_VIEWER]: 10,
    }

    const currentLevel = hierarchy[currentUser.role]
    const targetLevel = hierarchy[targetRole]

    if (targetLevel >= currentLevel) {
      throw new ForbiddenException(
        'Você não pode editar um usuário com papel igual ou superior ao seu',
      )
    }
  }

  // Resolve companyId e clientId com base no role e no usuário logado
  private resolveTenantIds(dto: CreateUserDto, currentUser: AuthenticatedUser) {
    // SUPER_ADMIN precisa informar companyId explicitamente
    if (currentUser.role === UserRole.SUPER_ADMIN) {
      return {
        companyId: dto.companyId ?? null,
        clientId: dto.clientId ?? null,
      }
    }

    // Demais usuários herdam o companyId do criador
    const companyId = currentUser.companyId!

    // clientId: usa o do DTO se informado, ou herda do criador se for usuário de cliente
    const clientId =
      dto.clientId ??
      (CLIENT_ROLES.includes(dto.role) ? currentUser.clientId : null)

    return { companyId, clientId }
  }
}