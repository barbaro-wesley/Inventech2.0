import { Module } from '@nestjs/common'
import { CompaniesService } from './companies.service'
import { CompaniesController } from './companies.controller'
import { CompaniesRepository } from './companies.repository'
import { StorageModule } from '../storage/storage.module'
@Module({
  imports: [
    StorageModule,
  ],
  controllers: [CompaniesController],
  providers: [CompaniesService, CompaniesRepository],
  exports: [CompaniesService, CompaniesRepository],
})
export class CompaniesModule { }