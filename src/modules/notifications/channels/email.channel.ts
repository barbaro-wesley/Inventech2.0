import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as nodemailer from 'nodemailer'
import { Transporter } from 'nodemailer'

export interface EmailPayload {
    to: string | string[]
    subject: string
    html: string
    text?: string  // fallback plaintext
}

@Injectable()
export class EmailChannel {
    private readonly logger = new Logger(EmailChannel.name)
    private transporter: Transporter

    constructor(private configService: ConfigService) {
        this.transporter = nodemailer.createTransport({
            host: this.configService.get<string>('mail.host'),
            port: this.configService.get<number>('mail.port'),
            secure: this.configService.get<boolean>('mail.secure'),
            auth: {
                user: this.configService.get<string>('mail.user'),
                pass: this.configService.get<string>('mail.password'),
            },
            ignoreTLS: this.configService.get<boolean>('mail.ignoreTLS'),
        })
    }

    async send(payload: EmailPayload): Promise<void> {
        const from = {
            name: this.configService.get<string>('mail.from.name', 'Sistema de Manutenção'),
            address: this.configService.get<string>('mail.from.address', ''),
        }

        await this.transporter.sendMail({
            from: `"${from.name}" <${from.address}>`,
            to: Array.isArray(payload.to) ? payload.to.join(', ') : payload.to,
            subject: payload.subject,
            html: payload.html,
            text: payload.text,
        })

        const recipients = Array.isArray(payload.to) ? payload.to.length : 1
        this.logger.log(`Email enviado: "${payload.subject}" → ${recipients} destinatário(s)`)
    }

    // ─────────────────────────────────────────
    // Templates de email
    // ─────────────────────────────────────────

    buildOsCreatedEmail(data: {
        osNumber: number
        osTitle: string
        clientName: string
        equipmentName: string
        priority: string
        groupName?: string
    }): Pick<EmailPayload, 'subject' | 'html'> {
        return {
            subject: `🔔 Nova OS #${data.osNumber} no painel — ${data.osTitle}`,
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #F59E0B; padding: 20px; border-radius: 8px 8px 0 0;">
            <h2 style="color: white; margin: 0;">Nova OS disponível no painel</h2>
          </div>
          <div style="background: #f9f9f9; padding: 24px; border-radius: 0 0 8px 8px;">
            <p><strong>OS #${data.osNumber}</strong> — ${data.osTitle}</p>
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px 0; color: #666;">Cliente</td><td><strong>${data.clientName}</strong></td></tr>
              <tr><td style="padding: 8px 0; color: #666;">Equipamento</td><td><strong>${data.equipmentName}</strong></td></tr>
              <tr><td style="padding: 8px 0; color: #666;">Prioridade</td><td><strong>${data.priority}</strong></td></tr>
              ${data.groupName ? `<tr><td style="padding: 8px 0; color: #666;">Grupo</td><td><strong>${data.groupName}</strong></td></tr>` : ''}
            </table>
            <p style="margin-top: 24px; color: #666;">Acesse o sistema para assumir esta OS.</p>
          </div>
        </div>
      `,
        }
    }

    buildTechnicianAssignedEmail(data: {
        technicianName: string
        osNumber: number
        osTitle: string
        clientName: string
        equipmentName: string
        priority: string
        scheduledFor?: string
    }): Pick<EmailPayload, 'subject' | 'html'> {
        return {
            subject: `📋 OS #${data.osNumber} atribuída a você — ${data.osTitle}`,
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #3B82F6; padding: 20px; border-radius: 8px 8px 0 0;">
            <h2 style="color: white; margin: 0;">OS atribuída a você</h2>
          </div>
          <div style="background: #f9f9f9; padding: 24px; border-radius: 0 0 8px 8px;">
            <p>Olá, <strong>${data.technicianName}</strong>!</p>
            <p>A OS <strong>#${data.osNumber} — ${data.osTitle}</strong> foi atribuída a você.</p>
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px 0; color: #666;">Cliente</td><td><strong>${data.clientName}</strong></td></tr>
              <tr><td style="padding: 8px 0; color: #666;">Equipamento</td><td><strong>${data.equipmentName}</strong></td></tr>
              <tr><td style="padding: 8px 0; color: #666;">Prioridade</td><td><strong>${data.priority}</strong></td></tr>
              ${data.scheduledFor ? `<tr><td style="padding: 8px 0; color: #666;">Agendada para</td><td><strong>${data.scheduledFor}</strong></td></tr>` : ''}
            </table>
          </div>
        </div>
      `,
        }
    }

    buildOsCompletedEmail(data: {
        osNumber: number
        osTitle: string
        resolution: string
        technicianNames: string[]
    }): Pick<EmailPayload, 'subject' | 'html'> {
        return {
            subject: `✅ OS #${data.osNumber} concluída — aguardando aprovação`,
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #10B981; padding: 20px; border-radius: 8px 8px 0 0;">
            <h2 style="color: white; margin: 0;">OS concluída — aguardando aprovação</h2>
          </div>
          <div style="background: #f9f9f9; padding: 24px; border-radius: 0 0 8px 8px;">
            <p><strong>OS #${data.osNumber} — ${data.osTitle}</strong> foi concluída.</p>
            <p><strong>Resolução:</strong> ${data.resolution}</p>
            <p><strong>Técnico(s):</strong> ${data.technicianNames.join(', ')}</p>
            <p style="margin-top: 16px; color: #666;">Acesse o sistema para aprovar ou reprovar.</p>
          </div>
        </div>
      `,
        }
    }

    buildOsRejectedEmail(data: {
        osNumber: number
        osTitle: string
        reason: string
    }): Pick<EmailPayload, 'subject' | 'html'> {
        return {
            subject: `❌ OS #${data.osNumber} reprovada — ${data.osTitle}`,
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #EF4444; padding: 20px; border-radius: 8px 8px 0 0;">
            <h2 style="color: white; margin: 0;">OS reprovada</h2>
          </div>
          <div style="background: #f9f9f9; padding: 24px; border-radius: 0 0 8px 8px;">
            <p><strong>OS #${data.osNumber} — ${data.osTitle}</strong> foi reprovada.</p>
            <p><strong>Motivo:</strong> ${data.reason}</p>
            <p style="color: #666; margin-top: 16px;">A OS foi reaberta e está no painel para ser retomada.</p>
          </div>
        </div>
      `,
        }
    }

    buildUnassignedAlertEmail(data: {
        osNumber: number
        osTitle: string
        clientName: string
        hoursWaiting: number
        groupName?: string
    }): Pick<EmailPayload, 'subject' | 'html'> {
        return {
            subject: `⚠️ OS #${data.osNumber} sem técnico há ${data.hoursWaiting}h — ${data.osTitle}`,
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #F97316; padding: 20px; border-radius: 8px 8px 0 0;">
            <h2 style="color: white; margin: 0;">⚠️ OS sem técnico responsável</h2>
          </div>
          <div style="background: #f9f9f9; padding: 24px; border-radius: 0 0 8px 8px;">
            <p>A OS <strong>#${data.osNumber} — ${data.osTitle}</strong> está no painel há <strong>${data.hoursWaiting} hora(s)</strong> sem nenhum técnico a ter assumido.</p>
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px 0; color: #666;">Cliente</td><td><strong>${data.clientName}</strong></td></tr>
              ${data.groupName ? `<tr><td style="padding: 8px 0; color: #666;">Grupo</td><td><strong>${data.groupName}</strong></td></tr>` : ''}
            </table>
            <p style="margin-top: 16px; color: #e53e3e;"><strong>Ação necessária:</strong> Acesse o painel e assuma ou atribua esta OS a um técnico.</p>
          </div>
        </div>
      `,
        }
    }

    buildDailySummaryEmail(data: {
        companyName: string
        date: string
        openCount: number
        inProgressCount: number
        completedPendingCount: number
        overdueCount: number
    }): Pick<EmailPayload, 'subject' | 'html'> {
        return {
            subject: `📊 Resumo diário de OS — ${data.companyName} — ${data.date}`,
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #6366F1; padding: 20px; border-radius: 8px 8px 0 0;">
            <h2 style="color: white; margin: 0;">Resumo diário — ${data.date}</h2>
          </div>
          <div style="background: #f9f9f9; padding: 24px; border-radius: 0 0 8px 8px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr style="background: #fff;"><td style="padding: 12px; border-bottom: 1px solid #eee;">🟡 OS no painel (sem técnico)</td><td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;"><strong>${data.openCount}</strong></td></tr>
              <tr style="background: #fff;"><td style="padding: 12px; border-bottom: 1px solid #eee;">🔵 OS em andamento</td><td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;"><strong>${data.inProgressCount}</strong></td></tr>
              <tr style="background: #fff;"><td style="padding: 12px; border-bottom: 1px solid #eee;">🟢 OS aguardando aprovação</td><td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;"><strong>${data.completedPendingCount}</strong></td></tr>
              <tr style="background: #fff;"><td style="padding: 12px; color: #e53e3e;">🔴 OS com alerta (sem técnico)</td><td style="padding: 12px; text-align: right; color: #e53e3e;"><strong>${data.overdueCount}</strong></td></tr>
            </table>
          </div>
        </div>
      `,
        }
    }
}