import {
    Controller, Get, Post, Patch, Delete,
    Body, Param, Query, ParseUUIDPipe,
    HttpCode, HttpStatus,
} from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { MaintenanceService } from './maintenance.service'
import {
    CreateMaintenanceDto,
    UpdateMaintenanceDto,
    ListMaintenancesDto,
    CreateScheduleDto,
    UpdateScheduleDto,
    ListSchedulesDto,
} from './dto/maintenance.dto'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface'

// ─────────────────────────────────────────
// Manutenções avulsas
// /clients/:clientId/maintenances
// ─────────────────────────────────────────
@Controller('clients/:clientId/maintenances')
export class MaintenanceController {
    constructor(private readonly maintenanceService: MaintenanceService) { }

    @Get()
    @Roles(
        UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER,
        UserRole.TECHNICIAN, UserRole.CLIENT_ADMIN, UserRole.CLIENT_VIEWER,
    )
    findAll(
        @Param('clientId', ParseUUIDPipe) clientId: string,
        @Query() filters: ListMaintenancesDto,
        @CurrentUser() cu: AuthenticatedUser,
    ) {
        return this.maintenanceService.findAllMaintenances(clientId, cu.companyId!, filters)
    }

    @Get(':id')
    @Roles(
        UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER,
        UserRole.TECHNICIAN, UserRole.CLIENT_ADMIN, UserRole.CLIENT_VIEWER,
    )
    findOne(
        @Param('clientId', ParseUUIDPipe) clientId: string,
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() cu: AuthenticatedUser,
    ) {
        return this.maintenanceService.findOneMaintenance(id, clientId, cu.companyId!)
    }

    @Post()
    @Roles(
        UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER,
    )
    create(
        @Param('clientId', ParseUUIDPipe) clientId: string,
        @Body() dto: CreateMaintenanceDto,
        @CurrentUser() cu: AuthenticatedUser,
    ) {
        return this.maintenanceService.createMaintenance(dto, clientId, cu.companyId!, cu)
    }

    @Patch(':id')
    @Roles(
        UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER,
        UserRole.TECHNICIAN,
    )
    update(
        @Param('clientId', ParseUUIDPipe) clientId: string,
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateMaintenanceDto,
        @CurrentUser() cu: AuthenticatedUser,
    ) {
        return this.maintenanceService.updateMaintenance(id, dto, clientId, cu.companyId!)
    }
}

// ─────────────────────────────────────────
// Agendamentos de preventivas
// /clients/:clientId/maintenance-schedules
// ─────────────────────────────────────────
@Controller('clients/:clientId/maintenance-schedules')
export class ScheduleController {
    constructor(private readonly maintenanceService: MaintenanceService) { }

    @Get()
    @Roles(
        UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER,
        UserRole.TECHNICIAN, UserRole.CLIENT_ADMIN, UserRole.CLIENT_VIEWER,
    )
    findAll(
        @Param('clientId', ParseUUIDPipe) clientId: string,
        @Query() filters: ListSchedulesDto,
        @CurrentUser() cu: AuthenticatedUser,
    ) {
        return this.maintenanceService.findAllSchedules(clientId, cu.companyId!, filters)
    }

    @Get(':id')
    @Roles(
        UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER,
        UserRole.TECHNICIAN, UserRole.CLIENT_ADMIN, UserRole.CLIENT_VIEWER,
    )
    findOne(
        @Param('clientId', ParseUUIDPipe) clientId: string,
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() cu: AuthenticatedUser,
    ) {
        return this.maintenanceService.findOneSchedule(id, clientId, cu.companyId!)
    }

    @Post()
    @Roles(
        UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER,
    )
    create(
        @Param('clientId', ParseUUIDPipe) clientId: string,
        @Body() dto: CreateScheduleDto,
        @CurrentUser() cu: AuthenticatedUser,
    ) {
        return this.maintenanceService.createSchedule(dto, clientId, cu.companyId!, cu)
    }

    @Patch(':id')
    @Roles(
        UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER,
    )
    update(
        @Param('clientId', ParseUUIDPipe) clientId: string,
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateScheduleDto,
        @CurrentUser() cu: AuthenticatedUser,
    ) {
        return this.maintenanceService.updateSchedule(id, dto, clientId, cu.companyId!)
    }

    @Delete(':id')
    @HttpCode(HttpStatus.OK)
    @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER)
    remove(
        @Param('clientId', ParseUUIDPipe) clientId: string,
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() cu: AuthenticatedUser,
    ) {
        return this.maintenanceService.removeSchedule(id, clientId, cu.companyId!)
    }

    // POST /clients/:clientId/maintenance-schedules/trigger
    // Dispara geração manualmente (útil para testes e admin)
    @Post('trigger')
    @HttpCode(HttpStatus.OK)
    @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
    triggerGeneration() {
        return this.maintenanceService.triggerGeneration()
    }
}