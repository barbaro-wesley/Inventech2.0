import { Module } from '@nestjs/common'
import { UsersService } from './users.service'
import { UsersController } from './users.controller'
import { UsersRepository } from './users.repository'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [AuthModule], // Importa TwoFactorService para envio de email
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
  exports: [UsersService, UsersRepository],
})
export class UsersModule { }