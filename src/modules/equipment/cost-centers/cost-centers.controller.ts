import {
    Controller, Get, Post, Patch, Delete,
    Body, Param, Query, ParseUUIDPipe,
    HttpCode, HttpStatus,
} from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { CostCentersService } from './cost-centers.service'
import { CreateCostCenterDto, UpdateCostCenterDto, ListCostCentersDto } from './dto/cost-center.dto'
import { CurrentUser } from '../../../common/decorators/current-user.decorator'
import { Roles } from '../../../common/decorators/roles.decorator'
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface'

@Controller('clients/:clientId/cost-centers')
export class CostCentersController {
    constructor(private readonly costCentersService: CostCentersService) { }

    @Get()
    @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER,
        UserRole.TECHNICIAN, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER, UserRole.CLIENT_VIEWER)
    findAll(
        @Param('clientId', ParseUUIDPipe) clientId: string,
        @Query() filters: ListCostCentersDto,
        @CurrentUser() currentUser: AuthenticatedUser,
    ) {
        return this.costCentersService.findAll(clientId, currentUser.companyId!, filters)
    }

    @Get(':id')
    @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER,
        UserRole.TECHNICIAN, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER, UserRole.CLIENT_VIEWER)
    findOne(
        @Param('clientId', ParseUUIDPipe) clientId: string,
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() currentUser: AuthenticatedUser,
    ) {
        return this.costCentersService.findOne(id, clientId, currentUser.companyId!)
    }

    @Post()
    @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER)
    create(
        @Param('clientId', ParseUUIDPipe) clientId: string,
        @Body() dto: CreateCostCenterDto,
        @CurrentUser() currentUser: AuthenticatedUser,
    ) {
        return this.costCentersService.create(dto, clientId, currentUser.companyId!)
    }

    @Patch(':id')
    @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER)
    update(
        @Param('clientId', ParseUUIDPipe) clientId: string,
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateCostCenterDto,
        @CurrentUser() currentUser: AuthenticatedUser,
    ) {
        return this.costCentersService.update(id, dto, clientId, currentUser.companyId!)
    }

    @Delete(':id')
    @HttpCode(HttpStatus.OK)
    @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER)
    remove(
        @Param('clientId', ParseUUIDPipe) clientId: string,
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() currentUser: AuthenticatedUser,
    ) {
        return this.costCentersService.remove(id, clientId, currentUser.companyId!)
    }
}