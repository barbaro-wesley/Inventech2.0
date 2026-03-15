import { Module } from '@nestjs/common'
import { ServiceOrdersService } from './service-orders.service'
import { ServiceOrdersController } from './service-orders.controller.js'
import { CommentsService } from './comments/comments.service.js'
import { TasksService } from './tasks/tasks.service.js'

@Module({
    controllers: [ServiceOrdersController],
    providers: [
        ServiceOrdersService,
        CommentsService,
        TasksService,
    ],
    exports: [ServiceOrdersService],
})
export class ServiceOrdersModule { }