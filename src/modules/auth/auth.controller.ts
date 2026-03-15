import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common'
import type  { Request, Response } from 'express'
import { AuthService } from './auth.service'
import { LoginDto } from './dto/login.dto'
import { JwtAuthGuard } from './guards/jwt-auth.guard'
import { JwtRefreshGuard } from './guards/jwt-auth.guard'
import { Public } from '../../common/decorators/public.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface'

// Configuração dos cookies
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
}

const ACCESS_TOKEN_MAX_AGE  = 15 * 60 * 1000        // 15 minutos
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000 // 7 dias

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ─────────────────────────────────────────
  // POST /auth/login
  // ─────────────────────────────────────────
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ipAddress = req.ip
    const userAgent = req.headers['user-agent']

    const { accessToken, refreshToken, user } = await this.authService.login(
      dto,
      ipAddress,
      userAgent,
    )

    // Define cookies HTTP-Only
    res.cookie('access_token', accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: ACCESS_TOKEN_MAX_AGE,
    })

    res.cookie('refresh_token', refreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: REFRESH_TOKEN_MAX_AGE,
    })

    return {
      user: {
        id: user.sub,
        email: user.email,
        role: user.role,
        companyId: user.companyId,
        clientId: user.clientId,
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
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = req.user as AuthenticatedUser & { refreshToken: string }

    const { accessToken, refreshToken } = await this.authService.refresh(
      user.sub,
      user.refreshToken,
      req.ip,
      req.headers['user-agent'],
    )

    res.cookie('access_token', accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: ACCESS_TOKEN_MAX_AGE,
    })

    res.cookie('refresh_token', refreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: REFRESH_TOKEN_MAX_AGE,
    })

    return { message: 'Tokens renovados com sucesso' }
  }

  // ─────────────────────────────────────────
  // POST /auth/logout
  // ─────────────────────────────────────────
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const rawRefreshToken = req.cookies?.['refresh_token']

    if (rawRefreshToken) {
      await this.authService.logout(user.sub, rawRefreshToken)
    }

    // Limpa os cookies
    res.clearCookie('access_token', COOKIE_OPTIONS)
    res.clearCookie('refresh_token', COOKIE_OPTIONS)

    return { message: 'Logout realizado com sucesso' }
  }

  // ─────────────────────────────────────────
  // GET /auth/me — retorna usuário logado
  // ─────────────────────────────────────────
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return {
      id: user.sub,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      clientId: user.clientId,
    }
  }
}