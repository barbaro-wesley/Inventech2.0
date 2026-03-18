import { AttachmentEntity } from '@prisma/client'

// ─────────────────────────────────────────
// Tipos MIME permitidos por categoria
// ─────────────────────────────────────────
export const ALLOWED_MIME_TYPES = {
  // Imagens
  'image/jpeg': { ext: '.jpg', category: 'image' },
  'image/png': { ext: '.png', category: 'image' },
  'image/webp': { ext: '.webp', category: 'image' },
  'image/gif': { ext: '.gif', category: 'image' },

  // Documentos
  'application/pdf': { ext: '.pdf', category: 'document' },
  'application/msword': { ext: '.doc', category: 'document' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: '.docx', category: 'document' },
  'text/plain': { ext: '.txt', category: 'document' },

  // Planilhas
  'application/vnd.ms-excel': { ext: '.xls', category: 'spreadsheet' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { ext: '.xlsx', category: 'spreadsheet' },
  'text/csv': { ext: '.csv', category: 'spreadsheet' },

  // Apresentações
  'application/vnd.ms-powerpoint': { ext: '.ppt', category: 'presentation' },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { ext: '.pptx', category: 'presentation' },

  // Compactados
  'application/zip': { ext: '.zip', category: 'archive' },
  'application/x-rar-compressed': { ext: '.rar', category: 'archive' },
} as const

// ─────────────────────────────────────────
// Limites de tamanho por categoria (bytes)
// ─────────────────────────────────────────
export const MAX_FILE_SIZE = {
  image: 5 * 1024 * 1024,        // 5MB
  document: 20 * 1024 * 1024,    // 20MB
  spreadsheet: 10 * 1024 * 1024, // 10MB
  presentation: 20 * 1024 * 1024, // 20MB
  archive: 50 * 1024 * 1024,     // 50MB
  default: 10 * 1024 * 1024,     // 10MB
} as const

// ─────────────────────────────────────────
// Mapeamento de entidade → bucket
// ─────────────────────────────────────────
export const ENTITY_BUCKET_MAP: Record<AttachmentEntity, string> = {
  EQUIPMENT: 'equipment-attachments',
  SERVICE_ORDER: 'service-order-attachments',
  MAINTENANCE: 'service-order-attachments', // Compartilha bucket com OS
  INVOICE: 'invoices',
  AVATAR: 'avatars',
  COMMENT: 'service-order-attachments',
}

// ─────────────────────────────────────────
// Tipos de arquivo aceitos como string[]
// para usar no FileInterceptor
// ─────────────────────────────────────────
export const ALLOWED_MIME_LIST = Object.keys(ALLOWED_MIME_TYPES)

// TTL da presigned URL em segundos
export const PRESIGNED_URL_TTL = 60 * 60 // 1 hora