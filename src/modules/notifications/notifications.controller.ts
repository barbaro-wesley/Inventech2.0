import {
  Controller, Get, Patch, Param,
  Query, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common'
import { NotificationsService } from './notifications.service'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface'
import { IsInt, IsOptional, Min, Max } from 'class-validator'
import { Type } from 'class-transformer'

class ListNotificationsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt() @Min(1)
  page?: number = 1

  @IsOptional()
  @Type(() => Number)
  @IsInt() @Min(1) @Max(100)
  limit?: number = 20
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) { }

  // GET /notifications — notificações do usuário logado
  @Get()
  findAll(
    @Query() query: ListNotificationsDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.notificationsService.findUserNotifications(
      currentUser.sub,
      query.page,
      query.limit,
    )
  }

  // PATCH /notifications/:id/read — marca uma notificação como lida
  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  markAsRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.notificationsService.markAsRead(id, currentUser.sub)
  }

  // PATCH /notifications/read-all — marca todas como lidas
  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  markAllAsRead(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.notificationsService.markAllAsRead(currentUser.sub)
  }
}