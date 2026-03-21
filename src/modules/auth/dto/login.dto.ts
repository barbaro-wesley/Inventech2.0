import { IsEmail, IsString, MinLength } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class LoginDto {
  @ApiProperty({
    example: 'admin@ariaengenharia.com',
    description: 'Email do usuário cadastrado no sistema',
  })
  @IsEmail()
  email: string

  @ApiProperty({
    example: 'Admin@123',
    description: 'Senha do usuário (mínimo 6 caracteres)',
    minLength: 6,
  })
  @IsString()
  @MinLength(6)
  password: string
}