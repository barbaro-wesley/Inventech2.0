import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bull'
import { MaintenanceService, MAINTENANCE_QUEUE } from './maintenance.service'
import { MaintenanceController, ScheduleController } from './maintenance.controller'
import { MaintenanceProcessor } from './processors/maintenance.processor'
import { MaintenanceCronJobs } from './schedule/maintenance-cron.jobs'

@Module({
    imports: [
        // Registra a fila no Redis via Bull
        BullModule.registerQueue({
            name: MAINTENANCE_QUEUE,
            defaultJobOptions: {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 5000,
                },
                removeOnComplete: 100,
                removeOnFail: 50,
            },
        }),
    ],
    controllers: [
        MaintenanceController,
        ScheduleController,
    ],
    providers: [
        MaintenanceService,
        MaintenanceProcessor,  // Processa os jobs da fila
        MaintenanceCronJobs,   // Dispara os cron jobs
    ],
    exports: [MaintenanceService],
})
export class MaintenanceModule { }