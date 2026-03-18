import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator'
import { AttachmentEntity } from '@prisma/client'

export class UploadFileDto {
  @IsEnum(AttachmentEntity)
  entity: AttachmentEntity  // A qual entidade pertence este arquivo

  @IsUUID()
  entityId: string  // ID da entidade dona (equipmentId, serviceOrderId etc.)

  @IsOptional()
  @IsString()
  description?: string  // Descrição opcional do arquivo
}

export class GetPresignedUrlDto {
  @IsOptional()
  @IsString()
  fileName?: string  // Nome para download (sobrescreve o original)
}