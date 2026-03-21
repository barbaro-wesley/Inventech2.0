import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  Body,
  ParseUUIDPipe,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { UserRole, AttachmentEntity } from '@prisma/client'
import { StorageService } from './storage.service'
import { UploadFileDto, GetPresignedUrlDto } from './dto/storage.dto'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface'
import { ALLOWED_MIME_LIST } from './storage.constants'
import { RateLimit } from '../../common/decorators/rate-limit.decorator'

@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) { }

  // ─────────────────────────────────────────
  // POST /storage/upload
  // Upload de qualquer arquivo
  // ─────────────────────────────────────────
  @Post('upload')
  @RateLimit({ limit: 30, ttl: 60, message: 'Limite de uploads atingido. Aguarde {{ttl}} segundos.' })
  @Roles(
    UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER,
    UserRole.TECHNICIAN, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER,
  )
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB — validação fina acontece no service
      },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME_LIST.includes(file.mimetype)) {
          cb(null, true)
        } else {
          cb(new BadRequestException(`Tipo de arquivo não permitido: ${file.mimetype}`), false)
        }
      },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadFileDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado. Use o campo "file" no form-data.')
    }

    return this.storageService.upload(
      file,
      dto,
      currentUser.companyId!,
      currentUser.clientId,
      currentUser,
    )
  }

  // ─────────────────────────────────────────
  // POST /storage/avatar
  // Upload de avatar do usuário logado
  // ─────────────────────────────────────────
  @Post('avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
      fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
          cb(null, true)
        } else {
          cb(new BadRequestException('Avatar deve ser uma imagem'), false)
        }
      },
    }),
  )
  async uploadAvatar(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado.')
    }
    return this.storageService.uploadAvatar(file, currentUser.sub)
  }

  // ─────────────────────────────────────────
  // GET /storage/:id/url
  // Gera presigned URL para acesso direto ao arquivo
  // O frontend usa esta URL para exibir/baixar sem passar pelo backend
  // ─────────────────────────────────────────
  @Get(':id/url')
  @Roles(
    UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER,
    UserRole.TECHNICIAN, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER, UserRole.CLIENT_VIEWER,
  )
  getPresignedUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.storageService.getPresignedUrl(id, currentUser.companyId!)
  }

  // ─────────────────────────────────────────
  // GET /storage/entity/:entity/:entityId
  // Lista todos os arquivos de uma entidade específica
  // Ex: GET /storage/entity/SERVICE_ORDER/uuid-da-os
  // ─────────────────────────────────────────
  @Get('entity/:entity/:entityId')
  @Roles(
    UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER,
    UserRole.TECHNICIAN, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER, UserRole.CLIENT_VIEWER,
  )
  listByEntity(
    @Param('entity') entity: string,
    @Param('entityId', ParseUUIDPipe) entityId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    // Valida o enum
    if (!Object.values(AttachmentEntity).includes(entity as AttachmentEntity)) {
      throw new BadRequestException(
        `Entidade inválida. Valores aceitos: ${Object.values(AttachmentEntity).join(', ')}`,
      )
    }

    return this.storageService.listByEntity(
      entity as AttachmentEntity,
      entityId,
      currentUser.companyId!,
    )
  }

  // ─────────────────────────────────────────
  // DELETE /storage/:id
  // Remove o arquivo do MinIO e do banco
  // ─────────────────────────────────────────
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Roles(
    UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER,
    UserRole.TECHNICIAN, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER,
  )
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.storageService.delete(id, currentUser.companyId!, currentUser)
  }
}