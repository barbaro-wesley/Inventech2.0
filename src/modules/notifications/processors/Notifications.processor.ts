import { Processor, Process, OnQueueFailed } from '@nestjs/bull'
import { Logger } from '@nestjs/common'
import type { Job } from 'bull'
import { NotificationsService, NotificationJobPayload } from '../notifications.service'
import { NOTIFICATION_QUEUE } from '../notifications.constants'

@Processor(NOTIFICATION_QUEUE)
export class NotificationsProcessor {
    private readonly logger = new Logger(NotificationsProcessor.name)

    constructor(private readonly notificationsService: NotificationsService) { }

    @Process('dispatch')
    async handleDispatch(job: Job<NotificationJobPayload>) {
        this.logger.log(`Processando notificação: ${job.data.event} (job: ${job.id})`)
        await this.notificationsService.dispatch(job.data)
    }

    @OnQueueFailed()
    onFailed(job: Job, error: Error) {
        this.logger.error(
            `Notificação falhou: ${job.data?.event} (job: ${job.id}) | ` +
            `Tentativa: ${job.attemptsMade} | Erro: ${error.message}`,
        )
    }
}