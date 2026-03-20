import 'dotenv/config'; // carrega o .env antes
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx --env-file=.env ./prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL!, // ← process.env, não env() do prisma/config
  },
});