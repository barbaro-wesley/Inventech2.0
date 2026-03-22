import { Module } from '@nestjs/common'
import { ReportsService } from './reports.service'
import { ReportsController } from './reports.controller'
import { ReportPermissionsService } from './report-permissions.service'
import { CompaniesModule } from '../companies/companies.module'

@Module({
  imports: [CompaniesModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportPermissionsService],
  exports: [ReportPermissionsService],
})
export class ReportsModule { }