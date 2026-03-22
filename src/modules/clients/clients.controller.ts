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
import { ClientsService } from './clients.service'
import { CreateClientDto } from './dto/create-client.dto'
import { UpdateClientDto } from './dto/update-client.dto'
import { ListClientsDto } from './dto/list-clients.dto'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface'

@ApiTags('Clients')
@ApiBearerAuth('JWT')
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) { }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER, UserRole.TECHNICIAN)
  findAll(@Query() filters: ListClientsDto, @CurrentUser() cu: AuthenticatedUser) {
    return this.clientsService.findAll(cu, filters)
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER,
    UserRole.TECHNICIAN, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER, UserRole.CLIENT_VIEWER)
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() cu: AuthenticatedUser) {
    return this.clientsService.findOne(id, cu)
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER)
  create(@Body() dto: CreateClientDto, @CurrentUser() cu: AuthenticatedUser) {
    return this.clientsService.create(dto, cu)
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientDto,
    @CurrentUser() cu: AuthenticatedUser,
  ) {
    return this.clientsService.update(id, dto, cu)
  }

  // ─────────────────────────────────────────
  // POST /clients/:id/logo
  // Upload do logo do cliente
  // ─────────────────────────────────────────
  @Post(':id/logo')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER)
  @ApiOperation({
    summary: 'Upload do logo do cliente',
    description: 'Salva o logo do cliente para uso nos relatórios. Aceita PNG, JPG, SVG (máx 2MB).',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('logo', {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024 },
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
    @CurrentUser() cu: AuthenticatedUser,
  ) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado. Use o campo "logo".')
    const logoUrl = await this.clientsService.uploadLogo(id, file, cu)
    return { logoUrl, message: 'Logo do cliente atualizado com sucesso' }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() cu: AuthenticatedUser) {
    return this.clientsService.remove(id, cu)
  }
}