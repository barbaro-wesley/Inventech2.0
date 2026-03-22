import { Module } from '@nestjs/common'
import { ReportsService } from './reports.service'
import { ReportsController } from './reports.controller'
import { CompaniesModule } from '../companies/companies.module'

@Module({
  imports: [CompaniesModule], // Para buscar logo e cores da empresa
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule { }