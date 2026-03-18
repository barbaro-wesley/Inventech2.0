import { Module } from '@nestjs/common'
import { ServiceOrdersService } from './service-orders.service'
import { ServiceOrdersController } from './service-orders.controller'
import { CommentsService } from './comments/comments.service'
import { TasksService } from './tasks/tasks.service'
import { StorageModule } from '../storage/storage.module'
import { NotificationsModule } from '../notifications/notifications.module'

@Module({
    imports: [
        StorageModule,
        NotificationsModule,
    ],
    controllers: [ServiceOrdersController],
    providers: [
        ServiceOrdersService,
        CommentsService,
        TasksService,
    ],
    exports: [ServiceOrdersService],
})
export class ServiceOrdersModule { }