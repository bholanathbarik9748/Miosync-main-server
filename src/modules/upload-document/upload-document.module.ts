import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { UploadDocumentController } from './upload-document.controller';
import { UploadDocumentService } from './upload-document.service';
import { UploadDocument } from './upload-document.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UploadDocument]),
    ConfigModule,
    AuthModule,
  ],
  controllers: [UploadDocumentController],
  providers: [UploadDocumentService],
  exports: [UploadDocumentService],
})
export class UploadDocumentModule {}
