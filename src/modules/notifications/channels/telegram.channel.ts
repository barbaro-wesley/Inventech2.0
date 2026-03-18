import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios from 'axios'

export interface TelegramPayload {
    chatId: string
    message: string
    parseMode?: 'HTML' | 'Markdown'
}

@Injectable()
export class TelegramChannel implements OnModuleInit {
    private readonly logger = new Logger(TelegramChannel.name)
    private botToken: string
    private apiUrl: string
    private enabled: boolean

    constructor(private configService: ConfigService) { }

    onModuleInit() {
        this.botToken = this.configService.get<string>('telegram.botToken', '')
        this.apiUrl = `https://api.telegram.org/bot${this.botToken}`
        this.enabled = !!this.botToken

        if (!this.enabled) {
            this.logger.warn('Telegram não configurado — TELEGRAM_BOT_TOKEN não definido')
        } else {
            this.logger.log('Canal Telegram inicializado')
        }
    }

    async send(payload: TelegramPayload): Promise<void> {
        if (!this.enabled) {
            this.logger.debug(`Telegram desabilitado — mensagem ignorada para chatId: ${payload.chatId}`)
            return
        }

        try {
            await axios.post(`${this.apiUrl}/sendMessage`, {
                chat_id: payload.chatId,
                text: payload.message,
                parse_mode: payload.parseMode ?? 'HTML',
                disable_web_page_preview: true,
            })

            this.logger.log(`Telegram enviado → chatId: ${payload.chatId}`)
        } catch (error) {
            this.logger.error(
                `Erro ao enviar Telegram para ${payload.chatId}: ${error.message}`,
            )
            throw error
        }
    }

    // ─────────────────────────────────────────
    // Templates de mensagens Telegram
    // ─────────────────────────────────────────

    buildOsCreatedMessage(data: {
        osNumber: number
        osTitle: string
        clientName: string
        priority: string
        groupName?: string
    }): string {
        const priorityEmoji: Record<string, string> = {
            LOW: '🟢', MEDIUM: '🟡', HIGH: '🟠', URGENT: '🔴',
        }
        const emoji = priorityEmoji[data.priority] ?? '⚪'

        return [
            `🔔 <b>Nova OS no painel</b>`,
            ``,
            `<b>OS #${data.osNumber}</b> — ${data.osTitle}`,
            `👤 Cliente: ${data.clientName}`,
            `${emoji} Prioridade: ${data.priority}`,
            data.groupName ? `🏷️ Grupo: ${data.groupName}` : '',
            ``,
            `Acesse o sistema para assumir esta OS.`,
        ].filter(Boolean).join('\n')
    }

    buildTechnicianAssignedMessage(data: {
        technicianName: string
        osNumber: number
        osTitle: string
        clientName: string
        priority: string
    }): string {
        return [
            `📋 <b>OS atribuída a você</b>`,
            ``,
            `Olá, <b>${data.technicianName}</b>!`,
            `A OS <b>#${data.osNumber} — ${data.osTitle}</b> foi atribuída a você.`,
            ``,
            `👤 Cliente: ${data.clientName}`,
            `⚡ Prioridade: ${data.priority}`,
        ].join('\n')
    }

    buildOsCompletedMessage(data: {
        osNumber: number
        osTitle: string
    }): string {
        return [
            `✅ <b>OS concluída — aguardando aprovação</b>`,
            ``,
            `<b>OS #${data.osNumber} — ${data.osTitle}</b> foi marcada como concluída.`,
            ``,
            `Acesse o sistema para aprovar ou reprovar.`,
        ].join('\n')
    }

    buildOsRejectedMessage(data: {
        osNumber: number
        osTitle: string
        reason: string
    }): string {
        return [
            `❌ <b>OS reprovada</b>`,
            ``,
            `<b>OS #${data.osNumber} — ${data.osTitle}</b> foi reprovada.`,
            ``,
            `<b>Motivo:</b> ${data.reason}`,
            ``,
            `A OS foi reaberta no painel.`,
        ].join('\n')
    }

    buildUnassignedAlertMessage(data: {
        osNumber: number
        osTitle: string
        hoursWaiting: number
    }): string {
        return [
            `⚠️ <b>OS sem técnico há ${data.hoursWaiting}h</b>`,
            ``,
            `<b>OS #${data.osNumber} — ${data.osTitle}</b> está no painel sem nenhum técnico responsável.`,
            ``,
            `Acesse o sistema e assuma ou atribua esta OS urgentemente.`,
        ].join('\n')
    }

    buildPreventiveGeneratedMessage(data: {
        osNumber: number
        equipmentName: string
        clientName: string
        groupName?: string
    }): string {
        return [
            `🔧 <b>Manutenção preventiva gerada</b>`,
            ``,
            `OS <b>#${data.osNumber}</b> criada automaticamente.`,
            `📦 Equipamento: ${data.equipmentName}`,
            `👤 Cliente: ${data.clientName}`,
            data.groupName ? `🏷️ Grupo: ${data.groupName}` : '',
        ].filter(Boolean).join('\n')
    }
}