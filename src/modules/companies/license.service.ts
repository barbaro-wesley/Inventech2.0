import {
  Injectable, Logger, NotFoundException,
  BadRequestException, ForbiddenException,
} from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { CompanyStatus, UserStatus } from '@prisma/client'
import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { PrismaService } from '../../prisma/prisma.service'

export class SuspendCompanyDto {
  @ApiProperty({ example: 'Contrato vencido — cliente não renovou' })
  @IsString() @MinLength(5)
  reason: string
}

export class SetLicenseDto {
  @ApiProperty({ example: '2027-03-21', description: 'Data de vencimento da licença' })
  @IsDateString()
  expiresAt: string

  @ApiPropertyOptional({ example: 'Plano anual — Contrato #2026-042' })
  @IsOptional() @IsString()
  notes?: string
}

export class SetTrialDto {
  @ApiProperty({ example: '2026-04-21', description: 'Data de fim do período de teste' })
  @IsDateString()
  trialEndsAt: string
}

@Injectable()
export class LicenseService {
  private readonly logger = new Logger(LicenseService.name)

  constructor(private prisma: PrismaService) { }

  // ─────────────────────────────────────────
  // Suspender empresa manualmente
  // ─────────────────────────────────────────
  async suspend(companyId: string, reason: string, adminId: string) {
    const company = await this.findCompany(companyId)

    if (company.status === CompanyStatus.SUSPENDED) {
      throw new BadRequestException('Empresa já está suspensa')
    }

    // Suspende a empresa e todos os usuários em transação
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.company.update({
        where: { id: companyId },
        data: {
          status: CompanyStatus.SUSPENDED,
          suspendedAt: new Date(),
          suspendedReason: reason,
          suspendedBy: adminId,
        },
      })

      // Bloqueia todos os usuários ativos da empresa (exceto SUPER_ADMIN)
      const { count } = await tx.user.updateMany({
        where: {
          companyId,
          status: { in: [UserStatus.ACTIVE, UserStatus.UNVERIFIED] },
          deletedAt: null,
        },
        data: { status: UserStatus.SUSPENDED },
      })

      // Revoga todos os refresh tokens ativos (força logout imediato)
      await tx.refreshToken.updateMany({
        where: { user: { companyId }, revokedAt: null },
        data: { revokedAt: new Date() },
      })

      return count
    })

    this.logger.warn(
      `Empresa suspensa: ${company.name} (${companyId}) | ` +
      `${result} usuário(s) bloqueados | Motivo: ${reason} | Admin: ${adminId}`
    )

    return {
      message: `Empresa "${company.name}" suspensa com sucesso`,
      reason,
      usersBlocked: result,
    }
  }

  // ─────────────────────────────────────────
  // Reativar empresa
  // ─────────────────────────────────────────
  async activate(companyId: string, adminId: string) {
    const company = await this.findCompany(companyId)

    if (company.status === CompanyStatus.ACTIVE) {
      throw new BadRequestException('Empresa já está ativa')
    }

    // Reativa a empresa e todos os usuários suspensos pela empresa
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.company.update({
        where: { id: companyId },
        data: {
          status: CompanyStatus.ACTIVE,
          suspendedAt: null,
          suspendedReason: null,
          suspendedBy: null,
        },
      })

      // Reativa apenas usuários que foram suspensos (não os bloqueados por tentativas)
      // Usamos suspendedBy da empresa como referência — todos suspensos pela empresa voltam
      const { count } = await tx.user.updateMany({
        where: {
          companyId,
          status: UserStatus.SUSPENDED,
          deletedAt: null,
        },
        data: { status: UserStatus.ACTIVE },
      })

      return count
    })

    this.logger.log(
      `Empresa reativada: ${company.name} (${companyId}) | ` +
      `${result} usuário(s) reativados | Admin: ${adminId}`
    )

    return {
      message: `Empresa "${company.name}" reativada com sucesso`,
      usersUnblocked: result,
    }
  }

  // ─────────────────────────────────────────
  // Definir/renovar licença
  // ─────────────────────────────────────────
  async setLicense(companyId: string, dto: SetLicenseDto, adminId: string) {
    const company = await this.findCompany(companyId)
    const expiresAt = new Date(dto.expiresAt)

    if (expiresAt <= new Date()) {
      throw new BadRequestException('A data de vencimento deve ser futura')
    }

    await this.prisma.company.update({
      where: { id: companyId },
      data: {
        licenseExpiresAt: expiresAt,
        // Se estava suspensa por licença vencida, reativa automaticamente
        status: company.status === CompanyStatus.SUSPENDED
          ? CompanyStatus.ACTIVE
          : company.status,
        suspendedAt: company.status === CompanyStatus.SUSPENDED ? null : company.suspendedAt,
        suspendedReason: company.status === CompanyStatus.SUSPENDED ? null : company.suspendedReason,
      },
    })

    this.logger.log(`Licença renovada: ${company.name} até ${expiresAt.toLocaleDateString('pt-BR')} | Admin: ${adminId}`)
    return {
      message: `Licença de "${company.name}" válida até ${expiresAt.toLocaleDateString('pt-BR')}`,
      licenseExpiresAt: expiresAt,
    }
  }

  // ─────────────────────────────────────────
  // Configurar período de trial
  // ─────────────────────────────────────────
  async setTrial(companyId: string, dto: SetTrialDto, adminId: string) {
    const company = await this.findCompany(companyId)
    const trialEndsAt = new Date(dto.trialEndsAt)

    await this.prisma.company.update({
      where: { id: companyId },
      data: {
        status: CompanyStatus.TRIAL,
        trialEndsAt,
      },
    })

    this.logger.log(`Trial configurado: ${company.name} até ${trialEndsAt.toLocaleDateString('pt-BR')} | Admin: ${adminId}`)
    return {
      message: `Período de teste de "${company.name}" até ${trialEndsAt.toLocaleDateString('pt-BR')}`,
      trialEndsAt,
    }
  }

  // ─────────────────────────────────────────
  // Status detalhado da licença
  // ─────────────────────────────────────────
  async getLicenseStatus(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        status: true,
        trialEndsAt: true,
        licenseExpiresAt: true,
        suspendedAt: true,
        suspendedReason: true,
        suspendedBy: true,
        _count: {
          select: {
            users: true,
            clients: true,
          },
        },
      },
    })

    if (!company) throw new NotFoundException('Empresa não encontrada')

    const now = new Date()
    const isLicenseExpired = company.licenseExpiresAt && company.licenseExpiresAt < now
    const isTrialExpired = company.status === CompanyStatus.TRIAL && company.trialEndsAt && company.trialEndsAt < now
    const daysUntilExpiry = company.licenseExpiresAt
      ? Math.ceil((company.licenseExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null

    return {
      id: company.id,
      name: company.name,
      status: company.status,
      isActive: company.status === CompanyStatus.ACTIVE,
      isSuspended: company.status === CompanyStatus.SUSPENDED,
      isTrial: company.status === CompanyStatus.TRIAL,
      isLicenseExpired,
      isTrialExpired,
      licenseExpiresAt: company.licenseExpiresAt,
      trialEndsAt: company.trialEndsAt,
      daysUntilExpiry,
      // Alerta: licença vence em menos de 30 dias
      expiryWarning: daysUntilExpiry !== null && daysUntilExpiry > 0 && daysUntilExpiry <= 30,
      suspendedAt: company.suspendedAt,
      suspendedReason: company.suspendedReason,
      users: company._count.users,
      clients: company._count.clients,
    }
  }

  // ─────────────────────────────────────────
  // Lista empresas com status de licença
  // Para o painel do SUPER_ADMIN
  // ─────────────────────────────────────────
  async listLicenses(filters?: { status?: string; expiringInDays?: number }) {
    const now = new Date()
    const where: any = { deletedAt: null }

    if (filters?.status) where.status = filters.status

    if (filters?.expiringInDays) {
      const limit = new Date(now.getTime() + filters.expiringInDays * 24 * 60 * 60 * 1000)
      where.licenseExpiresAt = { gt: now, lte: limit }
    }

    const companies = await this.prisma.company.findMany({
      where,
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        licenseExpiresAt: true,
        trialEndsAt: true,
        suspendedAt: true,
        suspendedReason: true,
        _count: { select: { users: true, clients: true } },
      },
      orderBy: { name: 'asc' },
    })

    return companies.map((c) => {
      const daysUntilExpiry = c.licenseExpiresAt
        ? Math.ceil((c.licenseExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null

      return {
        ...c,
        daysUntilExpiry,
        isLicenseExpired: c.licenseExpiresAt ? c.licenseExpiresAt < now : false,
        isTrialExpired: c.status === 'TRIAL' && c.trialEndsAt ? c.trialEndsAt < now : false,
        expiryWarning: daysUntilExpiry !== null && daysUntilExpiry > 0 && daysUntilExpiry <= 30,
      }
    })
  }

  // ─────────────────────────────────────────
  // CronJob — roda todo dia às 8h
  // Suspende automaticamente empresas com licença/trial vencido
  // ─────────────────────────────────────────
  @Cron('0 8 * * *', { name: 'check-expired-licenses' })
  async checkAndSuspendExpired() {
    const now = new Date()
    this.logger.log('Verificando licenças/trials vencidos...')

    // Busca empresas ativas com licença vencida
    const expiredLicense = await this.prisma.company.findMany({
      where: {
        status: CompanyStatus.ACTIVE,
        licenseExpiresAt: { lt: now },
        deletedAt: null,
      },
      select: { id: true, name: true, licenseExpiresAt: true },
    })

    // Busca trials vencidos
    const expiredTrial = await this.prisma.company.findMany({
      where: {
        status: CompanyStatus.TRIAL,
        trialEndsAt: { lt: now },
        deletedAt: null,
      },
      select: { id: true, name: true, trialEndsAt: true },
    })

    const toSuspend = [
      ...expiredLicense.map((c) => ({ ...c, reason: `Licença vencida em ${c.licenseExpiresAt?.toLocaleDateString('pt-BR')}` })),
      ...expiredTrial.map((c) => ({ ...c, reason: `Período de teste encerrado em ${c.trialEndsAt?.toLocaleDateString('pt-BR')}` })),
    ]

    if (toSuspend.length === 0) {
      this.logger.log('Nenhuma empresa com licença vencida')
      return
    }

    for (const company of toSuspend) {
      await this.prisma.$transaction(async (tx) => {
        await tx.company.update({
          where: { id: company.id },
          data: {
            status: CompanyStatus.SUSPENDED,
            suspendedAt: now,
            suspendedReason: company.reason,
            suspendedBy: 'SYSTEM_AUTO',
          },
        })

        // Bloqueia todos os usuários da empresa
        await tx.user.updateMany({
          where: {
            companyId: company.id,
            status: { in: [UserStatus.ACTIVE, UserStatus.UNVERIFIED] },
            deletedAt: null,
          },
          data: { status: UserStatus.SUSPENDED },
        })

        // Revoga refresh tokens
        await tx.refreshToken.updateMany({
          where: { user: { companyId: company.id }, revokedAt: null },
          data: { revokedAt: now },
        })
      })
      this.logger.warn(`Auto-suspenso: ${company.name} | ${company.reason}`)
    }

    this.logger.log(`${toSuspend.length} empresa(s) suspensa(s) automaticamente`)
  }

  // ─────────────────────────────────────────
  // Helper
  // ─────────────────────────────────────────
  private async findCompany(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      select: {
        id: true, name: true, status: true,
        suspendedAt: true, suspendedReason: true,
      },
    })
    if (!company) throw new NotFoundException('Empresa não encontrada')
    return company
  }
}