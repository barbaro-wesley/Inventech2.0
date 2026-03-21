import {
  Controller, Post, Get, Body, Res, Req,
  HttpCode, HttpStatus, UseGuards, Param, ParseUUIDPipe,
} from '@nestjs/common'
import type { Request, Response } from 'express'
import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator'
import { AuthService } from './auth.service'
import { LoginDto } from './dto/login.dto'
import { JwtRefreshGuard } from './guards/jwt-auth.guard'
import { Public } from '../../common/decorators/public.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface'
import { TwoFactorService } from './security/two-factor.service'
import { LoginSecurityService } from './security/login-security.service'
import { RateLimit } from '../../common/decorators/rate-limit.decorator'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { ApiObjectResponse, ApiErrorResponses, ApiRateLimitException } from '../../common/swagger/Swagger.decorators'

class ForgotPasswordDto {
  @IsEmail()
  email: string
}

class ResetPasswordDto {
  @IsString()
  token: string

  @IsString()
  @MinLength(6)
  newPassword: string
}

class VerifyEmailDto {
  @IsString()
  token: string
}

class TwoFactorVerifyDto {
  @IsString()
  code: string
}

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
}
const ACCESS_MAX_AGE = 15 * 60 * 1000
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60 * 1000

@ApiTags('Auth')
@ApiBearerAuth('JWT')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly twoFactorService: TwoFactorService,
    private readonly loginSecurityService: LoginSecurityService,
  ) { }

  // ─────────────────────────────────────────
  // POST /auth/login
  // ─────────────────────────────────────────
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 5, ttl: 60, message: 'Muitas tentativas de login. Aguarde {{ttl}} segundos.' })
  @ApiOperation({ summary: 'Login', description: 'Autentica o usuário e seta cookies HTTP-Only com access_token e refresh_token' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, user } = await this.authService.login(
      dto, req.ip, req.headers['user-agent'],
    )

    res.cookie('access_token', accessToken, { ...COOKIE_OPTIONS, maxAge: ACCESS_MAX_AGE })
    res.cookie('refresh_token', refreshToken, { ...COOKIE_OPTIONS, maxAge: REFRESH_MAX_AGE })

    return {
      user: {
        id: user.sub, email: user.email,
        role: user.role, companyId: user.companyId, clientId: user.clientId,
      },
    }
  }

  // ─────────────────────────────────────────
  // POST /auth/refresh
  // ─────────────────────────────────────────
  @Public()
  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renovar tokens', description: 'Renova access_token e refresh_token via rotação de refresh token' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = req.user as AuthenticatedUser & { refreshToken: string }
    const { accessToken, refreshToken } = await this.authService.refresh(
      user.sub, user.refreshToken, req.ip, req.headers['user-agent'],
    )

    res.cookie('access_token', accessToken, { ...COOKIE_OPTIONS, maxAge: ACCESS_MAX_AGE })
    res.cookie('refresh_token', refreshToken, { ...COOKIE_OPTIONS, maxAge: REFRESH_MAX_AGE })

    return { message: 'Tokens renovados com sucesso' }
  }

  // ─────────────────────────────────────────
  // POST /auth/logout
  // ─────────────────────────────────────────
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout', description: 'Revoga o refresh token e limpa os cookies' })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const rawRefreshToken = req.cookies?.['refresh_token']
    if (rawRefreshToken) await this.authService.logout(user.sub, rawRefreshToken)

    res.clearCookie('access_token', COOKIE_OPTIONS)
    res.clearCookie('refresh_token', COOKIE_OPTIONS)

    return { message: 'Logout realizado com sucesso' }
  }

  // ─────────────────────────────────────────
  // GET /auth/me
  // ─────────────────────────────────────────
  @Get('me')
  @ApiOperation({ summary: 'Usuário logado', description: 'Retorna os dados do usuário autenticado' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return {
      id: user.sub, email: user.email,
      role: user.role, companyId: user.companyId, clientId: user.clientId,
    }
  }

  // ─────────────────────────────────────────
  // GET /auth/login-history — histórico de logins
  // ─────────────────────────────────────────
  @Get('login-history')
    @ApiOperation({ summary: 'Histórico de logins', description: 'Retorna os últimos 20 acessos com IP e geolocalização' })
  getLoginHistory(@CurrentUser() user: AuthenticatedUser) {
    return this.loginSecurityService.getLoginHistory(user.sub)
}

// ─────────────────────────────────────────
// 2FA — Verificação em duas etapas
// ─────────────────────────────────────────

// POST /auth/2fa/send — solicita código 2FA
@Post('2fa/send')
@HttpCode(HttpStatus.OK)
@RateLimit({ limit: 3, ttl: 300, message: 'Muitas solicitações de código. Aguarde {{ttl}} segundos.' })
@ApiOperation({ summary: 'Enviar código 2FA', description: 'Envia código de 6 dígitos para o email do usuário' })
async send2FA(
  @CurrentUser() user: AuthenticatedUser,
  @Req() req: Request,
) {
  await this.twoFactorService.sendTwoFactorCode(user.sub, 'LOGIN', req.ip)
  return { message: 'Código enviado para o seu email' }
}

// POST /auth/2fa/verify — valida código 2FA
@Public()
@Post('2fa/verify')
@HttpCode(HttpStatus.OK)
@ApiOperation({ summary: 'Verificar código 2FA', description: 'Valida o código 2FA enviado por email' })
async verify2FA(
  @Body() dto: TwoFactorVerifyDto & { userId: string },
) {
  await this.twoFactorService.verifyCode(dto.userId, dto.code, 'LOGIN')
  return { verified: true }
}

// ─────────────────────────────────────────
// Email — verificação e reset de senha
// ─────────────────────────────────────────

// POST /auth/verify-email — verifica token de email
@Public()
@Post('verify-email')
@HttpCode(HttpStatus.OK)
@ApiOperation({ summary: 'Verificar email', description: 'Confirma o email do usuário com o token recebido' })
async verifyEmail(@Body() dto: VerifyEmailDto) {
  await this.twoFactorService.verifyEmailToken(dto.token)
  return { message: 'Email verificado com sucesso! Você já pode fazer login.' }
}

// POST /auth/forgot-password — solicita reset de senha
@Public()
@Post('forgot-password')
@HttpCode(HttpStatus.OK)
@RateLimit({ limit: 3, ttl: 300, message: 'Muitas solicitações de reset. Aguarde {{ttl}} segundos.' })
@ApiOperation({ summary: 'Solicitar reset de senha', description: 'Envia link de redefinição para o email informado (resposta genérica por segurança)' })
async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
  // Não revela se o email existe ou não (segurança)
  await this.twoFactorService.sendPasswordReset(dto.email, req.ip)
  return {
    message: 'Se o email estiver cadastrado, você receberá as instruções em breve.',
  }
}

// POST /auth/reset-password — redefine senha com token
@Public()
@Post('reset-password')
@HttpCode(HttpStatus.OK)
@ApiOperation({ summary: 'Redefinir senha', description: 'Redefine a senha com o token recebido por email' })
async resetPassword(@Body() dto: ResetPasswordDto) {
  await this.twoFactorService.resetPassword(dto.token, dto.newPassword)
  return { message: 'Senha redefinida com sucesso! Faça login com a nova senha.' }
}
}