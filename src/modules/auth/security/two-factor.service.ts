import {
    Injectable,
    Logger,
    BadRequestException,
    UnauthorizedException,
} from '@nestjs/common'
import * as bcrypt from 'bcrypt'
import * as crypto from 'crypto'
import { PrismaService } from '../../../prisma/prisma.service'
import { EmailChannel } from '../../notifications/channels/email.channel'

const CODE_EXPIRY_MINUTES = 10        // Código 2FA expira em 10 min
const TOKEN_EXPIRY_HOURS = 24         // Token de email/reset expira em 24h
const RESET_TOKEN_EXPIRY_HOURS = 1    // Token de reset de senha expira em 1h

export type TwoFactorType = 'LOGIN' | 'EMAIL_CHANGE' | 'PASSWORD_RESET' | 'SENSITIVE_ACTION'

@Injectable()
export class TwoFactorService {
    private readonly logger = new Logger(TwoFactorService.name)

    constructor(
        private prisma: PrismaService,
        private emailChannel: EmailChannel,
    ) { }

    // ─────────────────────────────────────────
    // Gera código numérico de 6 dígitos
    // e envia por email
    // ─────────────────────────────────────────
    async sendTwoFactorCode(
        userId: string,
        type: TwoFactorType,
        ipAddress?: string,
    ): Promise<void> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { email: true, name: true },
        })
        if (!user) throw new BadRequestException('Usuário não encontrado')

        // Invalida códigos anteriores do mesmo tipo
        await this.prisma.twoFactorCode.updateMany({
            where: { userId, type, usedAt: null },
            data: { usedAt: new Date() },
        })

        // Gera código de 6 dígitos
        const code = Math.floor(100000 + Math.random() * 900000).toString()
        const codeHash = await bcrypt.hash(code, 10)
        const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000)

        await this.prisma.twoFactorCode.create({
            data: {
                userId,
                code: codeHash,
                type,
                expiresAt,
                ipAddress,
            },
        })

        // Envia o código por email
        const subjects: Record<TwoFactorType, string> = {
            LOGIN: '🔐 Seu código de verificação',
            EMAIL_CHANGE: '📧 Confirme a troca de email',
            PASSWORD_RESET: '🔑 Código para redefinir sua senha',
            SENSITIVE_ACTION: '⚠️ Confirmação de ação sensível',
        }

        await this.emailChannel.send({
            to: user.email,
            subject: subjects[type],
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
          <div style="background: #6366F1; padding: 20px; border-radius: 8px 8px 0 0;">
            <h2 style="color: white; margin: 0;">${subjects[type]}</h2>
          </div>
          <div style="background: #f9f9f9; padding: 24px; border-radius: 0 0 8px 8px;">
            <p>Olá, <strong>${user.name}</strong>!</p>
            <p>Seu código de verificação é:</p>
            <div style="text-align: center; margin: 24px 0;">
              <span style="font-size: 36px; font-weight: bold; letter-spacing: 12px; color: #6366F1;">
                ${code}
              </span>
            </div>
            <p style="color: #666; font-size: 14px;">
              Este código expira em <strong>${CODE_EXPIRY_MINUTES} minutos</strong>.
              Não compartilhe com ninguém.
            </p>
            ${ipAddress ? `<p style="color: #999; font-size: 12px;">Solicitado do IP: ${ipAddress}</p>` : ''}
          </div>
        </div>
      `,
        })

        this.logger.log(`Código 2FA enviado: userId=${userId} | tipo=${type}`)
    }

    // ─────────────────────────────────────────
    // Valida o código informado pelo usuário
    // ─────────────────────────────────────────
    async verifyCode(
        userId: string,
        code: string,
        type: TwoFactorType,
    ): Promise<boolean> {
        const record = await this.prisma.twoFactorCode.findFirst({
            where: {
                userId,
                type,
                usedAt: null,
                expiresAt: { gt: new Date() },
            },
            orderBy: { createdAt: 'desc' },
        })

        if (!record) {
            throw new UnauthorizedException('Código expirado ou inválido. Solicite um novo.')
        }

        const isValid = await bcrypt.compare(code, record.code)

        if (!isValid) {
            throw new UnauthorizedException('Código incorreto.')
        }

        // Marca como usado
        await this.prisma.twoFactorCode.update({
            where: { id: record.id },
            data: { usedAt: new Date() },
        })

        return true
    }

    // ─────────────────────────────────────────
    // Envia email de verificação no cadastro
    // ─────────────────────────────────────────
    async sendEmailVerification(userId: string): Promise<void> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { email: true, name: true },
        })
        if (!user) return

        // Invalida tokens anteriores
        await this.prisma.emailVerification.updateMany({
            where: { userId, verifiedAt: null },
            data: { verifiedAt: new Date() },
        })

        const token = crypto.randomBytes(32).toString('hex')
        const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000)

        await this.prisma.emailVerification.create({
            data: { userId, token, expiresAt },
        })

        const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3001'
        const verificationUrl = `${frontendUrl}/auth/verify-email?token=${token}`

        await this.emailChannel.send({
            to: user.email,
            subject: '✅ Confirme seu email — Sistema de Manutenção',
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
          <div style="background: #10B981; padding: 20px; border-radius: 8px 8px 0 0;">
            <h2 style="color: white; margin: 0;">Confirme seu email</h2>
          </div>
          <div style="background: #f9f9f9; padding: 24px; border-radius: 0 0 8px 8px;">
            <p>Olá, <strong>${user.name}</strong>!</p>
            <p>Clique no botão abaixo para confirmar seu email e ativar sua conta.</p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${verificationUrl}"
                style="background: #10B981; color: white; padding: 14px 32px;
                       text-decoration: none; border-radius: 8px; font-weight: bold;">
                Confirmar email
              </a>
            </div>
            <p style="color: #666; font-size: 14px;">
              O link expira em <strong>${TOKEN_EXPIRY_HOURS} horas</strong>.
            </p>
            <p style="color: #999; font-size: 12px;">
              Se você não criou uma conta, ignore este email.
            </p>
          </div>
        </div>
      `,
        })
    }

    // ─────────────────────────────────────────
    // Verifica token de email
    // ─────────────────────────────────────────
    async verifyEmailToken(token: string): Promise<{ userId: string }> {
        const record = await this.prisma.emailVerification.findUnique({
            where: { token },
            select: { id: true, userId: true, expiresAt: true, verifiedAt: true },
        })

        if (!record) throw new BadRequestException('Token inválido')
        if (record.verifiedAt) throw new BadRequestException('Email já verificado')
        if (record.expiresAt < new Date()) throw new BadRequestException('Token expirado. Solicite um novo.')

        await this.prisma.$transaction([
            this.prisma.emailVerification.update({
                where: { id: record.id },
                data: { verifiedAt: new Date() },
            }),
            this.prisma.user.update({
                where: { id: record.userId },
                data: { status: 'ACTIVE' },
            }),
        ])

        this.logger.log(`Email verificado: userId=${record.userId}`)
        return { userId: record.userId }
    }

    // ─────────────────────────────────────────
    // Envia link de reset de senha
    // ─────────────────────────────────────────
    async sendPasswordReset(email: string, ipAddress?: string): Promise<void> {
        const user = await this.prisma.user.findUnique({
            where: { email },
            select: { id: true, name: true },
        })

        // Sempre retorna sucesso mesmo se o email não existir (segurança)
        if (!user) {
            this.logger.debug(`Reset solicitado para email inexistente: ${email}`)
            return
        }

        // Invalida tokens anteriores
        await this.prisma.passwordReset.updateMany({
            where: { userId: user.id, usedAt: null },
            data: { usedAt: new Date() },
        })

        const token = crypto.randomBytes(32).toString('hex')
        const tokenHash = await bcrypt.hash(token, 10)
        const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000)

        await this.prisma.passwordReset.create({
            data: { userId: user.id, token: tokenHash, ipAddress, expiresAt },
        })

        const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3001'
        const resetUrl = `${frontendUrl}/auth/reset-password?token=${token}`

        await this.emailChannel.send({
            to: email,
            subject: '🔑 Redefinição de senha — Sistema de Manutenção',
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
          <div style="background: #F59E0B; padding: 20px; border-radius: 8px 8px 0 0;">
            <h2 style="color: white; margin: 0;">Redefinir senha</h2>
          </div>
          <div style="background: #f9f9f9; padding: 24px; border-radius: 0 0 8px 8px;">
            <p>Olá, <strong>${user.name}</strong>!</p>
            <p>Recebemos uma solicitação para redefinir a senha da sua conta.</p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${resetUrl}"
                style="background: #F59E0B; color: white; padding: 14px 32px;
                       text-decoration: none; border-radius: 8px; font-weight: bold;">
                Redefinir senha
              </a>
            </div>
            <p style="color: #666; font-size: 14px;">
              O link expira em <strong>${RESET_TOKEN_EXPIRY_HOURS} hora(s)</strong>.
            </p>
            ${ipAddress ? `<p style="color: #999; font-size: 12px;">Solicitado do IP: ${ipAddress}</p>` : ''}
            <p style="color: #999; font-size: 12px;">
              Se você não solicitou a redefinição, ignore este email. Sua senha permanece a mesma.
            </p>
          </div>
        </div>
      `,
        })

        this.logger.log(`Reset de senha enviado: userId=${user.id}`)
    }

    // ─────────────────────────────────────────
    // Redefine a senha com o token
    // ─────────────────────────────────────────
    async resetPassword(token: string, newPassword: string): Promise<void> {
        // Busca todos os tokens não usados e não expirados
        const records = await this.prisma.passwordReset.findMany({
            where: { usedAt: null, expiresAt: { gt: new Date() } },
            select: { id: true, userId: true, token: true },
        })

        let validRecord: typeof records[0] | null = null

        for (const record of records) {
            const matches = await bcrypt.compare(token, record.token)
            if (matches) { validRecord = record; break }
        }

        if (!validRecord) {
            throw new BadRequestException('Token inválido ou expirado. Solicite um novo link.')
        }

        const passwordHash = await bcrypt.hash(newPassword, 10)

        await this.prisma.$transaction([
            this.prisma.user.update({
                where: { id: validRecord.userId },
                data: { passwordHash },
            }),
            this.prisma.passwordReset.update({
                where: { id: validRecord.id },
                data: { usedAt: new Date() },
            }),
            // Revoga todos os refresh tokens do usuário
            this.prisma.refreshToken.updateMany({
                where: { userId: validRecord.userId, revokedAt: null },
                data: { revokedAt: new Date() },
            }),
        ])

        this.logger.log(`Senha redefinida: userId=${validRecord.userId}`)
    }
}