import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios from 'axios'
import { PrismaService } from '../../../prisma/prisma.service'

// Configurações de bloqueio
const MAX_ATTEMPTS = 5                  // Tentativas antes de bloquear
const BLOCK_DURATION_MINUTES = 15       // Tempo de bloqueio em minutos
const ATTEMPT_WINDOW_MINUTES = 10       // Janela de tempo para contar tentativas
const MAX_IP_ATTEMPTS = 20              // Tentativas por IP antes de bloquear o IP

export interface GeoLocation {
    country?: string
    region?: string
    city?: string
    latitude?: number
    longitude?: number
}

export interface LoginAuditData {
    email: string
    userId?: string
    success: boolean
    ipAddress: string
    userAgent?: string
    failReason?: string
}

@Injectable()
export class LoginSecurityService {
    private readonly logger = new Logger(LoginSecurityService.name)

    constructor(
        private prisma: PrismaService,
        private configService: ConfigService,
    ) { }

    // ─────────────────────────────────────────
    // Verifica se o usuário/IP está bloqueado
    // Chama antes de validar a senha
    // ─────────────────────────────────────────
    async checkIsBlocked(email: string, ipAddress: string): Promise<{
        blocked: boolean
        reason?: string
        expiresAt?: Date
    }> {
        const now = new Date()

        // 1. Busca usuário e verifica bloqueio de conta
        const user = await this.prisma.user.findUnique({
            where: { email },
            select: { id: true, status: true },
        })

        if (user?.status === 'BLOCKED') {
            // Verifica se tem bloqueio ativo
            const activeBlock = await this.prisma.accountBlock.findFirst({
                where: {
                    userId: user.id,
                    unblocked: false,
                    expiresAt: { gt: now },
                },
                orderBy: { blockedAt: 'desc' },
                select: { expiresAt: true, reason: true },
            })

            if (activeBlock) {
                return {
                    blocked: true,
                    reason: `Conta bloqueada temporariamente. Tente novamente após ${activeBlock.expiresAt.toLocaleTimeString('pt-BR')}`,
                    expiresAt: activeBlock.expiresAt,
                }
            }

            // Bloqueio expirou — desbloqueia automaticamente
            if (user) await this.autoUnblock(user.id)
        }

        // 2. Verifica tentativas excessivas por IP
        const windowStart = new Date(now.getTime() - ATTEMPT_WINDOW_MINUTES * 60 * 1000)
        const ipAttempts = await this.prisma.loginAttempt.count({
            where: {
                ipAddress,
                success: false,
                createdAt: { gte: windowStart },
            },
        })

        if (ipAttempts >= MAX_IP_ATTEMPTS) {
            return {
                blocked: true,
                reason: `Muitas tentativas deste endereço IP. Tente novamente em ${ATTEMPT_WINDOW_MINUTES} minutos.`,
            }
        }

        return { blocked: false }
    }

    // ─────────────────────────────────────────
    // Registra tentativa de login + geolocalização
    // ─────────────────────────────────────────
    async recordAttempt(data: LoginAuditData): Promise<void> {
        const geo = await this.getGeoLocation(data.ipAddress)

        await this.prisma.loginAttempt.create({
            data: {
                email: data.email,
                userId: data.userId,
                success: data.success,
                ipAddress: data.ipAddress,
                userAgent: data.userAgent,
                failReason: data.failReason,
                country: geo.country,
                region: geo.region,
                city: geo.city,
                latitude: geo.latitude,
                longitude: geo.longitude,
            },
        })

        // Se falhou, verifica se deve bloquear
        if (!data.success && data.userId) {
            await this.checkAndBlockIfNeeded(data.userId, data.ipAddress)
        }
    }

    // ─────────────────────────────────────────
    // Conta falhas recentes e bloqueia se necessário
    // ─────────────────────────────────────────
    private async checkAndBlockIfNeeded(userId: string, ipAddress: string): Promise<void> {
        const windowStart = new Date(Date.now() - ATTEMPT_WINDOW_MINUTES * 60 * 1000)

        const recentFailures = await this.prisma.loginAttempt.count({
            where: {
                userId,
                success: false,
                createdAt: { gte: windowStart },
            },
        })

        if (recentFailures >= MAX_ATTEMPTS) {
            const expiresAt = new Date(Date.now() + BLOCK_DURATION_MINUTES * 60 * 1000)

            // Cria bloqueio
            await this.prisma.accountBlock.create({
                data: {
                    userId,
                    ipAddress,
                    reason: `${recentFailures} tentativas de login falhas em ${ATTEMPT_WINDOW_MINUTES} minutos`,
                    expiresAt,
                },
            })

            // Atualiza status do usuário
            await this.prisma.user.update({
                where: { id: userId },
                data: { status: 'BLOCKED' },
            })

            this.logger.warn(
                `Conta bloqueada: userId=${userId} | IP=${ipAddress} | ` +
                `${recentFailures} tentativas | Expira: ${expiresAt.toISOString()}`,
            )
        }
    }

    // ─────────────────────────────────────────
    // Desbloqueia automaticamente após expiração
    // ─────────────────────────────────────────
    private async autoUnblock(userId: string): Promise<void> {
        await this.prisma.user.update({
            where: { id: userId },
            data: { status: 'ACTIVE' },
        })

        await this.prisma.accountBlock.updateMany({
            where: { userId, unblocked: false },
            data: { unblocked: true, unblockedAt: new Date() },
        })

        this.logger.log(`Conta desbloqueada automaticamente: userId=${userId}`)
    }

    // ─────────────────────────────────────────
    // Busca geolocalização do IP
    // Usa ip-api.com (gratuito, sem chave, limite 45 req/min)
    // ─────────────────────────────────────────
    async getGeoLocation(ipAddress: string): Promise<GeoLocation> {
        // Ignora IPs locais
        const localIps = ['127.0.0.1', '::1', 'localhost', '::ffff:127.0.0.1']
        if (localIps.includes(ipAddress) || ipAddress.startsWith('192.168.') || ipAddress.startsWith('10.')) {
            return { country: 'Local', city: 'Development' }
        }

        try {
            const response = await axios.get(
                `http://ip-api.com/json/${ipAddress}?fields=status,country,regionName,city,lat,lon`,
                { timeout: 3000 },
            )

            if (response.data.status === 'success') {
                return {
                    country: response.data.country,
                    region: response.data.regionName,
                    city: response.data.city,
                    latitude: response.data.lat,
                    longitude: response.data.lon,
                }
            }
        } catch {
            this.logger.debug(`Geolocalização indisponível para IP: ${ipAddress}`)
        }

        return {}
    }

    // ─────────────────────────────────────────
    // Histórico de logins do usuário
    // ─────────────────────────────────────────
    async getLoginHistory(userId: string, limit = 20) {
        return this.prisma.loginAttempt.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: limit,
            select: {
                id: true,
                success: true,
                ipAddress: true,
                country: true,
                city: true,
                region: true,
                userAgent: true,
                failReason: true,
                createdAt: true,
            },
        })
    }

    // ─────────────────────────────────────────
    // Admin desbloqueia conta manualmente
    // ─────────────────────────────────────────
    async unblockAccount(userId: string, adminId: string): Promise<void> {
        await this.prisma.user.update({
            where: { id: userId },
            data: { status: 'ACTIVE' },
        })

        await this.prisma.accountBlock.updateMany({
            where: { userId, unblocked: false },
            data: { unblocked: true, unblockedAt: new Date(), unblockedBy: adminId },
        })

        this.logger.log(`Conta desbloqueada manualmente: userId=${userId} | admin=${adminId}`)
    }
}