import { Injectable, ForbiddenException } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface'

export type ReportType = 'SERVICE_ORDERS' | 'EQUIPMENT' | 'PREVENTIVE' | 'TECHNICIANS' | 'FINANCIAL'

// ─────────────────────────────────────────
// Permissões padrão — usadas quando a empresa
// ainda não configurou nada
// ─────────────────────────────────────────
const DEFAULT_PERMISSIONS: Record<ReportType, UserRole[]> = {
    SERVICE_ORDERS: [
        UserRole.SUPER_ADMIN,
        UserRole.COMPANY_ADMIN,
        UserRole.COMPANY_MANAGER,
        UserRole.CLIENT_ADMIN,
    ],
    EQUIPMENT: [
        UserRole.SUPER_ADMIN,
        UserRole.COMPANY_ADMIN,
        UserRole.COMPANY_MANAGER,
        UserRole.CLIENT_ADMIN,
    ],
    PREVENTIVE: [
        UserRole.SUPER_ADMIN,
        UserRole.COMPANY_ADMIN,
        UserRole.COMPANY_MANAGER,
    ],
    TECHNICIANS: [
        UserRole.SUPER_ADMIN,
        UserRole.COMPANY_ADMIN,
        UserRole.COMPANY_MANAGER,
    ],
    FINANCIAL: [
        UserRole.SUPER_ADMIN,
        UserRole.COMPANY_ADMIN,
    ],
}

const REPORT_LABELS: Record<ReportType, string> = {
    SERVICE_ORDERS: 'Ordens de Serviço',
    EQUIPMENT: 'Equipamentos',
    PREVENTIVE: 'Manutenções Preventivas',
    TECHNICIANS: 'Técnicos',
    FINANCIAL: 'Financeiro',
}

@Injectable()
export class ReportPermissionsService {
    constructor(private prisma: PrismaService) { }

    // ─────────────────────────────────────────
    // Verifica se o usuário tem acesso ao relatório
    // Lança 403 se não tiver
    // ─────────────────────────────────────────
    async checkAccess(currentUser: AuthenticatedUser, reportType: ReportType): Promise<void> {
        // SUPER_ADMIN sempre tem acesso
        if (currentUser.role === UserRole.SUPER_ADMIN) return

        if (!currentUser.companyId) {
            throw new ForbiddenException('Acesso sem escopo de empresa')
        }

        const allowedRoles = await this.getEffectiveRoles(currentUser.companyId, reportType)

        if (!allowedRoles.includes(currentUser.role)) {
            throw new ForbiddenException(
                `Seu perfil (${currentUser.role}) não tem acesso ao relatório de ${REPORT_LABELS[reportType]}. ` +
                `Solicite ao administrador da empresa.`,
            )
        }
    }

    // ─────────────────────────────────────────
    // Retorna os roles efetivos para um relatório
    // Configuração da empresa > padrão do sistema
    // ─────────────────────────────────────────
    async getEffectiveRoles(companyId: string, reportType: ReportType): Promise<UserRole[]> {
        const custom = await this.prisma.reportPermission.findUnique({
            where: { companyId_reportType: { companyId, reportType } },
            select: { allowedRoles: true },
        })

        if (custom?.allowedRoles?.length) {
            return custom.allowedRoles as UserRole[]
        }

        // Sem configuração → usa o padrão
        return DEFAULT_PERMISSIONS[reportType]
    }

    // ─────────────────────────────────────────
    // Lista todas as permissões da empresa
    // Mescla configurações customizadas com padrões
    // ─────────────────────────────────────────
    async findAll(companyId: string) {
        const customs = await this.prisma.reportPermission.findMany({
            where: { companyId },
        })

        const customMap = new Map(customs.map((p) => [p.reportType, p.allowedRoles]))

        const reportTypes: ReportType[] = ['SERVICE_ORDERS', 'EQUIPMENT', 'PREVENTIVE', 'TECHNICIANS', 'FINANCIAL']

        return reportTypes.map((type) => {
            const customRoles = customMap.get(type)
            const isCustomized = !!customRoles?.length

            return {
                reportType: type,
                label: REPORT_LABELS[type],
                allowedRoles: isCustomized ? customRoles : DEFAULT_PERMISSIONS[type],
                isCustomized,
                // Mostra quais roles NÃO têm acesso para facilitar visualização no frontend
                blockedRoles: ALL_ROLES.filter(
                    (r) => !(isCustomized ? customRoles : DEFAULT_PERMISSIONS[type]).includes(r as UserRole),
                ),
            }
        })
    }

    // ─────────────────────────────────────────
    // Cria ou atualiza permissão de um relatório
    // ─────────────────────────────────────────
    async upsert(companyId: string, reportType: ReportType, allowedRoles: string[]) {
        // Valida os roles informados
        const validRoles = allowedRoles.filter((r) =>
            Object.values(UserRole).includes(r as UserRole),
        ) as UserRole[]

        // Sempre garante que SUPER_ADMIN e COMPANY_ADMIN têm acesso
        const ensured = [...new Set([
            UserRole.SUPER_ADMIN,
            UserRole.COMPANY_ADMIN,
            ...validRoles,
        ])]

        const permission = await this.prisma.reportPermission.upsert({
            where: {
                companyId_reportType: { companyId, reportType },
            },
            create: {
                companyId,
                reportType,
                allowedRoles: ensured,
            },
            update: {
                allowedRoles: ensured,
            },
        })

        return {
            reportType: permission.reportType,
            label: REPORT_LABELS[reportType],
            allowedRoles: permission.allowedRoles,
            message: `Permissões do relatório "${REPORT_LABELS[reportType]}" atualizadas`,
        }
    }

    // ─────────────────────────────────────────
    // Reseta para os padrões do sistema
    // ─────────────────────────────────────────
    async reset(companyId: string) {
        await this.prisma.reportPermission.deleteMany({ where: { companyId } })
        return {
            message: 'Permissões restauradas para os padrões do sistema',
            defaults: DEFAULT_PERMISSIONS,
        }
    }
}

const ALL_ROLES = Object.values(UserRole).filter((r) => r !== UserRole.SUPER_ADMIN)