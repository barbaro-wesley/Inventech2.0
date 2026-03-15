import {
    Controller, Get, Post, Patch, Delete,
    Body, Param, Query, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { EquipmentTypesService } from './equipment-types.service'
import {
    CreateEquipmentTypeDto, UpdateEquipmentTypeDto,
    CreateEquipmentSubtypeDto, UpdateEquipmentSubtypeDto,
    ListEquipmentTypesDto,
} from './dto/equipment-type.dto'
import { CurrentUser } from '../../../common/decorators/current-user.decorator'
import { Roles } from '../../../common/decorators/roles.decorator'
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface'

// Tipos são da empresa — não do cliente
@Controller('equipment-types')
export class EquipmentTypesController {
    constructor(private readonly equipmentTypesService: EquipmentTypesService) { }

    // ── Tipos ──────────────────────────────────────────

    @Get()
    @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER,
        UserRole.TECHNICIAN, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER, UserRole.CLIENT_VIEWER)
    findAll(@Query() filters: ListEquipmentTypesDto, @CurrentUser() cu: AuthenticatedUser) {
        return this.equipmentTypesService.findAllTypes(cu.companyId!, filters)
    }

    @Get(':id')
    @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER,
        UserRole.TECHNICIAN, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER, UserRole.CLIENT_VIEWER)
    findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() cu: AuthenticatedUser) {
        return this.equipmentTypesService.findOneType(id, cu.companyId!)
    }

    @Post()
    @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER)
    createType(@Body() dto: CreateEquipmentTypeDto, @CurrentUser() cu: AuthenticatedUser) {
        return this.equipmentTypesService.createType(dto, cu.companyId!)
    }

    @Patch(':id')
    @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER)
    updateType(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateEquipmentTypeDto,
        @CurrentUser() cu: AuthenticatedUser,
    ) {
        return this.equipmentTypesService.updateType(id, dto, cu.companyId!)
    }

    @Delete(':id')
    @HttpCode(HttpStatus.OK)
    @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
    removeType(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() cu: AuthenticatedUser) {
        return this.equipmentTypesService.removeType(id, cu.companyId!)
    }

    // ── Subtipos ───────────────────────────────────────

    @Post('subtypes')
    @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER)
    createSubtype(@Body() dto: CreateEquipmentSubtypeDto, @CurrentUser() cu: AuthenticatedUser) {
        return this.equipmentTypesService.createSubtype(dto, cu.companyId!)
    }

    @Patch('subtypes/:id')
    @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER)
    updateSubtype(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateEquipmentSubtypeDto,
        @CurrentUser() cu: AuthenticatedUser,
    ) {
        return this.equipmentTypesService.updateSubtype(id, dto, cu.companyId!)
    }

    @Delete('subtypes/:id')
    @HttpCode(HttpStatus.OK)
    @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
    removeSubtype(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() cu: AuthenticatedUser) {
        return this.equipmentTypesService.removeSubtype(id, cu.companyId!)
    }
}