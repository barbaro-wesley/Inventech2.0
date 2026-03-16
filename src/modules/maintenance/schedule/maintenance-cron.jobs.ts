import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { InjectQueue } from '@nestjs/bull'
import type { Queue } from 'bull'
import { MAINTENANCE_QUEUE, MAINTENANCE_JOBS } from '../maintenance.service'

@Injectable()
export class MaintenanceCronJobs {
    private readonly logger = new Logger(MaintenanceCronJobs.name)

    constructor(
        @InjectQueue(MAINTENANCE_QUEUE) private maintenanceQueue: Queue,
    ) { }

    // ─────────────────────────────────────────
    // Roda a cada hora — verifica schedules vencidos
    // e enfileira geração de OS preventivas
    // ─────────────────────────────────────────
    @Cron(CronExpression.EVERY_HOUR)
    async schedulePreventiveGeneration() {
        this.logger.log('Cron: verificando schedules vencidos...')

        // Verifica se o job já está na fila para evitar duplicatas
        const activeJobs = await this.maintenanceQueue.getActive()
        const waitingJobs = await this.maintenanceQueue.getWaiting()

        const alreadyQueued = [...activeJobs, ...waitingJobs].some(
            (job) => job.name === MAINTENANCE_JOBS.GENERATE_PREVENTIVE,
        )

        if (alreadyQueued) {
            this.logger.warn('Job de geração já está em execução — pulando')
            return
        }

        await this.maintenanceQueue.add(
            MAINTENANCE_JOBS.GENERATE_PREVENTIVE,
            {},
            {
                attempts: 3,
                backoff: { type: 'exponential', delay: 10000 },
                removeOnComplete: 100,  // Mantém os últimos 100 jobs concluídos
                removeOnFail: 50,
            },
        )

        this.logger.log('Job de geração enfileirado com sucesso')
    }

    // ─────────────────────────────────────────
    // Roda a cada 30 minutos — verifica OS
    // no painel sem técnico e envia alertas
    // ─────────────────────────────────────────
    @Cron(CronExpression.EVERY_30_MINUTES)
    async checkUnassignedServiceOrders() {
        this.logger.log('Cron: verificando OS sem técnico...')

        await this.maintenanceQueue.add(
            MAINTENANCE_JOBS.SEND_UNASSIGNED_ALERT,
            { trigger: 'cron' },
            {
                attempts: 2,
                backoff: { type: 'fixed', delay: 5000 },
                removeOnComplete: 50,
            },
        )
    }

    // ─────────────────────────────────────────
    // Roda todo dia às 00:05 — limpa jobs antigos
    // e garante que schedules do dia foram disparados
    // ─────────────────────────────────────────
    @Cron('5 0 * * *')
    async dailyMaintenance() {
        this.logger.log('Cron diário: limpeza e verificação de schedules')

        await this.maintenanceQueue.clean(
            24 * 60 * 60 * 1000, // 24 horas
            'completed',
        )

        await this.maintenanceQueue.clean(
            7 * 24 * 60 * 60 * 1000, // 7 dias
            'failed',
        )

        // Garante que o job do dia vai rodar
        await this.maintenanceQueue.add(
            MAINTENANCE_JOBS.GENERATE_PREVENTIVE,
            { trigger: 'daily-check' },
            { priority: 2 },
        )
    }
}