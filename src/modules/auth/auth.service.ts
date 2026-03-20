import {
    Injectable,
    UnauthorizedException,
    Logger,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { UserStatus, RefreshToken } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import { PrismaService } from '../../prisma/prisma.service'
import { LoginDto } from './dto/login.dto'
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface'
import { LoginSecurityService } from './security/login-security.service'
import { TwoFactorService } from './security/two-factor.service'

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name)

    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
        private configService: ConfigService,
        private loginSecurityService: LoginSecurityService,
        private twoFactorService: TwoFactorService,
    ) { }

    // ─────────────────────────────────────────
    // Login com auditoria e bloqueio
    // ─────────────────────────────────────────
    async login(dto: LoginDto, ipAddress?: string, userAgent?: string) {
        // 1. Verifica bloqueio antes de qualquer coisa
        const blockCheck = await this.loginSecurityService.checkIsBlocked(
            dto.email, ipAddress ?? '',
        )

        if (blockCheck.blocked) {
            // Registra tentativa bloqueada
            await this.loginSecurityService.recordAttempt({
                email: dto.email,
                success: false,
                ipAddress: ipAddress ?? '',
                userAgent,
                failReason: 'ACCOUNT_BLOCKED',
            })
            throw new UnauthorizedException(blockCheck.reason)
        }

        // 2. Busca usuário
        const user = await this.prisma.user.findUnique({
            where: { email: dto.email },
        })

        if (!user) {
            await this.loginSecurityService.recordAttempt({
                email: dto.email,
                success: false,
                ipAddress: ipAddress ?? '',
                userAgent,
                failReason: 'USER_NOT_FOUND',
            })
            throw new UnauthorizedException('Credenciais inválidas')
        }

        // 3. Verifica status
        if (user.status === UserStatus.INACTIVE || user.status === UserStatus.SUSPENDED) {
            await this.loginSecurityService.recordAttempt({
                email: dto.email,
                userId: user.id,
                success: false,
                ipAddress: ipAddress ?? '',
                userAgent,
                failReason: `ACCOUNT_${user.status}`,
            })
            throw new UnauthorizedException('Usuário inativo ou suspenso')
        }

        if (user.status === 'UNVERIFIED' as any) {
            throw new UnauthorizedException(
                'Email não verificado. Verifique sua caixa de entrada.',
            )
        }

        // 4. Valida senha
        const passwordValid = await bcrypt.compare(dto.password, user.passwordHash)

        if (!passwordValid) {
            await this.loginSecurityService.recordAttempt({
                email: dto.email,
                userId: user.id,
                success: false,
                ipAddress: ipAddress ?? '',
                userAgent,
                failReason: 'WRONG_PASSWORD',
            })
            throw new UnauthorizedException('Credenciais inválidas')
        }

        // 5. Gera tokens
        const payload: AuthenticatedUser = {
            sub: user.id,
            email: user.email,
            role: user.role,
            companyId: user.companyId,
            clientId: user.clientId,
        }

        const { accessToken, refreshToken } = await this.generateTokens(payload)
        await this.saveRefreshToken(user.id, refreshToken, ipAddress, userAgent)

        // 6. Atualiza último login + registra sucesso
        await Promise.all([
            this.prisma.user.update({
                where: { id: user.id },
                data: { lastLoginAt: new Date(), lastLoginIp: ipAddress },
            }),
            this.loginSecurityService.recordAttempt({
                email: dto.email,
                userId: user.id,
                success: true,
                ipAddress: ipAddress ?? '',
                userAgent,
            }),
        ])

        this.logger.log(`Login: ${user.email} | IP: ${ipAddress}`)
        return { accessToken, refreshToken, user: payload }
    }

    // ─────────────────────────────────────────
    // Refresh com rotação de token
    // ─────────────────────────────────────────
    async refresh(
        userId: string,
        rawRefreshToken: string,
        ipAddress?: string,
        userAgent?: string,
    ) {
        const storedTokens = await this.prisma.refreshToken.findMany({
            where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
        })

        if (!storedTokens.length) {
            throw new UnauthorizedException('Sessão expirada. Faça login novamente')
        }

        let validTokenRecord: RefreshToken | null = null
        for (const record of storedTokens) {
            const matches = await bcrypt.compare(rawRefreshToken, record.tokenHash)
            if (matches) { validTokenRecord = record; break }
        }

        if (!validTokenRecord) {
            await this.revokeAllUserTokens(userId)
            this.logger.warn(`Possível reutilização de refresh token: userId=${userId}`)
            throw new UnauthorizedException('Sessão inválida. Faça login novamente')
        }

        await this.prisma.refreshToken.update({
            where: { id: validTokenRecord.id },
            data: { revokedAt: new Date() },
        })

        const user = await this.prisma.user.findUnique({ where: { id: userId } })
        if (!user || user.status !== UserStatus.ACTIVE) {
            throw new UnauthorizedException('Usuário inativo')
        }

        const payload: AuthenticatedUser = {
            sub: user.id,
            email: user.email,
            role: user.role,
            companyId: user.companyId,
            clientId: user.clientId,
        }

        const { accessToken, refreshToken } = await this.generateTokens(payload)
        await this.saveRefreshToken(user.id, refreshToken, ipAddress, userAgent)

        return { accessToken, refreshToken }
    }

    // ─────────────────────────────────────────
    // Logout
    // ─────────────────────────────────────────
    async logout(userId: string, rawRefreshToken: string) {
        const storedTokens = await this.prisma.refreshToken.findMany({
            where: { userId, revokedAt: null },
        })

        for (const record of storedTokens) {
            const matches = await bcrypt.compare(rawRefreshToken, record.tokenHash)
            if (matches) {
                await this.prisma.refreshToken.update({
                    where: { id: record.id },
                    data: { revokedAt: new Date() },
                })
                break
            }
        }
    }

    // ─────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────
    private async generateTokens(payload: AuthenticatedUser) {
        const [accessToken, refreshToken] = await Promise.all([
            this.jwtService.signAsync(payload, {
                secret: this.configService.get('app.jwtAccessSecret'),
                expiresIn: this.configService.get('app.jwtAccessExpiresIn', '15m'),
            }),
            this.jwtService.signAsync(payload, {
                secret: this.configService.get('app.jwtRefreshSecret'),
                expiresIn: this.configService.get('app.jwtRefreshExpiresIn', '7d'),
            }),
        ])
        return { accessToken, refreshToken }
    }

    private async saveRefreshToken(
        userId: string,
        rawToken: string,
        ipAddress?: string,
        userAgent?: string,
    ) {
        const tokenHash = await bcrypt.hash(rawToken, 10)
        const expiresAt = new Date()
        expiresAt.setDate(expiresAt.getDate() + 7)

        await this.prisma.refreshToken.create({
            data: { userId, tokenHash, ipAddress, userAgent, expiresAt },
        })
    }

    private async revokeAllUserTokens(userId: string) {
        await this.prisma.refreshToken.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: new Date() },
        })
    }
}