import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { AuthService } from './auth.service'
import { AuthController } from './auth.controller'
import { JwtStrategy } from './strategies/jwt.strategy'
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy'
import { LoginSecurityService } from './security/login-security.service'
import { TwoFactorService } from './security/two-factor.service'
import { EmailChannel } from '../notifications/channels/email.channel'

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}),
  ],
  providers: [
    AuthService,
    JwtStrategy,
    JwtRefreshStrategy,
    LoginSecurityService,
    TwoFactorService,
    EmailChannel,  // Para envio dos emails de 2FA e reset
  ],
  controllers: [AuthController],
  exports: [AuthService, LoginSecurityService, TwoFactorService],
})
export class AuthModule { }