import {
    Controller, Get, Post, Patch, Delete,
    Body, Param, Query, ParseUUIDPipe,
    HttpCode, HttpStatus,
} from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { EquipmentService } from './equipment.service'
import { CreateEquipmentDto, UpdateEquipmentDto, ListEquipmentsDto } from './dto/equipment.dto'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface'

@Controller('clients/:clientId/equipment')
export class EquipmentController {
    constructor(private readonly equipmentService: EquipmentService) { }

    @Get()
    @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER,
        UserRole.TECHNICIAN, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER, UserRole.CLIENT_VIEWER)
    findAll(
        @Param('clientId', ParseUUIDPipe) clientId: string,
        @Query() filters: ListEquipmentsDto,
        @CurrentUser() cu: AuthenticatedUser,
    ) {
        return this.equipmentService.findAll(clientId, cu.companyId!, filters)
    }

    @Get(':id')
    @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER,
        UserRole.TECHNICIAN, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER, UserRole.CLIENT_VIEWER)
    findOne(
        @Param('clientId', ParseUUIDPipe) clientId: string,
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() cu: AuthenticatedUser,
    ) {
        return this.equipmentService.findOne(id, clientId, cu.companyId!)
    }

    @Post()
    @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER)
    create(
        @Param('clientId', ParseUUIDPipe) clientId: string,
        @Body() dto: CreateEquipmentDto,
        @CurrentUser() cu: AuthenticatedUser,
    ) {
        return this.equipmentService.create(dto, clientId, cu.companyId!, cu)
    }

    @Patch(':id')
    @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER)
    update(
        @Param('clientId', ParseUUIDPipe) clientId: string,
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateEquipmentDto,
        @CurrentUser() cu: AuthenticatedUser,
    ) {
        return this.equipmentService.update(id, dto, clientId, cu.companyId!)
    }

    @Delete(':id')
    @HttpCode(HttpStatus.OK)
    @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER)
    remove(
        @Param('clientId', ParseUUIDPipe) clientId: string,
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() cu: AuthenticatedUser,
    ) {
        return this.equipmentService.remove(id, clientId, cu.companyId!)
    }

    // POST /clients/:clientId/equipment/:id/depreciation
    @Post(':id/depreciation')
    @HttpCode(HttpStatus.OK)
    @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER)
    recalculateDepreciation(
        @Param('clientId', ParseUUIDPipe) clientId: string,
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() cu: AuthenticatedUser,
    ) {
        return this.equipmentService.recalculateDepreciation(id, clientId, cu.companyId!)
    }
}