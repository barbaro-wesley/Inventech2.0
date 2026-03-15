import {
    Controller, Get, Post, Body, Param, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { MovementsService } from './movements.service'
import { CreateMovementDto, ReturnMovementDto } from './dto/movement.dto'
import { CurrentUser } from '../../../common/decorators/current-user.decorator'
import { Roles } from '../../../common/decorators/roles.decorator'
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface'

@Controller('clients/:clientId/equipment/:equipmentId/movements')
export class MovementsController {
    constructor(private readonly movementsService: MovementsService) { }

    // GET /clients/:clientId/equipment/:equipmentId/movements
    @Get()
    @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER,
        UserRole.TECHNICIAN, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER, UserRole.CLIENT_VIEWER)
    findAll(
        @Param('clientId', ParseUUIDPipe) clientId: string,
        @Param('equipmentId', ParseUUIDPipe) equipmentId: string,
        @CurrentUser() cu: AuthenticatedUser,
    ) {
        return this.movementsService.findAll(equipmentId, clientId, cu.companyId!)
    }

    // POST /clients/:clientId/equipment/:equipmentId/movements
    @Post()
    @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER)
    create(
        @Param('clientId', ParseUUIDPipe) clientId: string,
        @Param('equipmentId', ParseUUIDPipe) equipmentId: string,
        @Body() dto: CreateMovementDto,
        @CurrentUser() cu: AuthenticatedUser,
    ) {
        return this.movementsService.create(equipmentId, dto, clientId, cu.companyId!, cu)
    }

    // POST /clients/:clientId/equipment/:equipmentId/movements/:id/return
    @Post(':id/return')
    @HttpCode(HttpStatus.OK)
    @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER)
    returnEquipment(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: ReturnMovementDto,
        @CurrentUser() cu: AuthenticatedUser,
    ) {
        return this.movementsService.returnEquipment(id, dto, cu.companyId!, cu)
    }
}