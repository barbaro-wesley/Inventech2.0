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