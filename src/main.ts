import { NestFactory, Reflector } from '@nestjs/core'
import { ValidationPipe, Logger, ClassSerializerInterceptor } from '@nestjs/common'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { IoAdapter } from '@nestjs/platform-socket.io'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import { AppModule } from './app.module'
import { ResponseInterceptor } from './common/interceptors/response.interceptor'

async function bootstrap() {
  const logger = new Logger('Bootstrap')

  const app = await NestFactory.create(AppModule, {
    logger: process.env.NODE_ENV === 'production'
      ? ['error', 'warn', 'log']
      : ['error', 'warn', 'log', 'debug', 'verbose'],
  })

  // ── Helmet ─────────────────────────────────────────────────────
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false, // Desabilitado para o Swagger UI funcionar
  }))

  // ── Cookie parser ───────────────────────────────────────────────
  app.use(cookieParser())

  // ── Prefixo global ──────────────────────────────────────────────
  app.setGlobalPrefix('api/v1')

  // ── CORS ────────────────────────────────────────────────────────
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? process.env.FRONTEND_URL ?? 'http://localhost:3001')
    .split(',').map((o) => o.trim())

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true)
      if (allowedOrigins.includes(origin)) return callback(null, true)
      callback(new Error(`CORS bloqueado para origin: ${origin}`))
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining'],
  })

  // ── WebSocket ───────────────────────────────────────────────────
  app.useWebSocketAdapter(new IoAdapter(app))

  // ── Validação global ────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  )

  // ── Interceptors globais ────────────────────────────────────────
  app.useGlobalInterceptors(
    new ResponseInterceptor(),
    new ClassSerializerInterceptor(app.get(Reflector)),
  )

  // ── Swagger / OpenAPI ───────────────────────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Sistema de Gestão de Manutenção')
      .setDescription(
        `API REST do SaaS de gestão de manutenção e equipamentos.\n\n` +
        `## Autenticação\n` +
        `A API usa **JWT via HTTP-Only Cookies**. Faça login em \`POST /auth/login\` ` +
        `e os cookies serão configurados automaticamente.\n\n` +
        `Para testar endpoints protegidos no Swagger, use o botão **Authorize** ` +
        `e informe o Bearer token retornado no login.\n\n` +
        `## Multi-tenant\n` +
        `Todos os dados são isolados por empresa (companyId) e cliente (clientId). ` +
        `O token JWT carrega essas informações automaticamente.`,
      )
      .setVersion('1.0')
      .setContact('Aria Engenharia', '', 'contato@ariaengenharia.com')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Informe o access_token retornado no POST /auth/login',
        },
        'JWT',
      )
      .addCookieAuth('access_token', {
        type: 'apiKey',
        in: 'cookie',
        description: 'Cookie HTTP-Only setado automaticamente no login',
      })
      .addTag('Auth', 'Login, logout, refresh, 2FA, reset de senha')
      .addTag('Users', 'Gestão de usuários e permissões')
      .addTag('Companies', 'Gestão de empresas (SUPER_ADMIN)')
      .addTag('Clients', 'Clientes finais da empresa')
      .addTag('Equipment', 'Equipamentos e ativos')
      .addTag('Locations', 'Localizações e setores')
      .addTag('Cost Centers', 'Centros de custo')
      .addTag('Equipment Types', 'Tipos e subtipos de equipamento')
      .addTag('Movements', 'Movimentação de equipamentos')
      .addTag('Maintenance Groups', 'Grupos de manutenção e vínculos com técnicos')
      .addTag('Service Orders', 'Ordens de serviço e painel')
      .addTag('Maintenance', 'Manutenções e agendamentos de preventiva')
      .addTag('Storage', 'Upload e download de arquivos (MinIO)')
      .addTag('Notifications', 'Notificações do usuário')
      .build()

    const document = SwaggerModule.createDocument(app, config)

    SwaggerModule.setup('api/docs', app, document, {
      customSiteTitle: 'API Manutenção — Docs',
      customfavIcon: '',
      swaggerOptions: {
        persistAuthorization: true,     // Mantém o token ao recarregar
        displayRequestDuration: true,   // Mostra tempo de resposta
        filter: true,                   // Filtro de busca nas rotas
        syntaxHighlight: { theme: 'monokai' },
        tryItOutEnabled: true,          // Habilita "Try it out" por padrão
        docExpansion: 'none',           // Começa com tudo fechado
        tagsSorter: 'alpha',
      },
    })

    logger.log(`📚 Swagger:     http://localhost:${process.env.APP_PORT ?? 3000}/api/docs`)
  }

  // ── Shutdown hooks ──────────────────────────────────────────────
  app.enableShutdownHooks()

  const port = parseInt(process.env.APP_PORT ?? '3000', 10)
  await app.listen(port, '0.0.0.0')

  logger.log(`🚀 API:        http://localhost:${port}/api/v1`)
  logger.log(`🌍 Ambiente:   ${process.env.NODE_ENV ?? 'development'}`)
  logger.log(`🔌 WebSocket:  ws://localhost:${port}/notifications`)
}

bootstrap()