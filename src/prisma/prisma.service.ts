import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
const SOFT_DELETE_MODELS = ['Company', 'Client', 'User', 'Equipment', 'ServiceOrder']

function withSoftDelete(prisma: PrismaClient) {
  return prisma.$extends({
    query: {
      $allModels: {
        async findMany({ model, args, query }) {
          if (SOFT_DELETE_MODELS.includes(model)) {
            args.where = { ...args.where, deletedAt: null }
          }
          return query(args)
        },
        async findFirst({ model, args, query }) {
          if (SOFT_DELETE_MODELS.includes(model)) {
            args.where = { ...args.where, deletedAt: null }
          }
          return query(args)
        },
        async findUnique({ model, args, query }) {
          if (SOFT_DELETE_MODELS.includes(model)) {
            // findUnique não aceita deletedAt diretamente, delega pro findFirst via query
            args.where = { ...args.where, deletedAt: null } as any
          }
          return query(args)
        },
        async delete({ model, args, query }) {
          if (SOFT_DELETE_MODELS.includes(model)) {
            return (query as any)({ ...args, action: 'update', data: { deletedAt: new Date() } })
          }
          return query(args)
        },
      },
    },
  })
}
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name)

  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL as string,
    })

    super({ adapter })
  }

  async onModuleInit() {
    if (process.env.NODE_ENV === 'development') {
      // @ts-expect-error — evento do Prisma
      this.$on('query', (e: { query: string; duration: number }) => {
        this.logger.debug(`Query: ${e.query} | Duração: ${e.duration}ms`)
      })
    }

    // @ts-expect-error — evento do Prisma
    this.$on('error', (e: { message: string }) => {
      this.logger.error(`Prisma Error: ${e.message}`)
    })

    await this.$connect()
    this.logger.log('Banco de dados conectado')
  }

  async onModuleDestroy() {
    await this.$disconnect()
    this.logger.log('Banco de dados desconectado')
  }
}
