import {
    Processor,
    Process,
    OnQueueFailed,
    OnQueueCompleted,
} from '@nestjs/bull'
import { Logger } from '@nestjs/common'
import type { Job } from 'bull'
import {
    MaintenanceService,
    MAINTENANCE_QUEUE,
    MAINTENANCE_JOBS,
} from '../maintenance.service'

@Processor(MAINTENANCE_QUEUE)
export class MaintenanceProcessor {
    private readonly logger = new Logger(MaintenanceProcessor.name)

    constructor(private readonly maintenanceService: MaintenanceService) { }

    // ─────────────────────────────────────────
    // Job: gera OS preventivas para schedules vencidos
    // ─────────────────────────────────────────
    @Process(MAINTENANCE_JOBS.GENERATE_PREVENTIVE)
    async handleGeneratePreventive(job: Job) {
        this.logger.log(`Processando job: ${job.id} — Gerando OS preventivas`)

        const generated = await this.maintenanceService.generatePreventiveOrders()

        this.logger.log(`Job ${job.id} concluído — ${generated} OS gerada(s)`)

        return { generated }
    }

    // ─────────────────────────────────────────
    // Job: envia alerta de OS sem assumir
    // ─────────────────────────────────────────
    @Process(MAINTENANCE_JOBS.SEND_UNASSIGNED_ALERT)
    async handleUnassignedAlert(
        job: Job<{
            serviceOrderId: string
            number: number
            title: string
            companyId: string
            groupId: string | null
        }>,
    ) {
        const { number, title, companyId, groupId } = job.data

        this.logger.warn(
            `Alerta: OS #${number} "${title}" está sem técnico há muito tempo`,
        )

        // TODO: integrar com NotificationsModule quando implementado
        // O NotificationsService vai enviar email + telegram para:
        // - Todos os técnicos do grupo (se groupId definido)
        // - Todos os técnicos da empresa (se sem grupo)
        // - COMPANY_ADMIN e COMPANY_MANAGER

        return { notified: true }
    }

    // ─────────────────────────────────────────
    // Job: notifica sobre preventiva gerada
    // ─────────────────────────────────────────
    @Process('notify-preventive-generated')
    async handleNotifyPreventiveGenerated(
        job: Job<{ scheduleId: string; companyId: string }>,
    ) {
        this.logger.log(
            `Notificando geração de preventiva — Schedule: ${job.data.scheduleId}`,
        )

        // TODO: integrar com NotificationsModule
        return { notified: true }
    }

    // ─────────────────────────────────────────
    // Handlers de eventos da fila
    // ─────────────────────────────────────────
    @OnQueueFailed()
    onFailed(job: Job, error: Error) {
        this.logger.error(
            `Job falhou: ${job.name} (id: ${job.id}) | ` +
            `Tentativa: ${job.attemptsMade} | Erro: ${error.message}`,
        )
    }

    @OnQueueCompleted()
    onCompleted(job: Job, result: any) {
        this.logger.debug(
            `Job concluído: ${job.name} (id: ${job.id}) | Resultado: ${JSON.stringify(result)}`,
        )
    }
}