import { SetMetadata } from '@nestjs/common'

export const RATE_LIMIT_KEY = 'rate_limit'

export interface RateLimitOptions {
    limit: number    // Número máximo de requests
    ttl: number      // Janela de tempo em segundos
    message?: string // Mensagem de erro customizada
}

/**
 * Define um rate limit customizado para uma rota específica.
 * Sobrescreve o limite global.
 *
 * @example
 * @RateLimit({ limit: 5, ttl: 60 }) // 5 requests por minuto
 * @Post('login')
 */
export const RateLimit = (options: RateLimitOptions) =>
    SetMetadata(RATE_LIMIT_KEY, options)

/**
 * Marca uma rota como sem rate limit.
 */
export const NoRateLimit = () => SetMetadata(RATE_LIMIT_KEY, { skip: true })

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'

@Injectable()
export class RateLimitGuard implements CanActivate {
    constructor(private reflector: Reflector) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const skip = this.reflector.getAllAndOverride<{ skip?: boolean }>(
            RATE_LIMIT_KEY,
            [context.getHandler(), context.getClass()]
        )

        if (skip?.skip) {
            return true
        }

        const options = this.reflector.getAllAndOverride<RateLimitOptions>(
            RATE_LIMIT_KEY,
            [context.getHandler(), context.getClass()]
        )

        // TODO: Implement actual rate-limiting logic using Redis or Throttler here
        // e.g., using options.limit and options.ttl

        return true // Default allowing requests until implemented
    }
}