import { registerAs } from '@nestjs/config'

export default registerAs('telegram', () => ({
  botToken: process.env.TELEGRAM_BOT_TOKEN,
  botName: process.env.TELEGRAM_BOT_NAME ?? 'ManutencaoBot',

  // Webhook (produção) ou polling (desenvolvimento)
  useWebhook: process.env.TELEGRAM_USE_WEBHOOK === 'true',
  webhookUrl: process.env.TELEGRAM_WEBHOOK_URL,

  // Mensagens padrão
  parseMode: 'HTML' as const, // HTML ou Markdown
}))