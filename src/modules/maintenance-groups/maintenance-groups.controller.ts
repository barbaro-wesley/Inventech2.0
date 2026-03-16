import {
    Controller, Get, Post, Patch, Delete,
    Body, Param, Query, ParseUUIDPipe,
    HttpCode, HttpStatus,
} from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { MaintenanceGroupsService } from './maintenance-groups.service'
import {
    CreateMaintenanceGroupDto,
    UpdateMaintenanceGroupDto,
    ListMaintenanceGroupsDto,
    AssignTechnicianToGroupDto,
} from './dto/maintenance-group.dto'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface'

@Controller('maintenance-groups')
export class MaintenanceGroupsController {
    constructor(private readonly maintenanceGroupsService: MaintenanceGroupsService) { }

    // GET /maintenance-groups
    @Get()
    @Roles(
        UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER,
        UserRole.TECHNICIAN, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER, UserRole.CLIENT_VIEWER,
    )
    findAll(@Query() filters: ListMaintenanceGroupsDto, @CurrentUser() cu: AuthenticatedUser) {
        return this.maintenanceGroupsService.findAll(cu.companyId!, filters)
    }

    // GET /maintenance-groups/:id
    @Get(':id')
    @Roles(
        UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER,
        UserRole.TECHNICIAN,
    )
    findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() cu: AuthenticatedUser) {
        return this.maintenanceGroupsService.findOne(id, cu.companyId!)
    }

    // POST /maintenance-groups
    @Post()
    @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER)
    create(@Body() dto: CreateMaintenanceGroupDto, @CurrentUser() cu: AuthenticatedUser) {
        return this.maintenanceGroupsService.create(dto, cu.companyId!)
    }

    // PATCH /maintenance-groups/:id
    @Patch(':id')
    @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER)
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateMaintenanceGroupDto,
        @CurrentUser() cu: AuthenticatedUser,
    ) {
        return this.maintenanceGroupsService.update(id, dto, cu.companyId!)
    }

    // DELETE /maintenance-groups/:id
    @Delete(':id')
    @HttpCode(HttpStatus.OK)
    @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
    remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() cu: AuthenticatedUser) {
        return this.maintenanceGroupsService.remove(id, cu.companyId!)
    }

    // ─────────────────────────────────────────
    // Técnicos do grupo
    // ─────────────────────────────────────────

    // POST /maintenance-groups/:id/technicians
    @Post(':id/technicians')
    @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER)
    assignTechnician(
        @Param('id', ParseUUIDPipe) groupId: string,
        @Body() dto: AssignTechnicianToGroupDto,
        @CurrentUser() cu: AuthenticatedUser,
    ) {
        return this.maintenanceGroupsService.assignTechnician(groupId, dto, cu.companyId!)
    }

    // DELETE /maintenance-groups/:id/technicians/:technicianId
    @Delete(':id/technicians/:technicianId')
    @HttpCode(HttpStatus.OK)
    @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER)
    removeTechnician(
        @Param('id', ParseUUIDPipe) groupId: string,
        @Param('technicianId', ParseUUIDPipe) technicianId: string,
        @CurrentUser() cu: AuthenticatedUser,
    ) {
        return this.maintenanceGroupsService.removeTechnician(groupId, technicianId, cu.companyId!)
    }

    // GET /maintenance-groups/technician/:technicianId
    // Lista todos os grupos de um técnico específico
    @Get('technician/:technicianId')
    @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER, UserRole.TECHNICIAN)
    findTechnicianGroups(
        @Param('technicianId', ParseUUIDPipe) technicianId: string,
        @CurrentUser() cu: AuthenticatedUser,
    ) {
        return this.maintenanceGroupsService.findTechnicianGroups(technicianId, cu.companyId!)
    }
}