import { Module } from '@nestjs/common'
import { MaintenanceGroupsService } from './maintenance-groups.service'
import { MaintenanceGroupsController } from './maintenance-groups.controller'

@Module({
    controllers: [MaintenanceGroupsController],
    providers: [MaintenanceGroupsService],
    exports: [MaintenanceGroupsService],
})
export class MaintenanceGroupsModule { }