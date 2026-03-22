import {
  Controller, Get, Query, Res, Param,
  ParseUUIDPipe,
} from '@nestjs/common'
import type { Response } from 'express'
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiProduces } from '@nestjs/swagger'
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator'
import { ServiceOrderStatus, UserRole } from '@prisma/client'
import { ReportsService } from './reports.service'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface'
import { RateLimit } from '../../common/decorators/rate-limit.decorator'

class ExportFiltersDto {
  @IsOptional() @IsUUID() clientId?: string
  @IsOptional() @IsUUID() groupId?: string
  @IsOptional() @IsUUID() technicianId?: string
  @IsOptional() @IsEnum(ServiceOrderStatus) status?: ServiceOrderStatus
  @IsOptional() @IsDateString() dateFrom?: string
  @IsOptional() @IsDateString() dateTo?: string
}

@ApiTags('Reports')
@ApiBearerAuth('JWT')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) { }

  // ─────────────────────────────────────────
  // GET /reports/service-orders/excel
  // ─────────────────────────────────────────
  @Get('service-orders/excel')
  @ApiOperation({
    summary: 'Exportar OS em Excel (.xlsx)',
    description:
      'Gera planilha Excel com todas as OS filtradas. ' +
      'Inclui zebra striping, filtros automáticos, cores por status e freeze da primeira linha.',
  })
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @ApiQuery({ name: 'clientId', required: false, type: String })
  @ApiQuery({ name: 'groupId', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: ServiceOrderStatus })
  @ApiQuery({ name: 'dateFrom', required: false, type: String, example: '2026-01-01' })
  @ApiQuery({ name: 'dateTo', required: false, type: String, example: '2026-03-31' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER)
  @RateLimit({ limit: 10, ttl: 60, message: 'Limite de exportações atingido. Aguarde {{ttl}} segundos.' })
  async exportExcel(
    @Query() filters: ExportFiltersDto,
    @CurrentUser() cu: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const buffer = await this.reportsService.exportServiceOrdersExcel(cu.companyId!, filters)

    const date = new Date().toISOString().split('T')[0]
    const filename = `OS_${date}.xlsx`

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    })

    res.end(buffer)
  }

  // ─────────────────────────────────────────
  // GET /reports/service-orders/pdf
  // ─────────────────────────────────────────
  @Get('service-orders/pdf')
  @ApiOperation({
    summary: 'Exportar OS em PDF',
    description:
      'Gera relatório PDF em formato A4 paisagem com todas as OS filtradas. ' +
      'Inclui cabeçalho, tabela com zebra striping e rodapé com período.',
  })
  @ApiProduces('application/pdf')
  @ApiQuery({ name: 'clientId', required: false, type: String })
  @ApiQuery({ name: 'groupId', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: ServiceOrderStatus })
  @ApiQuery({ name: 'dateFrom', required: false, type: String, example: '2026-01-01' })
  @ApiQuery({ name: 'dateTo', required: false, type: String, example: '2026-03-31' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER)
  @RateLimit({ limit: 10, ttl: 60, message: 'Limite de exportações atingido. Aguarde {{ttl}} segundos.' })
  async exportPdf(
    @Query() filters: ExportFiltersDto,
    @CurrentUser() cu: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const buffer = await this.reportsService.exportServiceOrdersPdf(cu.companyId!, filters)

    const date = new Date().toISOString().split('T')[0]
    const filename = `OS_${date}.pdf`

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    })

    res.end(buffer)
  }

  // ─────────────────────────────────────────
  // GET /reports/service-orders/excel/client/:clientId
  // Exportação restrita ao cliente (CLIENT_ADMIN)
  // ─────────────────────────────────────────
  @Get('service-orders/excel/client/:clientId')
  @ApiOperation({ summary: 'Exportar OS do cliente em Excel' })
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER, UserRole.CLIENT_ADMIN)
  @RateLimit({ limit: 5, ttl: 60, message: 'Limite de exportações atingido.' })
  async exportClientExcel(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Query() filters: ExportFiltersDto,
    @CurrentUser() cu: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const buffer = await this.reportsService.exportServiceOrdersExcel(
      cu.companyId!,
      { ...filters, clientId },
    )

    const date = new Date().toISOString().split('T')[0]
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="OS_${date}.xlsx"`,
      'Content-Length': buffer.length,
    })
    res.end(buffer)
  }
}