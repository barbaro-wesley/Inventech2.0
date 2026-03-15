import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { CompaniesService } from './companies.service'
import { CreateCompanyDto } from './dto/create-company.dto'
import { UpdateCompanyDto } from './dto/update-company.dto'
import { ListCompaniesDto } from './dto/list-companies.dto'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import  type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface'

@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  // ─────────────────────────────────────────
  // GET /companies
  // Apenas SUPER_ADMIN lista todas as empresas
  // ─────────────────────────────────────────
  @Get()
  @Roles(UserRole.SUPER_ADMIN)
  findAll(@Query() filters: ListCompaniesDto) {
    return this.companiesService.findAll(filters)
  }

  // ─────────────────────────────────────────
  // GET /companies/:id
  // SUPER_ADMIN vê qualquer empresa
  // COMPANY_ADMIN e COMPANY_MANAGER veem apenas a própria
  // ─────────────────────────────────────────
  @Get(':id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.COMPANY_ADMIN,
    UserRole.COMPANY_MANAGER,
  )
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.companiesService.findOne(id, currentUser)
  }

  // ─────────────────────────────────────────
  // POST /companies
  // Apenas SUPER_ADMIN cadastra empresas
  // Cria a empresa + COMPANY_ADMIN em transação
  // ─────────────────────────────────────────
  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  create(@Body() dto: CreateCompanyDto) {
    return this.companiesService.create(dto)
  }

  // ─────────────────────────────────────────
  // PATCH /companies/:id
  // SUPER_ADMIN edita qualquer empresa (incluindo status e trial)
  // COMPANY_ADMIN edita apenas dados básicos da própria empresa
  // ─────────────────────────────────────────
  @Patch(':id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.COMPANY_ADMIN,
  )
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompanyDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.companiesService.update(id, dto, currentUser)
  }

  // ─────────────────────────────────────────
  // DELETE /companies/:id
  // Apenas SUPER_ADMIN pode remover empresas
  // ─────────────────────────────────────────
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SUPER_ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.companiesService.remove(id)
  }
}