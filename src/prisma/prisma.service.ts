import 'dotenv/config'
import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

// ─────────────────────────────────────────────────────────────────────────────
// Modelos com soft delete
// ─────────────────────────────────────────────────────────────────────────────

const SOFT_DELETE_MODELS = [
  'Company', 'Client', 'User', 'Equipment', 'ServiceOrder',
] as const

type SoftDeleteModel = (typeof SOFT_DELETE_MODELS)[number]

// ─────────────────────────────────────────────────────────────────────────────
// Factory do client estendido
// ─────────────────────────────────────────────────────────────────────────────

function buildClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  })

  // Log em development vai para stdout do Prisma (sem $on)
  const isDev = process.env.NODE_ENV === 'development'

  return new PrismaClient({
    adapter,
    log: isDev
      ? [
        { emit: 'stdout', level: 'query' },
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ]
      : [
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
  }).$extends({
    query: {
      $allModels: {
        async findMany({ model, args, query }) {
          if (SOFT_DELETE_MODELS.includes(model as SoftDeleteModel)) {
            args.where = { ...args.where, deletedAt: null }
          }
          return query(args)
        },

        async findFirst({ model, args, query }) {
          if (SOFT_DELETE_MODELS.includes(model as SoftDeleteModel)) {
            args.where = { ...args.where, deletedAt: null }
          }
          return query(args)
        },

        async findFirstOrThrow({ model, args, query }) {
          if (SOFT_DELETE_MODELS.includes(model as SoftDeleteModel)) {
            args.where = { ...args.where, deletedAt: null }
          }
          return query(args)
        },

        async findUnique({ model, args, query }) {
          if (SOFT_DELETE_MODELS.includes(model as SoftDeleteModel)) {
            ; (args.where as any) = { ...args.where, deletedAt: null }
          }
          return query(args)
        },

        async findUniqueOrThrow({ model, args, query }) {
          if (SOFT_DELETE_MODELS.includes(model as SoftDeleteModel)) {
            ; (args.where as any) = { ...args.where, deletedAt: null }
          }
          return query(args)
        },

        async count({ model, args, query }) {
          if (SOFT_DELETE_MODELS.includes(model as SoftDeleteModel)) {
            args.where = { ...args.where, deletedAt: null }
          }
          return query(args)
        },

        async aggregate({ model, args, query }) {
          if (SOFT_DELETE_MODELS.includes(model as SoftDeleteModel)) {
            ; (args as any).where = { ...(args as any).where, deletedAt: null }
          }
          return query(args)
        },
      },
    },
  })
}

type PrismaExtended = ReturnType<typeof buildClient>

// ─────────────────────────────────────────────────────────────────────────────
// PrismaService
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name)
  private readonly _db: PrismaExtended

  constructor() {
    this._db = buildClient()
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async onModuleInit() {
    await this._db.$connect()
    this.logger.log('Banco de dados conectado')
  }

  async onModuleDestroy() {
    await this._db.$disconnect()
    this.logger.log('Banco de dados desconectado')
  }

  // ─── Utilitários ───────────────────────────────────────────────────────────

  get $transaction() {
    return this._db.$transaction.bind(this._db)
  }

  get $queryRaw() {
    return this._db.$queryRaw.bind(this._db)
  }

  get $executeRaw() {
    return this._db.$executeRaw.bind(this._db)
  }

  get $queryRawUnsafe() {
    return this._db.$queryRawUnsafe.bind(this._db)
  }

  get $executeRawUnsafe() {
    return this._db.$executeRawUnsafe.bind(this._db)
  }

  // ─── Platform & Company ────────────────────────────────────────────────────

  get platform() { return this._db.platform }
  get company() { return this._db.company }

  // ─── Client ────────────────────────────────────────────────────────────────

  get client() { return this._db.client }

  // ─── User & Auth ───────────────────────────────────────────────────────────

  get user() { return this._db.user }
  get refreshToken() { return this._db.refreshToken }
  get loginAttempt() { return this._db.loginAttempt }
  get accountBlock() { return this._db.accountBlock }
  get twoFactorCode() { return this._db.twoFactorCode }
  get emailVerification() { return this._db.emailVerification }
  get passwordReset() { return this._db.passwordReset }

  // ─── Grupos & Técnicos ─────────────────────────────────────────────────────

  get maintenanceGroup() { return this._db.maintenanceGroup }
  get technicianGroup() { return this._db.technicianGroup }

  // ─── Localização & Centro de Custo ─────────────────────────────────────────

  get costCenter() { return this._db.costCenter }
  get location() { return this._db.location }

  // ─── Equipamento ───────────────────────────────────────────────────────────

  get equipmentType() { return this._db.equipmentType }
  get equipmentSubtype() { return this._db.equipmentSubtype }
  get equipment() { return this._db.equipment }
  get equipmentMovement() { return this._db.equipmentMovement }

  // ─── Manutenção ────────────────────────────────────────────────────────────

  get maintenanceSchedule() { return this._db.maintenanceSchedule }
  get maintenance() { return this._db.maintenance }

  // ─── Ordem de Serviço ──────────────────────────────────────────────────────

  get serviceOrder() { return this._db.serviceOrder }
  get serviceOrderTechnician() { return this._db.serviceOrderTechnician }
  get serviceOrderStatusHistory() { return this._db.serviceOrderStatusHistory }
  get serviceOrderComment() { return this._db.serviceOrderComment }
  get serviceOrderTask() { return this._db.serviceOrderTask }

  // ─── Anexos & Notificações ─────────────────────────────────────────────────

  get attachment() { return this._db.attachment }
  get notification() { return this._db.notification }
}