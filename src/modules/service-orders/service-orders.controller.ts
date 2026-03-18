import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, ParseUUIDPipe,
  HttpCode, HttpStatus, UseInterceptors,
  UploadedFiles, BadRequestException,
} from '@nestjs/common'
import { FilesInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import { UserRole, AttachmentEntity } from '@prisma/client'
import { ServiceOrdersService } from './service-orders.service'
import { CommentsService } from './comments/comments.service'
import { TasksService } from './tasks/tasks.service'
import { StorageService } from '../storage/storage.service'
import {
  CreateServiceOrderDto, UpdateServiceOrderDto,
  UpdateServiceOrderStatusDto, AssignTechnicianDto,
  ListServiceOrdersDto, ListAvailableServiceOrdersDto,
} from './dto/service-order.dto'
import { CreateCommentDto, UpdateCommentDto } from './comments/dto/comment.dto'
import { CreateTaskDto, UpdateTaskDto, ReorderTasksDto } from './tasks/dto/task.dto'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface'
import { ALLOWED_MIME_LIST } from '../storage/storage.constants'

@Controller('clients/:clientId/service-orders')
export class ServiceOrdersController {
  constructor(
    private readonly serviceOrdersService: ServiceOrdersService,
    private readonly commentsService: CommentsService,
    private readonly tasksService: TasksService,
    private readonly storageService: StorageService,
  ) { }

  // ─────────────────────────────────────────
  // Painel de OS disponíveis para assumir
  // ─────────────────────────────────────────
  @Get('available')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER, UserRole.TECHNICIAN)
  findAvailable(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Query() filters: ListAvailableServiceOrdersDto,
    @CurrentUser() cu: AuthenticatedUser,
  ) {
    return this.serviceOrdersService.findAvailable(cu.companyId!, filters, cu)
  }

  // ─────────────────────────────────────────
  // OS — CRUD
  // ─────────────────────────────────────────

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER,
    UserRole.TECHNICIAN, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER, UserRole.CLIENT_VIEWER)
  findAll(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Query() filters: ListServiceOrdersDto,
    @CurrentUser() cu: AuthenticatedUser,
  ) {
    return this.serviceOrdersService.findAll(clientId, cu.companyId!, filters, cu)
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER,
    UserRole.TECHNICIAN, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER, UserRole.CLIENT_VIEWER)
  findOne(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() cu: AuthenticatedUser,
  ) {
    return this.serviceOrdersService.findOne(id, clientId, cu.companyId!, cu)
  }

  // ─────────────────────────────────────────
  // POST /service-orders — cria OS com arquivos opcionais
  // Aceita multipart/form-data
  // ─────────────────────────────────────────
  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER,
    UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME_LIST.includes(file.mimetype)) {
          cb(null, true)
        } else {
          cb(new BadRequestException(`Tipo não permitido: ${file.mimetype}`), false)
        }
      },
    }),
  )
  async create(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Body() dto: CreateServiceOrderDto,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() cu: AuthenticatedUser,
  ) {
    const os = await this.serviceOrdersService.create(dto, clientId, cu.companyId!, cu)

    // Faz upload dos arquivos junto com a criação
    if (files?.length > 0) {
      await Promise.all(
        files.map((file) =>
          this.storageService.upload(
            file,
            { entity: AttachmentEntity.SERVICE_ORDER, entityId: os.id },
            cu.companyId!,
            clientId,
            cu,
          ),
        ),
      )
    }

    return os
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER, UserRole.TECHNICIAN)
  update(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceOrderDto,
    @CurrentUser() cu: AuthenticatedUser,
  ) {
    return this.serviceOrdersService.update(id, dto, clientId, cu.companyId!, cu)
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER,
    UserRole.TECHNICIAN, UserRole.CLIENT_ADMIN)
  updateStatus(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceOrderStatusDto,
    @CurrentUser() cu: AuthenticatedUser,
  ) {
    return this.serviceOrdersService.updateStatus(id, dto, clientId, cu.companyId!, cu)
  }

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
  // Técnicos
  // ─────────────────────────────────────────

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
  // Comentários — com upload de arquivos
  // ─────────────────────────────────────────

  @Post(':id/comments')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER,
    UserRole.TECHNICIAN, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)
  @UseInterceptors(
    FilesInterceptor('files', 5, {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME_LIST.includes(file.mimetype)) cb(null, true)
        else cb(new BadRequestException(`Tipo não permitido: ${file.mimetype}`), false)
      },
    }),
  )
  async createComment(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('id', ParseUUIDPipe) serviceOrderId: string,
    @Body() dto: CreateCommentDto,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() cu: AuthenticatedUser,
  ) {
    const comment = await this.commentsService.create(serviceOrderId, dto, clientId, cu.companyId!, cu)

    // Upload de arquivos anexados ao comentário
    if (files?.length > 0) {
      await Promise.all(
        files.map((file) =>
          this.storageService.upload(
            file,
            { entity: AttachmentEntity.COMMENT, entityId: comment.id },
            cu.companyId!,
            clientId,
            cu,
          ),
        ),
      )
    }

    return comment
  }

  @Patch(':osId/comments/:commentId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER,
    UserRole.TECHNICIAN, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)
  updateComment(
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Body() dto: UpdateCommentDto,
    @CurrentUser() cu: AuthenticatedUser,
  ) {
    return this.commentsService.update(commentId, dto, cu)
  }

  @Delete(':osId/comments/:commentId')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER,
    UserRole.TECHNICIAN, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)
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
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER,
    UserRole.TECHNICIAN, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER, UserRole.CLIENT_VIEWER)
  findTasks(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('id', ParseUUIDPipe) serviceOrderId: string,
    @CurrentUser() cu: AuthenticatedUser,
  ) {
    return this.tasksService.findAll(serviceOrderId, clientId, cu.companyId!)
  }

  @Post(':id/tasks')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER, UserRole.TECHNICIAN)
  createTask(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('id', ParseUUIDPipe) serviceOrderId: string,
    @Body() dto: CreateTaskDto,
    @CurrentUser() cu: AuthenticatedUser,
  ) {
    return this.tasksService.create(serviceOrderId, dto, clientId, cu.companyId!)
  }

  @Patch(':osId/tasks/:taskId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER, UserRole.TECHNICIAN)
  updateTask(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() cu: AuthenticatedUser,
  ) {
    return this.tasksService.update(taskId, dto, cu)
  }

  @Patch(':id/tasks/reorder')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER, UserRole.TECHNICIAN)
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
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER)
  removeTask(@Param('taskId', ParseUUIDPipe) taskId: string) {
    return this.tasksService.remove(taskId)
  }
}