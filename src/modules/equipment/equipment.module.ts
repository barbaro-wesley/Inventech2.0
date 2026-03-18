import { Module } from '@nestjs/common'

// Equipment principal
import { EquipmentService } from './equipment.service'
import { EquipmentController } from './equipment.controller'

// Locations
import { LocationsService } from './locations/locations.service'
import { LocationsController } from './locations/locations.controller'

// Cost Centers
import { CostCentersService } from './cost-centers/cost-centers.service'
import { CostCentersController } from './cost-centers/cost-centers.controller'

// Equipment Types
import { EquipmentTypesService } from './equipment-types/equipment-types.service'
import { EquipmentTypesController } from './equipment-types/equipment-types.controller'

// Movements
import { MovementsService } from './movement/movements.service'
import { MovementsController } from './movement/movements.controller'
import { StorageModule } from '../storage/storage.module'
@Module({
    imports: [StorageModule],
    controllers: [
        EquipmentController,
        LocationsController,
        CostCentersController,
        EquipmentTypesController,
        MovementsController,
    ],
    providers: [
        EquipmentService,
        LocationsService,
        CostCentersService,
        EquipmentTypesService,
        MovementsService,
    ],
    exports: [EquipmentService],
})
export class EquipmentModule { }