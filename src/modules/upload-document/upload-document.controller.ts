import {
  Body,
  Controller,
  Post,
  ValidationPipe,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadDocumentService } from './upload-document.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserType } from '../../utils/enums';
import { multerConfig } from './config/multer.config';

@Controller('/upload-document')
export class UploadDocumentController {
  constructor(private readonly uploadDocumentService: UploadDocumentService) {}

  @Post('')
  @Roles(UserType.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('file', multerConfig))
  async uploadDocument(
    @UploadedFile() file: Express.Multer.File,
    @Body(ValidationPipe) body: UploadDocumentDto,
  ): Promise<any> {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    return await this.uploadDocumentService.uploadFile(
      file,
      body.autoDeleteDate,
    );
  }
}
