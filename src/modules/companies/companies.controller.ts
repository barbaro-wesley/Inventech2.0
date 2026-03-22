import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, ParseUUIDPipe,
  HttpCode, HttpStatus, UseInterceptors,
  UploadedFile, BadRequestException,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import { UserRole } from '@prisma/client'
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger'
import { CompaniesService } from './companies.service'
import { CreateCompanyDto } from './dto/create-company.dto'
import { UpdateCompanyDto } from './dto/update-company.dto'
import { ListCompaniesDto } from './dto/list-companies.dto'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import type  { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface'
import { StorageService } from '../storage/storage.service'
import { LicenseService, SuspendCompanyDto, SetLicenseDto, SetTrialDto } from './license.service'
import { UpdateReportSettingsDto } from './dto/update-report-settings.dto'
@ApiTags('Companies')
@ApiBearerAuth('JWT')
@Controller('companies')
export class CompaniesController {
  constructor(
    private readonly companiesService: CompaniesService,
    private readonly storageService: StorageService,
    private readonly licenseService: LicenseService,
  ) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN)
  findAll(@Query() filters: ListCompaniesDto) {
    return this.companiesService.findAll(filters)
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER)
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.companiesService.findOne(id, currentUser)
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  create(@Body() dto: CreateCompanyDto) {
    return this.companiesService.create(dto)
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompanyDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.companiesService.update(id, dto, currentUser)
  }

  // ─────────────────────────────────────────
  // POST /companies/:id/logo
  // Upload do logo da empresa
  // ─────────────────────────────────────────
  @Post(':id/logo')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  @ApiOperation({
    summary: 'Upload do logo da empresa',
    description: 'Faz upload do logo e salva a URL no cadastro da empresa. ' +
      'O logo é usado automaticamente nos relatórios gerados. Aceita PNG, JPG, SVG (máx 2MB).',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('logo', {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
      fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
        if (allowed.includes(file.mimetype)) cb(null, true)
        else cb(new BadRequestException('Logo deve ser PNG, JPG, WEBP ou SVG'), false)
      },
    }),
  )
  async uploadLogo(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado. Use o campo "logo".')

    // Faz upload para o bucket de avatars/logos no MinIO
    const logoUrl = await this.companiesService.uploadLogo(id, file, currentUser)
    return { logoUrl, message: 'Logo atualizado com sucesso' }
  }

  // ─────────────────────────────────────────
  // PATCH /companies/:id/report-settings
  // Configura cores e textos dos relatórios
  // ─────────────────────────────────────────
  @Patch(':id/report-settings')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  @ApiOperation({
    summary: 'Configurar visual dos relatórios',
    description: 'Define cores, cabeçalho e rodapé que aparecem nos PDFs e Excels gerados.',
  })
  updateReportSettings(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReportSettingsDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.companiesService.updateReportSettings(id, dto, currentUser)
  }

  // ─────────────────────────────────────────
  // GET /companies/:id/license
  // ─────────────────────────────────────────
  @Get(':id/license')
  @ApiOperation({ summary: 'Status da licença', description: 'Retorna status detalhado da licença, dias até vencimento e alertas.' })
  @Roles(UserRole.SUPER_ADMIN)
  getLicenseStatus(@Param('id', ParseUUIDPipe) id: string) {
    return this.licenseService.getLicenseStatus(id)
  }

  // GET /companies/licenses — painel geral de licenças
  @Get('licenses/all')
  @ApiOperation({ summary: 'Painel de licenças', description: 'Lista todas as empresas com status de licença. Filtros: status, expiringInDays.' })
  @Roles(UserRole.SUPER_ADMIN)
  listLicenses(
    @Query('status') status?: string,
    @Query('expiringInDays') expiringInDays?: string,
  ) {
    return this.licenseService.listLicenses({
      status,
      expiringInDays: expiringInDays ? parseInt(expiringInDays) : undefined,
    })
  }

  // PATCH /companies/:id/suspend
  @Patch(':id/suspend')
  @ApiOperation({
    summary: 'Suspender empresa',
    description: 'Bloqueia o acesso de todos os usuários da empresa imediatamente. Requer motivo.',
  })
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  suspend(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SuspendCompanyDto,
    @CurrentUser() cu: AuthenticatedUser,
  ) {
    return this.licenseService.suspend(id, dto.reason, cu.sub)
  }

  // PATCH /companies/:id/activate
  @Patch(':id/activate')
  @ApiOperation({
    summary: 'Reativar empresa',
    description: 'Restaura o acesso da empresa. Limpa a suspensão e invalida o cache imediatamente.',
  })
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  activate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() cu: AuthenticatedUser,
  ) {
    return this.licenseService.activate(id, cu.sub)
  }

  // PATCH /companies/:id/license
  @Patch(':id/license')
  @ApiOperation({
    summary: 'Definir/renovar licença',
    description: 'Define a data de vencimento do contrato. Se a empresa estava suspensa por vencimento, reativa automaticamente.',
  })
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  setLicense(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetLicenseDto,
    @CurrentUser() cu: AuthenticatedUser,
  ) {
    return this.licenseService.setLicense(id, dto, cu.sub)
  }

  // PATCH /companies/:id/trial
  @Patch(':id/trial')
  @ApiOperation({ summary: 'Configurar período de teste' })
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  setTrial(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetTrialDto,
    @CurrentUser() cu: AuthenticatedUser,
  ) {
    return this.licenseService.setTrial(id, dto, cu.sub)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SUPER_ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.companiesService.remove(id)
  }
}
