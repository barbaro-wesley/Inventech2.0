import { registerAs } from '@nestjs/config'

export default registerAs('minio', () => ({
  endpoint: process.env.MINIO_ENDPOINT ?? 'localhost',
  port: parseInt(process.env.MINIO_API_PORT ?? '9000', 10),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ROOT_USER,
  secretKey: process.env.MINIO_ROOT_PASSWORD,

  // Buckets
  buckets: {
    equipment: process.env.MINIO_BUCKET_EQUIPMENT ?? 'equipment-attachments',
    serviceOrders: process.env.MINIO_BUCKET_SERVICE_ORDERS ?? 'service-order-attachments',
    invoices: process.env.MINIO_BUCKET_INVOICES ?? 'invoices',
    avatars: process.env.MINIO_BUCKET_AVATARS ?? 'avatars',
    reports: process.env.MINIO_BUCKET_REPORTS ?? 'reports',
  },

  // TTL das URLs pré-assinadas em segundos (1 hora)
  presignedUrlExpiry: parseInt(process.env.MINIO_PRESIGNED_EXPIRY ?? '3600', 10),
}))