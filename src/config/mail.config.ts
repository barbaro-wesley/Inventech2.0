import { registerAs } from '@nestjs/config'

export default registerAs('mail', () => ({
  host: process.env.MAIL_HOST ?? 'smtp.gmail.com',
  port: parseInt(process.env.MAIL_PORT ?? '587', 10),
  secure: process.env.MAIL_SECURE === 'true', // true para porta 465
  user: process.env.MAIL_USER,
  password: process.env.MAIL_PASSWORD,

  // Remetente padrão
  from: {
    name: process.env.MAIL_FROM_NAME ?? 'Sistema de Manutenção',
    address: process.env.MAIL_FROM_ADDRESS ?? process.env.MAIL_USER,
  },

  // Configurações extras
  ignoreTLS: process.env.MAIL_IGNORE_TLS === 'true',
  preview: process.env.NODE_ENV === 'development', // Abre preview no browser em dev
}))