// prisma/seed.ts
// Executa com: npx prisma db seed
//
// Cria:
//   - A Platform (registro raiz do sistema)
//   - O primeiro SUPER_ADMIN (dono da plataforma)

import 'dotenv/config'
import { PrismaClient, UserRole } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import { PrismaPg } from 'node_modules/@prisma/adapter-pg/dist/index.mjs'
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })
async function main() {
  console.log('🌱 Iniciando seed...')

  // ── 1. Platform ──────────────────────────────────────────
  const platform = await prisma.platform.upsert({
    where: { id: 'platform-seed-id' },
    update: {},
    create: {
      id: 'platform-seed-id',
      name: 'Plataforma de Manutenção',
    },
  })
  console.log(`✓ Platform: ${platform.name}`)

  // ── 2. SUPER_ADMIN ───────────────────────────────────────
  const email = process.env.SEED_ADMIN_EMAIL ?? 'wesleybarbaro09@gmail.com'
  const password = process.env.SEED_ADMIN_PASSWORD ?? '#$wes.bar12#$'
  const passwordHash = await bcrypt.hash(password, 10)

  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      name: 'Super Administrador',
      email,
      passwordHash,
      role: UserRole.SUPER_ADMIN,
    },
  })

  console.log(`✓ SUPER_ADMIN: ${admin.email}`)
  console.log(`  Senha: ${password}`)
  console.log('')
  console.log('✅ Seed concluído!')
  console.log('')
  console.log('⚠️  Troque a senha do SUPER_ADMIN após o primeiro login!')
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })