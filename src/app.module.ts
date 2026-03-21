import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { APP_GUARD, APP_FILTER } from '@nestjs/core'
import { BullModule } from '@nestjs/bull'
import { ScheduleModule } from '@nestjs/schedule'

import {
  appConfig, databaseConfig, redisConfig,
  minioConfig, mailConfig, telegramConfig,
} from './config'

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
import { NotificationsModule } from './modules/notifications/notifications.module'

import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard'
import { RolesGuard } from './common/guards/roles.guard'
import { RateLimitGuard } from './common/guards/rate-limit.guard'
import { GlobalExceptionFilter } from './common/filters/http-exception.filter'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [appConfig, databaseConfig, redisConfig, minioConfig, mailConfig, telegramConfig],
    }),

    ScheduleModule.forRoot(),

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
    NotificationsModule,
  ],
  providers: [
    // Ordem importa: JWT → RateLimit → Roles
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule { }