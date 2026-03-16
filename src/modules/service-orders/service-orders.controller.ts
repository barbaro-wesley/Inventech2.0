import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, ParseUUIDPipe,
  HttpCode, HttpStatus,
} from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { ServiceOrdersService } from './service-orders.service'
import { CommentsService } from './comments/comments.service'
import { TasksService } from './tasks/tasks.service'
import {
  CreateServiceOrderDto,
  UpdateServiceOrderDto,
  UpdateServiceOrderStatusDto,
  AssignTechnicianDto,
  ListServiceOrdersDto,
  ListAvailableServiceOrdersDto,
} from './dto/service-order.dto'
import { CreateCommentDto, UpdateCommentDto } from './comments/dto/comment.dto'
import { CreateTaskDto, UpdateTaskDto, ReorderTasksDto } from './tasks/dto/task.dto'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface'

@Controller('clients/:clientId/service-orders')
export class ServiceOrdersController {
  constructor(
    private readonly serviceOrdersService: ServiceOrdersService,
    private readonly commentsService: CommentsService,
    private readonly tasksService: TasksService,
  ) { }

  // ─────────────────────────────────────────
  // Painel de OS disponíveis para assumir
  // Rota fora do escopo de cliente — acessível por toda a empresa
  // GET /service-orders/available
  // ─────────────────────────────────────────
  @Get('available')
  @Roles(
    UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN,
    UserRole.COMPANY_MANAGER, UserRole.TECHNICIAN,
  )
  findAvailable(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Query() filters: ListAvailableServiceOrdersDto,
    @CurrentUser() cu: AuthenticatedUser,
  ) {
    return this.serviceOrdersService.findAvailable(cu.companyId!, filters, cu)
  }

  // ─────────────────────────────────────────
  // OS — CRUD principal
  // ─────────────────────────────────────────

  @Get()
  @Roles(
    UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER,
    UserRole.TECHNICIAN, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER, UserRole.CLIENT_VIEWER,
  )
  findAll(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Query() filters: ListServiceOrdersDto,
    @CurrentUser() cu: AuthenticatedUser,
  ) {
    return this.serviceOrdersService.findAll(clientId, cu.companyId!, filters, cu)
  }

  @Get(':id')
  @Roles(
    UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER,
    UserRole.TECHNICIAN, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER, UserRole.CLIENT_VIEWER,
  )
  findOne(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() cu: AuthenticatedUser,
  ) {
    return this.serviceOrdersService.findOne(id, clientId, cu.companyId!, cu)
  }

  @Post()
  @Roles(
    UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER,
    UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER,
  )
  create(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Body() dto: CreateServiceOrderDto,
    @CurrentUser() cu: AuthenticatedUser,
  ) {
    return this.serviceOrdersService.create(dto, clientId, cu.companyId!, cu)
  }

  @Patch(':id')
  @Roles(
    UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN,
    UserRole.COMPANY_MANAGER, UserRole.TECHNICIAN,
  )
  update(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceOrderDto,
    @CurrentUser() cu: AuthenticatedUser,
  ) {
    return this.serviceOrdersService.update(id, dto, clientId, cu.companyId!, cu)
  }

  // PATCH /clients/:clientId/service-orders/:id/status
  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @Roles(
    UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER,
    UserRole.TECHNICIAN, UserRole.CLIENT_ADMIN,
  )
  updateStatus(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceOrderStatusDto,
    @CurrentUser() cu: AuthenticatedUser,
  ) {
    return this.serviceOrdersService.updateStatus(id, dto, clientId, cu.companyId!, cu)
  }

  // POST /clients/:clientId/service-orders/:id/assume
  // Técnico assume a OS do painel
  @Post(':id/assume')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.TECHNICIAN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER, UserRole.SUPER_ADMIN)
  assume(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() cu: AuthenticatedUser,
  ) {
    return this.serviceOrdersService.assumeServiceOrder(id, clientId, cu.companyId!, cu)
  }

  // ─────────────────────────────────────────
  // Técnicos da OS (múltiplos)
  // ─────────────────────────────────────────

  // POST /clients/:clientId/service-orders/:id/technicians
  @Post(':id/technicians')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER)
  addTechnician(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignTechnicianDto,
    @CurrentUser() cu: AuthenticatedUser,
  ) {
    return this.serviceOrdersService.addTechnician(id, dto, clientId, cu.companyId!)
  }

  // DELETE /clients/:clientId/service-orders/:id/technicians/:technicianId
  @Delete(':id/technicians/:technicianId')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER)
  removeTechnician(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('technicianId', ParseUUIDPipe) technicianId: string,
    @CurrentUser() cu: AuthenticatedUser,
  ) {
    return this.serviceOrdersService.removeTechnician(id, technicianId, clientId, cu.companyId!)
  }

  // ─────────────────────────────────────────
  // Comentários
  // ─────────────────────────────────────────

  @Post(':id/comments')
  @Roles(
    UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER,
    UserRole.TECHNICIAN, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER,
  )
  createComment(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('id', ParseUUIDPipe) serviceOrderId: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() cu: AuthenticatedUser,
  ) {
    return this.commentsService.create(serviceOrderId, dto, clientId, cu.companyId!, cu)
  }

  @Patch(':osId/comments/:commentId')
  @Roles(
    UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER,
    UserRole.TECHNICIAN, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER,
  )
  updateComment(
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Body() dto: UpdateCommentDto,
    @CurrentUser() cu: AuthenticatedUser,
  ) {
    return this.commentsService.update(commentId, dto, cu)
  }

  @Delete(':osId/comments/:commentId')
  @HttpCode(HttpStatus.OK)
  @Roles(
    UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER,
    UserRole.TECHNICIAN, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER,
  )
  removeComment(
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @CurrentUser() cu: AuthenticatedUser,
  ) {
    return this.commentsService.remove(commentId, cu)
  }

  // ─────────────────────────────────────────
  // Tasks Kanban
  // ─────────────────────────────────────────

  @Get(':id/tasks')
  @Roles(
    UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER,
    UserRole.TECHNICIAN, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER, UserRole.CLIENT_VIEWER,
  )
  findTasks(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('id', ParseUUIDPipe) serviceOrderId: string,
    @CurrentUser() cu: AuthenticatedUser,
  ) {
    return this.tasksService.findAll(serviceOrderId, clientId, cu.companyId!)
  }

  @Post(':id/tasks')
  @Roles(
    UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN,
    UserRole.COMPANY_MANAGER, UserRole.TECHNICIAN,
  )
  createTask(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('id', ParseUUIDPipe) serviceOrderId: string,
    @Body() dto: CreateTaskDto,
    @CurrentUser() cu: AuthenticatedUser,
  ) {
    return this.tasksService.create(serviceOrderId, dto, clientId, cu.companyId!)
  }

  @Patch(':osId/tasks/:taskId')
  @Roles(
    UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN,
    UserRole.COMPANY_MANAGER, UserRole.TECHNICIAN,
  )
  updateTask(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() cu: AuthenticatedUser,
  ) {
    return this.tasksService.update(taskId, dto, cu)
  }

  @Patch(':id/tasks/reorder')
  @HttpCode(HttpStatus.OK)
  @Roles(
    UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN,
    UserRole.COMPANY_MANAGER, UserRole.TECHNICIAN,
  )
  reorderTasks(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('id', ParseUUIDPipe) serviceOrderId: string,
    @Body() dto: ReorderTasksDto,
    @CurrentUser() cu: AuthenticatedUser,
  ) {
    return this.tasksService.reorder(serviceOrderId, dto, clientId, cu.companyId!)
  }

  @Delete(':osId/tasks/:taskId')
  @HttpCode(HttpStatus.OK)
  @Roles(
    UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER,
  )
  removeTask(@Param('taskId', ParseUUIDPipe) taskId: string) {
    return this.tasksService.remove(taskId)
  }
}