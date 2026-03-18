import {
  Injectable,
  OnModuleInit,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as Minio from 'minio'
import { v4 as uuidv4 } from 'uuid'
import { AttachmentEntity } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface'
import { UploadFileDto } from './dto/storage.dto'
import {
  ALLOWED_MIME_TYPES,
  ALLOWED_MIME_LIST,
  MAX_FILE_SIZE,
  ENTITY_BUCKET_MAP,
  PRESIGNED_URL_TTL,
} from './storage.constants'

export interface UploadedFile {
  fieldname: string
  originalname: string
  encoding: string
  mimetype: string
  buffer: Buffer
  size: number
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name)
  private client: Minio.Client
  private readonly buckets: string[]

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {}

  async onModuleInit() {
    this.client = new Minio.Client({
      endPoint: this.configService.get<string>('minio.endpoint', 'localhost'),
      port: this.configService.get<number>('minio.port', 9000),
      useSSL: this.configService.get<boolean>('minio.useSSL', false),
      accessKey: this.configService.get<string>('minio.accessKey', ''),
      secretKey: this.configService.get<string>('minio.secretKey', ''),
    })

    await this.ensureBucketsExist()
    this.logger.log('MinIO conectado e buckets verificados')
  }

  // ─────────────────────────────────────────
  // Upload de arquivo
  // ─────────────────────────────────────────
  async upload(
    file: UploadedFile,
    dto: UploadFileDto,
    companyId: string,
    clientId: string | null,
    currentUser: AuthenticatedUser,
  ) {
    // 1. Valida tipo MIME
    this.validateMimeType(file.mimetype)

    // 2. Valida tamanho
    this.validateFileSize(file.mimetype, file.size)

    // 3. Valida que a entidade existe e pertence ao tenant
    await this.validateEntityOwnership(dto.entity, dto.entityId, companyId, clientId)

    // 4. Determina o bucket
    const bucket = ENTITY_BUCKET_MAP[dto.entity]

    // 5. Gera key hierárquica no MinIO
    const key = this.buildKey(dto.entity, dto.entityId, file.originalname, companyId, clientId)

    // 6. Faz upload para o MinIO
    const mimeInfo = ALLOWED_MIME_TYPES[file.mimetype as keyof typeof ALLOWED_MIME_TYPES]

    await this.client.putObject(bucket, key, file.buffer, file.size, {
      'Content-Type': file.mimetype,
      'x-amz-meta-original-name': encodeURIComponent(file.originalname),
      'x-amz-meta-uploaded-by': currentUser.sub,
      'x-amz-meta-entity': dto.entity,
      'x-amz-meta-entity-id': dto.entityId,
    })

    // 7. Salva o registro no banco
    const attachment = await this.prisma.attachment.create({
      data: {
        companyId,
        clientId,
        entity: dto.entity,
        fileName: file.originalname,
        storedName: key.split('/').pop()!,
        bucket,
        key,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        uploadedById: currentUser.sub,
        // FK específica por entidade
        ...(dto.entity === AttachmentEntity.SERVICE_ORDER && { serviceOrderId: dto.entityId }),
        ...(dto.entity === AttachmentEntity.MAINTENANCE && { maintenanceId: dto.entityId }),
        ...(dto.entity === AttachmentEntity.EQUIPMENT && { equipmentId: dto.entityId }),
        ...(dto.entity === AttachmentEntity.INVOICE && { equipmentId: dto.entityId }),
        ...(dto.entity === AttachmentEntity.COMMENT && { commentId: dto.entityId }),
      },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        entity: true,
        key: true,
        bucket: true,
        createdAt: true,
      },
    })

    this.logger.log(
      `Upload: ${file.originalname} (${this.formatSize(file.size)}) ` +
      `→ ${bucket}/${key}`,
    )

    return attachment
  }

  // ─────────────────────────────────────────
  // Gera presigned URL para acesso direto
  // ─────────────────────────────────────────
  async getPresignedUrl(
    attachmentId: string,
    companyId: string,
    expiresIn: number = PRESIGNED_URL_TTL,
  ) {
    const attachment = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, companyId },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        bucket: true,
        key: true,
        entity: true,
        createdAt: true,
      },
    })

    if (!attachment) {
      throw new NotFoundException('Arquivo não encontrado')
    }

    // Gera URL pré-assinada — o frontend acessa o MinIO diretamente
    const url = await this.client.presignedGetObject(
      attachment.bucket,
      attachment.key,
      expiresIn,
      // Headers para forçar download com o nome original
      {
        'response-content-disposition': `inline; filename="${encodeURIComponent(attachment.fileName)}"`,
        'response-content-type': attachment.mimeType,
      },
    )

    return {
      url,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      sizeFormatted: this.formatSize(attachment.sizeBytes),
      expiresIn,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    }
  }

  // ─────────────────────────────────────────
  // Listar arquivos de uma entidade
  // ─────────────────────────────────────────
  async listByEntity(
    entity: AttachmentEntity,
    entityId: string,
    companyId: string,
  ) {
    const attachments = await this.prisma.attachment.findMany({
      where: { entity, companyId, ...this.buildEntityFilter(entity, entityId) },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        entity: true,
        createdAt: true,
        uploadedById: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    return attachments.map((a) => ({
      ...a,
      sizeFormatted: this.formatSize(a.sizeBytes),
      category: this.getCategory(a.mimeType),
    }))
  }

  // ─────────────────────────────────────────
  // Deletar arquivo
  // ─────────────────────────────────────────
  async delete(attachmentId: string, companyId: string, currentUser: AuthenticatedUser) {
    const attachment = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, companyId },
      select: {
        id: true,
        bucket: true,
        key: true,
        fileName: true,
        uploadedById: true,
      },
    })

    if (!attachment) {
      throw new NotFoundException('Arquivo não encontrado')
    }

    // Só quem fez o upload ou admin pode deletar
    const canDelete =
      attachment.uploadedById === currentUser.sub ||
      ['SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MANAGER'].includes(currentUser.role)

    if (!canDelete) {
      throw new ForbiddenException('Você não tem permissão para deletar este arquivo')
    }

    // Remove do MinIO
    await this.client.removeObject(attachment.bucket, attachment.key)

    // Remove do banco
    await this.prisma.attachment.delete({ where: { id: attachmentId } })

    this.logger.log(`Arquivo deletado: ${attachment.fileName} (${attachment.key})`)

    return { message: 'Arquivo removido com sucesso' }
  }

  // ─────────────────────────────────────────
  // Upload de avatar de usuário
  // ─────────────────────────────────────────
  async uploadAvatar(file: UploadedFile, userId: string) {
    // Avatar só aceita imagens
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Avatar deve ser uma imagem (JPG, PNG ou WebP)')
    }

    this.validateFileSize(file.mimetype, file.size)

    const bucket = 'avatars'
    const ext = ALLOWED_MIME_TYPES[file.mimetype as keyof typeof ALLOWED_MIME_TYPES]?.ext ?? '.jpg'
    const key = `${userId}/avatar${ext}`

    // Remove avatar anterior se existir
    try {
      await this.client.removeObject(bucket, key)
    } catch {
      // Ignora se não existia
    }

    await this.client.putObject(bucket, key, file.buffer, file.size, {
      'Content-Type': file.mimetype,
    })

    // Gera URL pública para o avatar
    const url = await this.client.presignedGetObject(bucket, key, PRESIGNED_URL_TTL)

    // Atualiza o avatarUrl no usuário
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: url },
    })

    return { avatarUrl: url }
  }

  // ─────────────────────────────────────────
  // Helpers privados
  // ─────────────────────────────────────────

  private validateMimeType(mimeType: string) {
    if (!ALLOWED_MIME_LIST.includes(mimeType)) {
      throw new BadRequestException(
        `Tipo de arquivo não permitido: ${mimeType}. ` +
        `Tipos aceitos: PDF, DOC, DOCX, XLS, XLSX, CSV, PPT, PPTX, JPG, PNG, WEBP, GIF, TXT, ZIP, RAR`,
      )
    }
  }

  private validateFileSize(mimeType: string, size: number) {
    const category = this.getCategory(mimeType)
    const maxSize = MAX_FILE_SIZE[category as keyof typeof MAX_FILE_SIZE] ?? MAX_FILE_SIZE.default

    if (size > maxSize) {
      throw new BadRequestException(
        `Arquivo muito grande. Máximo permitido: ${this.formatSize(maxSize)}`,
      )
    }
  }

  private getCategory(mimeType: string): string {
    return ALLOWED_MIME_TYPES[mimeType as keyof typeof ALLOWED_MIME_TYPES]?.category ?? 'default'
  }

  // Chave hierárquica no MinIO
  // Ex: uuid-company/uuid-client/uuid-entity/uuid-filename.pdf
  private buildKey(
    entity: AttachmentEntity,
    entityId: string,
    originalName: string,
    companyId: string,
    clientId: string | null,
  ): string {
    const mimeType = this.getMimeFromName(originalName)
    const ext = ALLOWED_MIME_TYPES[mimeType as keyof typeof ALLOWED_MIME_TYPES]?.ext
      ?? originalName.substring(originalName.lastIndexOf('.'))

    const uniqueName = `${uuidv4()}${ext}`

    if (entity === AttachmentEntity.AVATAR) {
      return uniqueName
    }

    const parts = [companyId]
    if (clientId) parts.push(clientId)
    parts.push(entityId)
    parts.push(uniqueName)

    return parts.join('/')
  }

  private getMimeFromName(fileName: string): string {
    const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase()
    const entry = Object.entries(ALLOWED_MIME_TYPES).find(([, v]) => v.ext === ext)
    return entry ? entry[0] : 'application/octet-stream'
  }

  private buildEntityFilter(entity: AttachmentEntity, entityId: string) {
    switch (entity) {
      case AttachmentEntity.SERVICE_ORDER: return { serviceOrderId: entityId }
      case AttachmentEntity.MAINTENANCE: return { maintenanceId: entityId }
      case AttachmentEntity.EQUIPMENT: return { equipmentId: entityId }
      case AttachmentEntity.INVOICE: return { equipmentId: entityId }
      case AttachmentEntity.COMMENT: return { commentId: entityId }
      default: return {}
    }
  }

  // Valida que a entidade existe e pertence ao tenant correto
  private async validateEntityOwnership(
    entity: AttachmentEntity,
    entityId: string,
    companyId: string,
    clientId: string | null,
  ) {
    const tenantFilter = { companyId, ...(clientId && { clientId }) }

    const checks: Record<string, () => Promise<any>> = {
      SERVICE_ORDER: () => this.prisma.serviceOrder.findFirst({
        where: { id: entityId, ...tenantFilter, deletedAt: null },
        select: { id: true },
      }),
      MAINTENANCE: () => this.prisma.maintenance.findFirst({
        where: { id: entityId, ...tenantFilter },
        select: { id: true },
      }),
      EQUIPMENT: () => this.prisma.equipment.findFirst({
        where: { id: entityId, ...tenantFilter, deletedAt: null },
        select: { id: true },
      }),
      INVOICE: () => this.prisma.equipment.findFirst({
        where: { id: entityId, ...tenantFilter, deletedAt: null },
        select: { id: true },
      }),
      COMMENT: () => this.prisma.serviceOrderComment.findFirst({
        where: { id: entityId },
        select: { id: true },
      }),
      AVATAR: async () => ({ id: entityId }), // Avatar não precisa de validação de entidade
    }

    const check = checks[entity]
    if (!check) throw new BadRequestException(`Entidade inválida: ${entity}`)

    const found = await check()
    if (!found) {
      throw new NotFoundException(
        `${entity.toLowerCase().replace('_', ' ')} não encontrado ou sem permissão`,
      )
    }
  }

  // Garante que todos os buckets existem no MinIO
  private async ensureBucketsExist() {
    const buckets = [
      'equipment-attachments',
      'service-order-attachments',
      'invoices',
      'avatars',
      'reports',
    ]

    for (const bucket of buckets) {
      const exists = await this.client.bucketExists(bucket)
      if (!exists) {
        await this.client.makeBucket(bucket, 'us-east-1')
        this.logger.log(`Bucket criado: ${bucket}`)
      }
    }
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
}