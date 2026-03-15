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
import { LocationsService } from './locations.service'
import {
    CreateLocationDto,
    UpdateLocationDto,
    ListLocationsDto,
} from './dto/location.dto'
import { CurrentUser } from '../../../common/decorators/current-user.decorator'
import { Roles } from '../../../common/decorators/roles.decorator'
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface'

// Rota aninhada: /clients/:clientId/locations
@Controller('clients/:clientId/locations')
export class LocationsController {
    constructor(private readonly locationsService: LocationsService) { }

    // GET /clients/:clientId/locations
    @Get()
    @Roles(
        UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER,
        UserRole.TECHNICIAN, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER, UserRole.CLIENT_VIEWER,
    )
    findAll(
        @Param('clientId', ParseUUIDPipe) clientId: string,
        @Query() filters: ListLocationsDto,
        @CurrentUser() currentUser: AuthenticatedUser,
    ) {
        return this.locationsService.findAll(clientId, currentUser.companyId!, filters)
    }

    // GET /clients/:clientId/locations/tree
    @Get('tree')
    @Roles(
        UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER,
        UserRole.TECHNICIAN, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER, UserRole.CLIENT_VIEWER,
    )
    findTree(
        @Param('clientId', ParseUUIDPipe) clientId: string,
        @CurrentUser() currentUser: AuthenticatedUser,
    ) {
        return this.locationsService.findTree(clientId, currentUser.companyId!)
    }

    // GET /clients/:clientId/locations/:id
    @Get(':id')
    @Roles(
        UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER,
        UserRole.TECHNICIAN, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER, UserRole.CLIENT_VIEWER,
    )
    findOne(
        @Param('clientId', ParseUUIDPipe) clientId: string,
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() currentUser: AuthenticatedUser,
    ) {
        return this.locationsService.findOne(id, clientId, currentUser.companyId!)
    }

    // POST /clients/:clientId/locations
    @Post()
    @Roles(
        UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER,
    )
    create(
        @Param('clientId', ParseUUIDPipe) clientId: string,
        @Body() dto: CreateLocationDto,
        @CurrentUser() currentUser: AuthenticatedUser,
    ) {
        return this.locationsService.create(dto, clientId, currentUser.companyId!)
    }

    // PATCH /clients/:clientId/locations/:id
    @Patch(':id')
    @Roles(
        UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER,
    )
    update(
        @Param('clientId', ParseUUIDPipe) clientId: string,
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateLocationDto,
        @CurrentUser() currentUser: AuthenticatedUser,
    ) {
        return this.locationsService.update(id, dto, clientId, currentUser.companyId!)
    }

    // DELETE /clients/:clientId/locations/:id
    @Delete(':id')
    @HttpCode(HttpStatus.OK)
    @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER)
    remove(
        @Param('clientId', ParseUUIDPipe) clientId: string,
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() currentUser: AuthenticatedUser,
    ) {
        return this.locationsService.remove(id, clientId, currentUser.companyId!)
    }
}