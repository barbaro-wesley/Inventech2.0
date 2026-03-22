import { Module } from '@nestjs/common'
import { CompaniesService } from './companies.service'
import { CompaniesController } from './companies.controller'
import { CompaniesRepository } from './companies.repository'
import { LicenseService } from './license.service'
import { StorageModule } from '../storage/storage.module'

@Module({
  imports: [StorageModule],
  controllers: [CompaniesController],
  providers: [CompaniesService, CompaniesRepository, LicenseService],
  exports: [CompaniesService, CompaniesRepository, LicenseService],
})
export class CompaniesModule {}