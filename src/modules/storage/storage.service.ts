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

// Buckets com leitura pública (avatars e logos)
const PUBLIC_BUCKETS = ['avatars']

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name)
  private client: Minio.Client
  private readonly buckets: string[]

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) { }

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
    this.validateMimeType(file.mimetype)
    this.validateFileSize(file.mimetype, file.size)
    await this.validateEntityOwnership(dto.entity, dto.entityId, companyId, clientId)

    const bucket = ENTITY_BUCKET_MAP[dto.entity]
    const key = this.buildKey(dto.entity, dto.entityId, file.originalname, companyId, clientId)

    await this.client.putObject(bucket, key, file.buffer, file.size, {
      'Content-Type': file.mimetype,
      'x-amz-meta-original-name': encodeURIComponent(file.originalname),
      'x-amz-meta-uploaded-by': currentUser.sub,
      'x-amz-meta-entity': dto.entity,
      'x-amz-meta-entity-id': dto.entityId,
    })

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
      `Upload: ${file.originalname} (${this.formatSize(file.size)}) → ${bucket}/${key}`,
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

    const url = await this.client.presignedGetObject(
      attachment.bucket,
      attachment.key,
      expiresIn,
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

    const canDelete =
      attachment.uploadedById === currentUser.sub ||
      ['SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MANAGER'].includes(currentUser.role)

    if (!canDelete) {
      throw new ForbiddenException('Você não tem permissão para deletar este arquivo')
    }

    await this.client.removeObject(attachment.bucket, attachment.key)
    await this.prisma.attachment.delete({ where: { id: attachmentId } })

    this.logger.log(`Arquivo deletado: ${attachment.fileName} (${attachment.key})`)

    return { message: 'Arquivo removido com sucesso' }
  }

  // ─────────────────────────────────────────
  // Upload de avatar de usuário
  // Usa URL pública — avatar não precisa de expiração
  // ─────────────────────────────────────────
  async uploadAvatar(file: UploadedFile, userId: string) {
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Avatar deve ser uma imagem (JPG, PNG ou WebP)')
    }

    this.validateFileSize(file.mimetype, file.size)

    const bucket = 'avatars'
    const ext = ALLOWED_MIME_TYPES[file.mimetype as keyof typeof ALLOWED_MIME_TYPES]?.ext ?? '.jpg'
    const key = `${userId}/avatar${ext}`

    try {
      await this.client.removeObject(bucket, key)
    } catch {
      // Ignora se não existia
    }

    await this.client.putObject(bucket, key, file.buffer, file.size, {
      'Content-Type': file.mimetype,
    })

    // ✅ URL pública direta — bucket avatars é público
    const url = this.buildPublicUrl(bucket, key)

    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: url },
    })

    return { avatarUrl: url }
  }

  // ─────────────────────────────────────────
  // Monta URL pública para buckets públicos
  // ─────────────────────────────────────────
  buildPublicUrl(bucket: string, key: string): string {
    const endpoint = this.configService.get<string>('minio.endpoint', 'localhost')
    const port = this.configService.get<number>('minio.port', 9000)
    const useSSL = this.configService.get<boolean>('minio.useSSL', false)
    const protocol = useSSL ? 'https' : 'http'
    return `${protocol}://${endpoint}:${port}/${bucket}/${key}`
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
      AVATAR: async () => ({ id: entityId }),
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

  // ─────────────────────────────────────────
  // Garante que todos os buckets existem
  // e aplica política pública nos buckets de avatar/logo
  // ─────────────────────────────────────────
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

      // ✅ Aplica política pública de leitura nos buckets públicos
      if (PUBLIC_BUCKETS.includes(bucket)) {
        await this.setBucketPublicReadPolicy(bucket)
      }
    }
  }

  // Política S3 que permite leitura pública de qualquer objeto no bucket
  private async setBucketPublicReadPolicy(bucket: string) {
    const policy = JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { AWS: ['*'] },
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${bucket}/*`],
        },
      ],
    })

    await this.client.setBucketPolicy(bucket, policy)
    this.logger.log(`Política pública aplicada no bucket: ${bucket}`)
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
}