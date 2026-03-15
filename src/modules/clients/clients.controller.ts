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
import { ClientsService } from './clients.service'
import { CreateClientDto } from './dto/create-client.dto'
import { UpdateClientDto } from './dto/update-client.dto'
import { ListClientsDto } from './dto/list-clients.dto'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import type  { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface'

@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  // ─────────────────────────────────────────
  // GET /clients
  // Empresa vê todos os seus clientes
  // Usuário de cliente vê apenas o seu
  // ─────────────────────────────────────────
  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.COMPANY_ADMIN,
    UserRole.COMPANY_MANAGER,
    UserRole.TECHNICIAN,
  )
  findAll(
    @Query() filters: ListClientsDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.clientsService.findAll(currentUser, filters)
  }

  // ─────────────────────────────────────────
  // GET /clients/:id
  // ─────────────────────────────────────────
  @Get(':id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.COMPANY_ADMIN,
    UserRole.COMPANY_MANAGER,
    UserRole.TECHNICIAN,
    UserRole.CLIENT_ADMIN,
    UserRole.CLIENT_USER,
    UserRole.CLIENT_VIEWER,
  )
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.clientsService.findOne(id, currentUser)
  }

  // ─────────────────────────────────────────
  // POST /clients
  // Apenas empresa de manutenção cria clientes
  // ─────────────────────────────────────────
  @Post()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.COMPANY_ADMIN,
    UserRole.COMPANY_MANAGER,
  )
  create(
    @Body() dto: CreateClientDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.clientsService.create(dto, currentUser)
  }

  // ─────────────────────────────────────────
  // PATCH /clients/:id
  // ─────────────────────────────────────────
  @Patch(':id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.COMPANY_ADMIN,
    UserRole.COMPANY_MANAGER,
  )
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.clientsService.update(id, dto, currentUser)
  }

  // ─────────────────────────────────────────
  // DELETE /clients/:id
  // Bloqueia se houver equipamentos ou OS vinculados
  // ─────────────────────────────────────────
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.COMPANY_ADMIN,
  )
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.clientsService.remove(id, currentUser)
  }
}