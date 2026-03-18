import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { APP_GUARD, APP_FILTER } from '@nestjs/core'
import { BullModule } from '@nestjs/bull'
import { ScheduleModule } from '@nestjs/schedule'

// Configs
import {
  appConfig,
  databaseConfig,
  redisConfig,
  minioConfig,
  mailConfig,
  telegramConfig,
} from './config'

// Módulos
import { PrismaModule } from './prisma/prisma.module'
import { AuthModule } from './modules/auth/auth.module'
import { UsersModule } from './modules/users/users.module'
import { CompaniesModule } from './modules/companies/companies.module'
import { ClientsModule } from './modules/clients/clients.module'
import { EquipmentModule } from './modules/equipment/equipment.module'
import { MaintenanceGroupsModule } from './modules/maintenance-groups/maintenance-groups.module'
import { ServiceOrdersModule } from './modules/service-orders/service-orders.module'
import { MaintenanceModule } from './modules/maintenance/maintenance.module'
import { StorageModule } from './modules/storage/storage.module'
// Guards e Filtros globais
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard'
import { RolesGuard } from './common/guards/roles.guard'
import { GlobalExceptionFilter } from './common/filters/http-exception.filter'

@Module({
  imports: [
    // ── Configurações globais ────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [
        appConfig,
        databaseConfig,
        redisConfig,
        minioConfig,
        mailConfig,
        telegramConfig,
      ],
    }),

    // ── Cron jobs ────────────────────────────────────────────────
    ScheduleModule.forRoot(),

    // ── Bull/Redis — filas ───────────────────────────────────────
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get('redis.host'),
          port: configService.get<number>('redis.port'),
          password: configService.get('redis.password'),
          db: configService.get<number>('redis.db'),
        },
        prefix: 'manutencao',
      }),
      inject: [ConfigService],
    }),

    // ── Módulos de domínio ───────────────────────────────────────
    PrismaModule,
    AuthModule,
    UsersModule,
    CompaniesModule,
    ClientsModule,
    EquipmentModule,
    MaintenanceGroupsModule,
    ServiceOrdersModule,
    MaintenanceModule,
    StorageModule,
    // Próximos:
    // NotificationsModule,
    // StorageModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule {}