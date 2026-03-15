import {
    Injectable,
    UnauthorizedException,
    Logger,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { UserStatus } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import { PrismaService } from '../../prisma/prisma.service'
import { LoginDto } from './dto/login.dto'
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface'

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name)

    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
        private configService: ConfigService,
    ) { }

    // ─────────────────────────────────────────
    // Login
    // ─────────────────────────────────────────
    async login(dto: LoginDto, ipAddress?: string, userAgent?: string) {
        // 1. Busca o usuário
        const user = await this.prisma.user.findUnique({
            where: { email: dto.email },
        })

        if (!user) {
            throw new UnauthorizedException('Credenciais inválidas')
        }

        // 2. Verifica status
        if (user.status !== UserStatus.ACTIVE) {
            throw new UnauthorizedException('Usuário inativo ou suspenso')
        }

        // 3. Valida senha
        const passwordValid = await bcrypt.compare(dto.password, user.passwordHash)

        if (!passwordValid) {
            throw new UnauthorizedException('Credenciais inválidas')
        }

        // 4. Gera tokens
        const payload: AuthenticatedUser = {
            sub: user.id,
            email: user.email,
            role: user.role,
            companyId: user.companyId,
            clientId: user.clientId,
        }

        const { accessToken, refreshToken } = await this.generateTokens(payload)

        // 5. Persiste hash do refresh token
        await this.saveRefreshToken(user.id, refreshToken, ipAddress, userAgent)

        // 6. Atualiza último login
        await this.prisma.user.update({
            where: { id: user.id },
            data: {
                lastLoginAt: new Date(),
                lastLoginIp: ipAddress,
            },
        })

        this.logger.log(`Login: ${user.email} | IP: ${ipAddress}`)

        return { accessToken, refreshToken, user: payload }
    }

    // ─────────────────────────────────────────
    // Refresh — rotação de tokens
    // ─────────────────────────────────────────
    async refresh(
        userId: string,
        rawRefreshToken: string,
        ipAddress?: string,
        userAgent?: string,
    ) {
        // 1. Busca todos os refresh tokens válidos do usuário
        const storedTokens = await this.prisma.refreshToken.findMany({
            where: {
                userId,
                revokedAt: null,
                expiresAt: { gt: new Date() },
            },
        })

        if (!storedTokens.length) {
            throw new UnauthorizedException('Sessão expirada. Faça login novamente')
        }

        // 2. Verifica qual token bate com o hash
        let validTokenRecord: (typeof storedTokens)[0] | null = null

        for (const record of storedTokens) {
            const matches = await bcrypt.compare(rawRefreshToken, record.tokenHash)
            if (matches) {
                validTokenRecord = record
                break
            }
        }

        if (!validTokenRecord) {
            // Possível reutilização de token — revoga todos (ataque detectado)
            await this.revokeAllUserTokens(userId)
            this.logger.warn(`Possível reutilização de refresh token: userId=${userId}`)
            throw new UnauthorizedException('Sessão inválida. Faça login novamente')
        }

        // 3. Revoga o token atual
        await this.prisma.refreshToken.update({
            where: { id: validTokenRecord.id },
            data: { revokedAt: new Date() },
        })

        // 4. Busca dados atualizados do usuário
        const user = await this.prisma.user.findUnique({ where: { id: userId } })

        if (!user || user.status !== UserStatus.ACTIVE) {
            throw new UnauthorizedException('Usuário inativo')
        }

        // 5. Gera novos tokens
        const payload: AuthenticatedUser = {
            sub: user.id,
            email: user.email,
            role: user.role,
            companyId: user.companyId,
            clientId: user.clientId,
        }

        const { accessToken, refreshToken } = await this.generateTokens(payload)

        // 6. Persiste novo refresh token
        await this.saveRefreshToken(user.id, refreshToken, ipAddress, userAgent)

        return { accessToken, refreshToken }
    }

    // ─────────────────────────────────────────
    // Logout — revoga o refresh token atual
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
    // Helpers privados
    // ─────────────────────────────────────────
    private async generateTokens(payload: AuthenticatedUser) {
        const [accessToken, refreshToken] = await Promise.all([
            this.jwtService.signAsync(payload, {
                secret: this.configService.get('JWT_ACCESS_SECRET'),
                expiresIn: this.configService.get('JWT_ACCESS_EXPIRES_IN', '15m'),
            }),
            this.jwtService.signAsync(payload, {
                secret: this.configService.get('JWT_REFRESH_SECRET'),
                expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', '7d'),
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
        expiresAt.setDate(expiresAt.getDate() + 7) // 7 dias

        await this.prisma.refreshToken.create({
            data: {
                userId,
                tokenHash,
                ipAddress,
                userAgent,
                expiresAt,
            },
        })
    }

    private async revokeAllUserTokens(userId: string) {
        await this.prisma.refreshToken.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: new Date() },
        })
    }
}