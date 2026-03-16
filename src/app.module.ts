import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD, APP_FILTER } from '@nestjs/core'
import { PrismaModule } from './prisma/prisma.module'
import { AuthModule } from './modules/auth/auth.module'
import { UsersModule } from './modules/users/users.module'
import { EquipmentModule } from './modules/equipment/equipment.module'
import { ServiceOrdersModule } from './modules/service-orders/service-orders.module'
import { CompaniesModule } from './modules/companies/companies.module'
import { ClientsModule } from './modules/clients/clients.module'
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard'
import { RolesGuard } from './common/guards/roles.guard'
import { GlobalExceptionFilter } from './common/filters/http-exception.filter'
import { MaintenanceModule } from './modules/maintenance/maintenance.module'

@Module({
  imports: [
    // Carrega .env globalmente em todos os módulos
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    PrismaModule,
    AuthModule,
    UsersModule,
    CompaniesModule,
    ClientsModule,
    EquipmentModule,
    ServiceOrdersModule,
    MaintenanceModule,
    // NotificationsModule,
    // StorageModule,
  ],
  providers: [
    // Guard JWT aplicado globalmente — toda rota precisa de autenticação
    // exceto as marcadas com @Public()
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Guard de roles aplicado globalmente
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    // Filtro global de exceções
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule { }