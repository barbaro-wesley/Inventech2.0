import { NestFactory } from '@nestjs/core'
import { ValidationPipe, Logger } from '@nestjs/common'
import cookieParser from 'cookie-parser'
import { AppModule } from './app.module'

async function bootstrap() {
  const logger = new Logger('Bootstrap')
  const app = await NestFactory.create(AppModule)

  // ── Cookie parser — necessário para ler os HTTP-Only cookies
  app.use(cookieParser())

  // ── Prefixo global da API
  app.setGlobalPrefix('api/v1')

  // ── CORS — ajuste origins conforme seu frontend
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3001',
    credentials: true, // Necessário para enviar cookies cross-origin
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })

  // ── Validação global com class-validator
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,        // Remove campos não declarados no DTO
      forbidNonWhitelisted: true, // Lança erro se vier campo extra
      transform: true,        // Transforma payload para o tipo do DTO
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  )

  // ── Shutdown hooks — garante desconexão limpa do Prisma
  app.enableShutdownHooks()

  const port = process.env.APP_PORT ?? 3000
  await app.listen(port)

  logger.log(`🚀 API rodando em: http://localhost:${port}/api/v1`)
  logger.log(`📦 Ambiente: ${process.env.NODE_ENV ?? 'development'}`)
}

bootstrap()