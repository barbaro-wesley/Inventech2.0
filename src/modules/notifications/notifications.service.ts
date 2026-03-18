import { Injectable, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bull'
import type { Queue } from 'bull'
import { UserRole, NotificationChannel, NotificationStatus } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { EmailChannel } from './channels/email.channel'
import { TelegramChannel } from './channels/telegram.channel'
import { NotificationsGateway } from './notifications.gateway'
import {
    NOTIFICATION_QUEUE,
    NOTIFICATION_EVENTS,
    NotificationEvent,
} from './notifications.constants'

// Payload que cada job recebe na fila
export interface NotificationJobPayload {
    event: NotificationEvent
    data: Record<string, any>
    companyId: string
    serviceOrderId?: string
}

@Injectable()
export class NotificationsService {
    private readonly logger = new Logger(NotificationsService.name)

    constructor(
        private prisma: PrismaService,
        private emailChannel: EmailChannel,
        private telegramChannel: TelegramChannel,
        private gateway: NotificationsGateway,
        @InjectQueue(NOTIFICATION_QUEUE) private notificationQueue: Queue,
    ) { }

    // ─────────────────────────────────────────
    // Enfileira uma notificação
    // Chamado pelos outros serviços (ServiceOrders, Maintenance etc.)
    // ─────────────────────────────────────────
    async notify(payload: NotificationJobPayload) {
        await this.notificationQueue.add('dispatch', payload, {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
            removeOnComplete: 100,
        })
    }

    // ─────────────────────────────────────────
    // Dispatcher principal — chamado pelo processor
    // Decide quem notificar e por quais canais
    // ─────────────────────────────────────────
    async dispatch(payload: NotificationJobPayload): Promise<void> {
        const { event, data, companyId, serviceOrderId } = payload

        this.logger.log(`Disparando notificação: ${event} | Empresa: ${companyId}`)

        switch (event) {
            case NOTIFICATION_EVENTS.OS_CREATED_NO_TECHNICIAN:
                await this.notifyOsCreatedNoTechnician(data, companyId, serviceOrderId)
                break

            case NOTIFICATION_EVENTS.OS_TECHNICIAN_ASSIGNED:
                await this.notifyTechnicianAssigned(data, companyId, serviceOrderId)
                break

            case NOTIFICATION_EVENTS.OS_TECHNICIAN_ASSUMED:
                await this.notifyTechnicianAssumed(data, companyId, serviceOrderId)
                break

            case NOTIFICATION_EVENTS.OS_COMPLETED:
                await this.notifyOsCompleted(data, companyId, serviceOrderId)
                break

            case NOTIFICATION_EVENTS.OS_APPROVED:
                await this.notifyOsApproved(data, companyId, serviceOrderId)
                break

            case NOTIFICATION_EVENTS.OS_REJECTED:
                await this.notifyOsRejected(data, companyId, serviceOrderId)
                break

            case NOTIFICATION_EVENTS.OS_UNASSIGNED_ALERT:
                await this.notifyUnassignedAlert(data, companyId, serviceOrderId)
                break

            case NOTIFICATION_EVENTS.PREVENTIVE_GENERATED:
                await this.notifyPreventiveGenerated(data, companyId, serviceOrderId)
                break

            case NOTIFICATION_EVENTS.DAILY_SUMMARY:
                await this.sendDailySummary(data, companyId)
                break

            default:
                this.logger.warn(`Evento desconhecido: ${event}`)
        }
    }

    // ─────────────────────────────────────────
    // OS criada sem técnico → painel
    // ─────────────────────────────────────────
    private async notifyOsCreatedNoTechnician(
        data: any,
        companyId: string,
        serviceOrderId?: string,
    ) {
        // Busca técnicos do grupo + gestores da empresa
        const recipients = await this.getGroupTechniciansAndManagers(
            companyId,
            data.groupId,
        )

        const emailTemplate = this.emailChannel.buildOsCreatedEmail(data)
        const telegramMsg = this.telegramChannel.buildOsCreatedMessage(data)

        await this.sendToRecipients(recipients, {
            email: emailTemplate,
            telegram: telegramMsg,
            ws: {
                event: NOTIFICATION_EVENTS.OS_CREATED_NO_TECHNICIAN,
                title: `Nova OS no painel`,
                body: `OS #${data.osNumber} — ${data.osTitle}`,
                data,
            },
            companyId,
            serviceOrderId,
        })

        // Atualiza o painel em tempo real para todos da empresa
        this.gateway.sendPanelUpdate(companyId, {
            event: 'os.panel.new',
            title: 'Nova OS disponível',
            body: `OS #${data.osNumber} — ${data.osTitle}`,
            data: { serviceOrderId },
        })
    }

    // ─────────────────────────────────────────
    // Técnico designado a uma OS
    // ─────────────────────────────────────────
    private async notifyTechnicianAssigned(
        data: any,
        companyId: string,
        serviceOrderId?: string,
    ) {
        const technician = await this.prisma.user.findUnique({
            where: { id: data.technicianId },
            select: { id: true, email: true, telegramChatId: true, name: true },
        })
        if (!technician) return

        const emailTemplate = this.emailChannel.buildTechnicianAssignedEmail({
            technicianName: technician.name,
            ...data,
        })
        const telegramMsg = this.telegramChannel.buildTechnicianAssignedMessage({
            technicianName: technician.name,
            ...data,
        })

        await this.sendToRecipients([technician], {
            email: emailTemplate,
            telegram: telegramMsg,
            ws: {
                event: NOTIFICATION_EVENTS.OS_TECHNICIAN_ASSIGNED,
                title: 'OS atribuída a você',
                body: `OS #${data.osNumber} — ${data.osTitle}`,
                data,
            },
            companyId,
            serviceOrderId,
        })

        if (serviceOrderId) {
            this.gateway.sendOsUpdate(serviceOrderId, {
                event: 'os.technician.assigned',
                title: 'Técnico atribuído',
                body: `${technician.name} foi atribuído a esta OS`,
                data: { technician: { id: technician.id, name: technician.name } },
            })
        }
    }

    // ─────────────────────────────────────────
    // Técnico assumiu a OS do painel
    // ─────────────────────────────────────────
    private async notifyTechnicianAssumed(
        data: any,
        companyId: string,
        serviceOrderId?: string,
    ) {
        // Notifica o solicitante e os gestores
        const recipients = await this.getManagersAndRequester(companyId, data.requesterId)

        await this.sendToRecipients(recipients, {
            email: {
                subject: `🔧 OS #${data.osNumber} assumida por ${data.technicianName}`,
                html: `<p>A OS <strong>#${data.osNumber} — ${data.osTitle}</strong> foi assumida por <strong>${data.technicianName}</strong> e está em andamento.</p>`,
            },
            telegram: `🔧 <b>OS assumida</b>\n\nOS <b>#${data.osNumber}</b> foi assumida por <b>${data.technicianName}</b> e está em andamento.`,
            ws: {
                event: NOTIFICATION_EVENTS.OS_TECHNICIAN_ASSUMED,
                title: 'OS em andamento',
                body: `${data.technicianName} assumiu a OS #${data.osNumber}`,
                data,
            },
            companyId,
            serviceOrderId,
        })

        // Remove do painel em tempo real
        this.gateway.sendPanelUpdate(companyId, {
            event: 'os.panel.removed',
            title: 'OS removida do painel',
            body: `OS #${data.osNumber} foi assumida`,
            data: { serviceOrderId },
        })

        if (serviceOrderId) {
            this.gateway.sendOsUpdate(serviceOrderId, {
                event: 'os.status.changed',
                title: 'Status atualizado',
                body: 'OS em andamento',
                data: { status: 'IN_PROGRESS' },
            })
        }
    }

    // ─────────────────────────────────────────
    // OS concluída
    // ─────────────────────────────────────────
    private async notifyOsCompleted(
        data: any,
        companyId: string,
        serviceOrderId?: string,
    ) {
        const recipients = await this.getManagersAndRequester(companyId, data.requesterId)
        const emailTemplate = this.emailChannel.buildOsCompletedEmail(data)

        await this.sendToRecipients(recipients, {
            email: emailTemplate,
            telegram: this.telegramChannel.buildOsCompletedMessage(data),
            ws: {
                event: NOTIFICATION_EVENTS.OS_COMPLETED,
                title: 'OS concluída — aguardando aprovação',
                body: `OS #${data.osNumber} — ${data.osTitle}`,
                data,
            },
            companyId,
            serviceOrderId,
        })

        if (serviceOrderId) {
            this.gateway.sendOsUpdate(serviceOrderId, {
                event: 'os.status.changed',
                title: 'OS concluída',
                body: 'Aguardando aprovação',
                data: { status: 'COMPLETED' },
            })
        }
    }

    // ─────────────────────────────────────────
    // OS aprovada
    // ─────────────────────────────────────────
    private async notifyOsApproved(
        data: any,
        companyId: string,
        serviceOrderId?: string,
    ) {
        const technicians = await this.getOsTechnicians(serviceOrderId)

        await this.sendToRecipients(technicians, {
            email: {
                subject: `✅ OS #${data.osNumber} aprovada`,
                html: `<p>A OS <strong>#${data.osNumber} — ${data.osTitle}</strong> foi <strong>aprovada</strong>.</p>`,
            },
            telegram: `✅ <b>OS aprovada</b>\n\nOS <b>#${data.osNumber} — ${data.osTitle}</b> foi aprovada.`,
            ws: {
                event: NOTIFICATION_EVENTS.OS_APPROVED,
                title: 'OS aprovada',
                body: `OS #${data.osNumber} foi aprovada`,
                data,
            },
            companyId,
            serviceOrderId,
        })

        if (serviceOrderId) {
            this.gateway.sendOsUpdate(serviceOrderId, {
                event: 'os.status.changed',
                title: 'OS aprovada',
                body: 'OS finalizada com sucesso',
                data: { status: 'COMPLETED_APPROVED' },
            })
        }
    }

    // ─────────────────────────────────────────
    // OS reprovada
    // ─────────────────────────────────────────
    private async notifyOsRejected(
        data: any,
        companyId: string,
        serviceOrderId?: string,
    ) {
        const technicians = await this.getOsTechnicians(serviceOrderId)
        const managers = await this.getManagers(companyId)
        const recipients = [...technicians, ...managers]

        const emailTemplate = this.emailChannel.buildOsRejectedEmail(data)

        await this.sendToRecipients(recipients, {
            email: emailTemplate,
            telegram: this.telegramChannel.buildOsRejectedMessage(data),
            ws: {
                event: NOTIFICATION_EVENTS.OS_REJECTED,
                title: 'OS reprovada',
                body: `OS #${data.osNumber} — ${data.reason}`,
                data,
            },
            companyId,
            serviceOrderId,
        })

        if (serviceOrderId) {
            this.gateway.sendOsUpdate(serviceOrderId, {
                event: 'os.status.changed',
                title: 'OS reprovada',
                body: data.reason,
                data: { status: 'COMPLETED_REJECTED' },
            })
        }
    }

    // ─────────────────────────────────────────
    // Alerta de OS sem técnico há X horas
    // ─────────────────────────────────────────
    private async notifyUnassignedAlert(
        data: any,
        companyId: string,
        serviceOrderId?: string,
    ) {
        const recipients = await this.getGroupTechniciansAndManagers(companyId, data.groupId)
        const emailTemplate = this.emailChannel.buildUnassignedAlertEmail(data)

        await this.sendToRecipients(recipients, {
            email: emailTemplate,
            telegram: this.telegramChannel.buildUnassignedAlertMessage(data),
            ws: {
                event: NOTIFICATION_EVENTS.OS_UNASSIGNED_ALERT,
                title: `⚠️ OS sem técnico há ${data.hoursWaiting}h`,
                body: `OS #${data.osNumber} — ${data.osTitle}`,
                data,
            },
            companyId,
            serviceOrderId,
        })
    }

    // ─────────────────────────────────────────
    // Manutenção preventiva gerada
    // ─────────────────────────────────────────
    private async notifyPreventiveGenerated(
        data: any,
        companyId: string,
        serviceOrderId?: string,
    ) {
        const recipients = await this.getGroupTechniciansAndManagers(companyId, data.groupId)

        await this.sendToRecipients(recipients, {
            email: {
                subject: `🔧 Preventiva gerada — OS #${data.osNumber}`,
                html: `<p>OS preventiva <strong>#${data.osNumber}</strong> gerada automaticamente para o equipamento <strong>${data.equipmentName}</strong>.</p>`,
            },
            telegram: this.telegramChannel.buildPreventiveGeneratedMessage(data),
            ws: {
                event: NOTIFICATION_EVENTS.PREVENTIVE_GENERATED,
                title: 'Preventiva gerada',
                body: `OS #${data.osNumber} — ${data.equipmentName}`,
                data,
            },
            companyId,
            serviceOrderId,
        })

        // Atualiza o painel
        this.gateway.sendPanelUpdate(companyId, {
            event: 'os.panel.new',
            title: 'Nova preventiva no painel',
            body: `OS #${data.osNumber} — ${data.equipmentName}`,
            data: { serviceOrderId },
        })
    }

    // ─────────────────────────────────────────
    // Resumo diário de OS
    // ─────────────────────────────────────────
    private async sendDailySummary(data: any, companyId: string) {
        // Busca métricas do dia
        const [open, inProgress, completedPending, overdue] = await Promise.all([
            this.prisma.serviceOrder.count({
                where: { companyId, status: 'AWAITING_PICKUP', deletedAt: null },
            }),
            this.prisma.serviceOrder.count({
                where: { companyId, status: 'IN_PROGRESS', deletedAt: null },
            }),
            this.prisma.serviceOrder.count({
                where: { companyId, status: 'COMPLETED', deletedAt: null },
            }),
            this.prisma.serviceOrder.count({
                where: {
                    companyId,
                    isAvailable: true,
                    alertSentAt: { not: null },
                    deletedAt: null,
                },
            }),
        ])

        const company = await this.prisma.company.findUnique({
            where: { id: companyId },
            select: { name: true },
        })

        const admins = await this.getManagers(companyId)
        const date = new Date().toLocaleDateString('pt-BR')

        const emailTemplate = this.emailChannel.buildDailySummaryEmail({
            companyName: company?.name ?? '',
            date,
            openCount: open,
            inProgressCount: inProgress,
            completedPendingCount: completedPending,
            overdueCount: overdue,
        })

        for (const admin of admins) {
            if (admin.email) {
                await this.saveAndSendEmail(admin.id, companyId, emailTemplate, undefined)
            }
        }
    }

    // ─────────────────────────────────────────
    // Método de envio unificado
    // Persiste notificação no banco + envia por cada canal
    // ─────────────────────────────────────────
    private async sendToRecipients(
        recipients: Array<{ id: string; email?: string | null; telegramChatId?: string | null }>,
        options: {
            email: { subject: string; html: string }
            telegram: string
            ws: { event: string; title: string; body: string; data?: any }
            companyId: string
            serviceOrderId?: string
        },
    ) {
        for (const recipient of recipients) {
            // WebSocket — sempre envia se o usuário estiver conectado
            this.gateway.sendToUser(recipient.id, options.ws)

            // Persiste notificação no banco
            await this.saveAndSendEmail(
                recipient.id,
                options.companyId,
                options.email,
                options.serviceOrderId,
            )

            // Telegram — só envia se tiver chatId configurado
            if (recipient.telegramChatId) {
                await this.saveAndSendTelegram(
                    recipient.id,
                    options.companyId,
                    recipient.telegramChatId,
                    options.telegram,
                    options.serviceOrderId,
                )
            }
        }
    }

    private async saveAndSendEmail(
        userId: string,
        companyId: string,
        template: { subject: string; html: string },
        serviceOrderId?: string,
    ) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { email: true },
        })
        if (!user?.email) return

        const notification = await this.prisma.notification.create({
            data: {
                companyId,
                userId,
                serviceOrderId,
                channel: NotificationChannel.EMAIL,
                status: NotificationStatus.PENDING,
                title: template.subject,
                body: template.html,
            },
        })

        try {
            await this.emailChannel.send({
                to: user.email,
                subject: template.subject,
                html: template.html,
            })

            await this.prisma.notification.update({
                where: { id: notification.id },
                data: { status: NotificationStatus.SENT, sentAt: new Date() },
            })
        } catch (error) {
            await this.prisma.notification.update({
                where: { id: notification.id },
                data: {
                    status: NotificationStatus.FAILED,
                    failedAt: new Date(),
                    failReason: error.message,
                    retryCount: { increment: 1 },
                },
            })
        }
    }

    private async saveAndSendTelegram(
        userId: string,
        companyId: string,
        chatId: string,
        message: string,
        serviceOrderId?: string,
    ) {
        const notification = await this.prisma.notification.create({
            data: {
                companyId,
                userId,
                serviceOrderId,
                channel: NotificationChannel.TELEGRAM,
                status: NotificationStatus.PENDING,
                title: message.substring(0, 100),
                body: message,
                metadata: { chatId },
            },
        })

        try {
            await this.telegramChannel.send({ chatId, message })

            await this.prisma.notification.update({
                where: { id: notification.id },
                data: { status: NotificationStatus.SENT, sentAt: new Date() },
            })
        } catch (error) {
            await this.prisma.notification.update({
                where: { id: notification.id },
                data: {
                    status: NotificationStatus.FAILED,
                    failedAt: new Date(),
                    failReason: error.message,
                    retryCount: { increment: 1 },
                },
            })
        }
    }

    // ─────────────────────────────────────────
    // Listar notificações do usuário
    // ─────────────────────────────────────────
    async findUserNotifications(userId: string, page = 1, limit = 20) {
        const where = { userId }
        const [data, total, unread] = await Promise.all([
            this.prisma.notification.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
                select: {
                    id: true,
                    channel: true,
                    status: true,
                    title: true,
                    body: true,
                    readAt: true,
                    createdAt: true,
                    serviceOrderId: true,
                },
            }),
            this.prisma.notification.count({ where }),
            this.prisma.notification.count({ where: { userId, readAt: null } }),
        ])

        return { data, total, unread, page, limit }
    }

    async markAsRead(notificationId: string, userId: string) {
        return this.prisma.notification.updateMany({
            where: { id: notificationId, userId },
            data: { readAt: new Date() },
        })
    }

    async markAllAsRead(userId: string) {
        return this.prisma.notification.updateMany({
            where: { userId, readAt: null },
            data: { readAt: new Date() },
        })
    }

    // ─────────────────────────────────────────
    // Helpers para buscar destinatários
    // ─────────────────────────────────────────
    private async getGroupTechniciansAndManagers(companyId: string, groupId?: string) {
        const [technicians, managers] = await Promise.all([
            groupId
                ? this.prisma.user.findMany({
                    where: {
                        companyId,
                        role: UserRole.TECHNICIAN,
                        deletedAt: null,
                        status: 'ACTIVE',
                        technicianGroups: { some: { groupId, isActive: true } },
                    },
                    select: { id: true, email: true, telegramChatId: true },
                })
                : this.prisma.user.findMany({
                    where: { companyId, role: UserRole.TECHNICIAN, deletedAt: null, status: 'ACTIVE' },
                    select: { id: true, email: true, telegramChatId: true },
                }),
            this.getManagers(companyId),
        ])

        // Remove duplicatas
        const all = [...technicians, ...managers]
        return [...new Map(all.map((u) => [u.id, u])).values()]
    }

    private async getManagers(companyId: string) {
        return this.prisma.user.findMany({
            where: {
                companyId,
                role: { in: [UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER] },
                deletedAt: null,
                status: 'ACTIVE',
            },
            select: { id: true, email: true, telegramChatId: true },
        })
    }

    private async getManagersAndRequester(companyId: string, requesterId?: string) {
        const managers = await this.getManagers(companyId)

        if (requesterId) {
            const requester = await this.prisma.user.findUnique({
                where: { id: requesterId },
                select: { id: true, email: true, telegramChatId: true },
            })
            if (requester && !managers.find((m) => m.id === requester.id)) {
                managers.push(requester)
            }
        }

        return managers
    }

    private async getOsTechnicians(serviceOrderId?: string) {
        if (!serviceOrderId) return []

        return this.prisma.user.findMany({
            where: {
                serviceOrderTechnicians: {
                    some: { serviceOrderId, releasedAt: null },
                },
            },
            select: { id: true, email: true, telegramChatId: true },
        })
    }
}