import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { ClientsModule } from './modules/clients/clients.module';
import { EquipmentModule } from './modules/equipment/equipment.module';
import { LocationsModule } from './modules/locations/locations.module';
import { CostCentersModule } from './modules/cost-centers/cost-centers.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { ServiceOrdersModule } from './modules/service-orders/service-orders.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { StorageModule } from './modules/storage/storage.module';
import { WebsocketModule } from './modules/websocket/websocket.module';

@Module({
  imports: [AuthModule, UsersModule, CompaniesModule, ClientsModule, EquipmentModule, LocationsModule, CostCentersModule, MaintenanceModule, ServiceOrdersModule, NotificationsModule, StorageModule, WebsocketModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
