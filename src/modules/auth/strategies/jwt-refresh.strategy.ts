import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy, StrategyOptionsWithRequest } from 'passport-jwt'
import type { Request } from 'express'
import { ConfigService } from '@nestjs/config'
import type { AuthenticatedUser } from '@/common/interfaces/authenticated-user.interface'

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(private configService: ConfigService) {
    const secret = configService.get<string>('JWT_REFRESH_SECRET')
    if (!secret) throw new Error('JWT_REFRESH_SECRET não definida')

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          return request?.cookies?.['refresh_token'] ?? null
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
      passReqToCallback: true,
    } as StrategyOptionsWithRequest)
  }

  async validate(
    request: Request,
    payload: AuthenticatedUser,
  ): Promise<AuthenticatedUser & { refreshToken: string }> {
    const refreshToken = request?.cookies?.['refresh_token']

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token não encontrado')
    }

    return { ...payload, refreshToken }
  }
}
