import { registerAs } from '@nestjs/config'

export default registerAs('redis', () => ({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB ?? '0', 10),
  url: process.env.REDIS_URL,

  // Prefixo para separar as chaves deste sistema de outros
  keyPrefix: 'manutencao:',

  // TTLs em segundos
  ttl: {
    session: 60 * 60 * 24 * 7,    // 7 dias — refresh token
    cache: 60 * 60,                 // 1 hora — cache geral
    rateLimit: 60,                  // 1 minuto — rate limiting
  },
}))