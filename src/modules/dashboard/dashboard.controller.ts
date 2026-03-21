import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { UserRole } from '@prisma/client'
import { DashboardService } from './dashboard.service'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface'

@ApiTags('Dashboard')
@ApiBearerAuth('JWT')
@Controller('dashboard')
export class DashboardController {
    constructor(private readonly dashboardService: DashboardService) { }

    // GET /dashboard
    // Visão geral da empresa — métricas consolidadas de todos os clientes
    @Get()
    @ApiOperation({
        summary: 'Dashboard da empresa',
        description:
            'Retorna métricas consolidadas: contadores de OS por status, ' +
            'timeline dos últimos 30 dias, top técnicos, disponibilidade ' +
            'de equipamentos, OS por grupo e alertas ativos.',
    })
    @Roles(
        UserRole.SUPER_ADMIN,
        UserRole.COMPANY_ADMIN,
        UserRole.COMPANY_MANAGER,
    )
    getCompanyDashboard(@CurrentUser() cu: AuthenticatedUser) {
        return this.dashboardService.getCompanyDashboard(cu.companyId!)
    }

    // GET /dashboard/client/:clientId
    // Visão restrita de um cliente específico
    @Get('client/:clientId')
    @ApiOperation({
        summary: 'Dashboard do cliente',
        description:
            'Retorna métricas de um cliente específico: ' +
            'contadores de OS, disponibilidade de equipamentos e OS recentes.',
    })
    @Roles(
        UserRole.SUPER_ADMIN,
        UserRole.COMPANY_ADMIN,
        UserRole.COMPANY_MANAGER,
        UserRole.CLIENT_ADMIN,
        UserRole.CLIENT_VIEWER,
    )
    getClientDashboard(
        @Param('clientId', ParseUUIDPipe) clientId: string,
        @CurrentUser() cu: AuthenticatedUser,
    ) {
        return this.dashboardService.getClientDashboard(cu.companyId!, clientId)
    }
}