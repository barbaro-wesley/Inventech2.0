import { UserRole } from '@prisma/client'

export interface AuthenticatedUser {
  sub: string         // userId
  email: string
  role: UserRole
  companyId: string | null
  clientId: string | null
}