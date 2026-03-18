import { Module } from '@nestjs/common'
import { MulterModule } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import { StorageService } from './storage.service'
import { StorageController } from './storage.controller'

@Module({
  imports: [
    // Usa memória — o arquivo vai direto para o MinIO sem tocar o disco
    MulterModule.register({
      storage: memoryStorage(),
    }),
  ],
  controllers: [StorageController],
  providers: [StorageService],
  exports: [StorageService], // Exporta para outros módulos usarem (ex: NotificationsModule)
})
export class StorageModule {}