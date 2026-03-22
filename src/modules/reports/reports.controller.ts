import {
  Controller, Get, Query, Res, Param,
  Post, Patch, Body, ParseUUIDPipe,
  HttpCode, HttpStatus,
} from '@nestjs/common'
import type { Response } from 'express'
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger'
import {
  IsDateString, IsEnum, IsOptional, IsUUID,
  IsBoolean, IsArray, IsString,
} from 'class-validator'
import { Transform } from 'class-transformer'
import { ServiceOrderStatus, UserRole } from '@prisma/client'
import { ReportsService } from './reports.service'
import { ReportPermissionsService, type ReportType } from './report-permissions.service'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface'
import { RateLimit } from '../../common/decorators/rate-limit.decorator'

// ─── DTOs ────────────────────────────────────────────────────────────────────

class OsFiltersDto {
  @IsOptional() @IsUUID() clientId?: string
  @IsOptional() @IsUUID() groupId?: string
  @IsOptional() @IsUUID() technicianId?: string
  @IsOptional() @IsEnum(ServiceOrderStatus) status?: ServiceOrderStatus
  @IsOptional() @IsDateString() dateFrom?: string
  @IsOptional() @IsDateString() dateTo?: string
}

class EquipmentFiltersDto {
  @IsOptional() @IsUUID() clientId?: string
  @IsOptional() @IsString() status?: string
  @IsOptional() @IsUUID() typeId?: string
}

class PreventiveFiltersDto {
  @IsOptional() @IsUUID() clientId?: string
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean
}

class SetReportPermissionDto {
  @IsEnum(['SERVICE_ORDERS', 'EQUIPMENT', 'PREVENTIVE', 'TECHNICIANS', 'FINANCIAL'])
  reportType: string

  @IsArray()
  @IsString({ each: true })
  allowedRoles: string[]
}

// ─────────────────────────────────────────────────────────────────────────────

const RATE = { limit: 10, ttl: 60, message: 'Limite de exportações atingido. Aguarde {{ttl}} segundos.' }

@ApiTags('Reports')
@ApiBearerAuth('JWT')
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly permissionsService: ReportPermissionsService,
  ) { }

  // ─────────────────────────────────────────
  // OS
  // ─────────────────────────────────────────

  @Get('service-orders/excel')
  @ApiOperation({ summary: 'Exportar OS em Excel' })
  @RateLimit(RATE)
  async exportOsExcel(
    @Query() filters: OsFiltersDto,
    @CurrentUser() cu: AuthenticatedUser,
    @Res() res: Response,
  ) {
    await this.permissionsService.checkAccess(cu, 'SERVICE_ORDERS')
    const buffer = await this.reportsService.exportServiceOrdersExcel(cu.companyId!, filters)
    this.sendFile(res, buffer, 'xlsx', `OS_${today()}`)
  }

  @Get('service-orders/pdf')
  @ApiOperation({ summary: 'Exportar OS em PDF' })
  @RateLimit(RATE)
  async exportOsPdf(
    @Query() filters: OsFiltersDto,
    @CurrentUser() cu: AuthenticatedUser,
    @Res() res: Response,
  ) {
    await this.permissionsService.checkAccess(cu, 'SERVICE_ORDERS')
    const buffer = await this.reportsService.exportServiceOrdersPdf(cu.companyId!, filters)
    this.sendFile(res, buffer, 'pdf', `OS_${today()}`)
  }

  // ─────────────────────────────────────────
  // Equipamentos
  // ─────────────────────────────────────────

  @Get('equipment/excel')
  @ApiOperation({ summary: 'Exportar inventário de equipamentos em Excel' })
  @RateLimit(RATE)
  async exportEquipmentExcel(
    @Query() filters: EquipmentFiltersDto,
    @CurrentUser() cu: AuthenticatedUser,
    @Res() res: Response,
  ) {
    await this.permissionsService.checkAccess(cu, 'EQUIPMENT')
    const buffer = await this.reportsService.exportEquipmentExcel(cu.companyId!, filters)
    this.sendFile(res, buffer, 'xlsx', `Equipamentos_${today()}`)
  }

  @Get('equipment/pdf')
  @ApiOperation({ summary: 'Exportar inventário de equipamentos em PDF' })
  @RateLimit(RATE)
  async exportEquipmentPdf(
    @Query() filters: EquipmentFiltersDto,
    @CurrentUser() cu: AuthenticatedUser,
    @Res() res: Response,
  ) {
    await this.permissionsService.checkAccess(cu, 'EQUIPMENT')
    const buffer = await this.reportsService.exportEquipmentPdf(cu.companyId!, filters)
    this.sendFile(res, buffer, 'pdf', `Equipamentos_${today()}`)
  }

  // ─────────────────────────────────────────
  // Preventivas
  // ─────────────────────────────────────────

  @Get('preventive/excel')
  @ApiOperation({ summary: 'Exportar preventivas em Excel' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @RateLimit(RATE)
  async exportPreventiveExcel(
    @Query() filters: PreventiveFiltersDto,
    @CurrentUser() cu: AuthenticatedUser,
    @Res() res: Response,
  ) {
    await this.permissionsService.checkAccess(cu, 'PREVENTIVE')
    const buffer = await this.reportsService.exportPreventiveExcel(cu.companyId!, filters)
    this.sendFile(res, buffer, 'xlsx', `Preventivas_${today()}`)
  }

  @Get('preventive/pdf')
  @ApiOperation({ summary: 'Exportar preventivas em PDF' })
  @RateLimit(RATE)
  async exportPreventivePdf(
    @Query() filters: PreventiveFiltersDto,
    @CurrentUser() cu: AuthenticatedUser,
    @Res() res: Response,
  ) {
    await this.permissionsService.checkAccess(cu, 'PREVENTIVE')
    const buffer = await this.reportsService.exportPreventivePdf(cu.companyId!, filters)
    this.sendFile(res, buffer, 'pdf', `Preventivas_${today()}`)
  }

  // ─────────────────────────────────────────
  // Permissões de relatório
  // ─────────────────────────────────────────

  @Get('permissions')
  @ApiOperation({
    summary: 'Listar permissões de relatório',
    description: 'Retorna quais roles têm acesso a cada tipo de relatório. ' +
      'Se não houver configuração, usa os padrões do sistema.',
  })
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  getPermissions(@CurrentUser() cu: AuthenticatedUser) {
    return this.permissionsService.findAll(cu.companyId!)
  }

  @Post('permissions')
  @ApiOperation({
    summary: 'Configurar permissão de relatório',
    description: 'Define quais roles podem acessar um tipo de relatório. ' +
      'Substitui a configuração anterior para aquele tipo.',
  })
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  @HttpCode(HttpStatus.OK)
  setPermission(
    @Body() dto: SetReportPermissionDto,
    @CurrentUser() cu: AuthenticatedUser,
  ) {
    return this.permissionsService.upsert(cu.companyId!, dto.reportType as ReportType, dto.allowedRoles)
  }

  @Patch('permissions/reset')
  @ApiOperation({ summary: 'Restaurar permissões padrão' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  @HttpCode(HttpStatus.OK)
  resetPermissions(@CurrentUser() cu: AuthenticatedUser) {
    return this.permissionsService.reset(cu.companyId!)
  }

  // ─────────────────────────────────────────
  // Helper
  // ─────────────────────────────────────────
  private sendFile(res: Response, buffer: Buffer, type: 'xlsx' | 'pdf', name: string) {
    const mimeTypes = {
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pdf: 'application/pdf',
    }
    res.set({
      'Content-Type': mimeTypes[type],
      'Content-Disposition': `attachment; filename="${name}.${type}"`,
      'Content-Length': buffer.length,
    })
    res.end(buffer)
  }
}

function today() {
  return new Date().toISOString().split('T')[0]
}