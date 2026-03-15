import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common'
import { UserRole } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import { CompaniesRepository } from './companies.repository'
import { CreateCompanyDto } from './dto/create-company.dto'
import { UpdateCompanyDto } from './dto/update-company.dto'
import { ListCompaniesDto } from './dto/list-companies.dto'
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface'
import { PrismaService } from '../../prisma/prisma.service'

// Converte nome da empresa em slug URL-safe
// Ex: "Aria Engenharia de Manutenção" -> "aria-engenharia-de-manutencao"
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/[^a-z0-9\s-]/g, '')   // Remove caracteres especiais
    .trim()
    .replace(/\s+/g, '-')           // Espaços viram hífens
}

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name)

  constructor(
    private companiesRepository: CompaniesRepository,
    private prisma: PrismaService,
  ) {}

  // ─────────────────────────────────────────
  // Listar empresas — apenas SUPER_ADMIN
  // ─────────────────────────────────────────
  async findAll(filters: ListCompaniesDto) {
    return this.companiesRepository.findMany(filters)
  }

  // ─────────────────────────────────────────
  // Buscar empresa por ID
  // SUPER_ADMIN vê qualquer empresa
  // COMPANY_ADMIN vê apenas a própria
  // ─────────────────────────────────────────
  async findOne(id: string, currentUser: AuthenticatedUser) {
    // COMPANY_ADMIN só pode ver a própria empresa
    if (
      currentUser.role === UserRole.COMPANY_ADMIN ||
      currentUser.role === UserRole.COMPANY_MANAGER
    ) {
      if (currentUser.companyId !== id) {
        throw new ForbiddenException('Acesso negado a esta empresa')
      }
    }

    const company = await this.companiesRepository.findById(id)

    if (!company) {
      throw new NotFoundException('Empresa não encontrada')
    }

    return company
  }

  // ─────────────────────────────────────────
  // Criar empresa + COMPANY_ADMIN
  // Tudo em uma única transação — se um falhar, desfaz os dois
  // ─────────────────────────────────────────
  async create(dto: CreateCompanyDto) {
    // 1. Gera e valida slug único
    let slug = toSlug(dto.name)
    const slugTaken = await this.companiesRepository.slugExists(slug)

    if (slugTaken) {
      // Adiciona sufixo aleatório para garantir unicidade
      slug = `${slug}-${Date.now().toString(36)}`
    }

    // 2. Valida documento único se informado
    if (dto.document) {
      const documentTaken = await this.companiesRepository.documentExists(dto.document)
      if (documentTaken) {
        throw new ConflictException('Já existe uma empresa com este CNPJ')
      }
    }

    // 3. Verifica se email do admin já existe
    const adminEmailTaken = await this.prisma.user.findUnique({
      where: { email: dto.admin.email },
      select: { id: true },
    })
    if (adminEmailTaken) {
      throw new ConflictException('Já existe um usuário com o email do administrador')
    }

    // 4. Hash da senha do admin
    const passwordHash = await bcrypt.hash(dto.admin.password, 10)

    // 5. Busca ou cria a Platform (neste sistema há apenas uma)
    const platform = await this.prisma.platform.findFirst()
    if (!platform) {
      throw new NotFoundException('Plataforma não encontrada. Configure a Platform antes.')
    }

    // 6. Transação: cria empresa e admin juntos
    const result = await this.prisma.$transaction(async (tx) => {
      // Cria a empresa
      const company = await tx.company.create({
        data: {
          platformId: platform.id,
          name: dto.name,
          slug,
          document: dto.document,
          email: dto.email,
          phone: dto.phone,
          status: dto.status,
          trialEndsAt: dto.trialEndsAt ? new Date(dto.trialEndsAt) : null,
        },
      })

      // Cria o COMPANY_ADMIN vinculado à empresa
      const admin = await tx.user.create({
        data: {
          companyId: company.id,
          name: dto.admin.name,
          email: dto.admin.email,
          passwordHash,
          role: UserRole.COMPANY_ADMIN,
          phone: dto.admin.phone,
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
        },
      })

      return { company, admin }
    })

    this.logger.log(
      `Empresa criada: ${result.company.name} | Admin: ${result.admin.email}`,
    )

    return {
      company: result.company,
      admin: result.admin,
    }
  }

  // ─────────────────────────────────────────
  // Atualizar empresa
  // SUPER_ADMIN atualiza qualquer empresa
  // COMPANY_ADMIN atualiza apenas a própria (campos limitados)
  // ─────────────────────────────────────────
  async update(
    id: string,
    dto: UpdateCompanyDto,
    currentUser: AuthenticatedUser,
  ) {
    const company = await this.companiesRepository.findById(id)

    if (!company) {
      throw new NotFoundException('Empresa não encontrada')
    }

    // COMPANY_ADMIN só edita a própria empresa e não pode mudar status
    if (currentUser.role !== UserRole.SUPER_ADMIN) {
      if (currentUser.companyId !== id) {
        throw new ForbiddenException('Acesso negado a esta empresa')
      }
      // Remove campos exclusivos do SUPER_ADMIN
      delete dto.status
      delete dto.trialEndsAt
    }

    // Valida documento único se estiver sendo alterado
    if (dto.document && dto.document !== company.document) {
      const documentTaken = await this.companiesRepository.documentExists(
        dto.document,
        id,
      )
      if (documentTaken) {
        throw new ConflictException('Já existe uma empresa com este CNPJ')
      }
    }

    return this.companiesRepository.update(id, {
      ...(dto.name && { name: dto.name }),
      ...(dto.document !== undefined && { document: dto.document }),
      ...(dto.email !== undefined && { email: dto.email }),
      ...(dto.phone !== undefined && { phone: dto.phone }),
      ...(dto.status && { status: dto.status }),
      ...(dto.trialEndsAt !== undefined && {
        trialEndsAt: dto.trialEndsAt ? new Date(dto.trialEndsAt) : null,
      }),
      ...(dto.settings !== undefined && { settings: dto.settings }),
    })
  }

  // ─────────────────────────────────────────
  // Soft delete — apenas SUPER_ADMIN
  // ─────────────────────────────────────────
  async remove(id: string) {
    const company = await this.companiesRepository.findById(id)

    if (!company) {
      throw new NotFoundException('Empresa não encontrada')
    }

    await this.companiesRepository.softDelete(id)

    this.logger.warn(`Empresa removida: ${company.name} (id: ${id})`)

    return { message: 'Empresa removida com sucesso' }
  }
}